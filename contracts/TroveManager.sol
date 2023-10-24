// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/ITroveManager.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IBaseFeeLMAToken.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/IHOGToken.sol";
import "./interfaces/IHOGStaking.sol";
import "./interfaces/IFeesRouter.sol";
import "./dependencies/HedgehogBase.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "hardhat/console.sol";

/**
 * @notice Fork of Liquity's TroveManager. Most of the Logic remains unchanged.
 * Changes to the contract:
 * - Raised pragma version
 * - Removed an import of ActivePool Interface
 * - Logic updates with redemption & borrowing fees calculation and their distribution
 * Even though SafeMath is no longer required, the decision was made to keep it to avoid human factor errors
 */

contract TroveManager is HedgehogBase, Ownable, CheckContract {
    using SafeMath for uint256;
    string public constant NAME = "TroveManager";

    // --- Connected contract declarations ---

    address public borrowerOperationsAddress;

    IStabilityPool public stabilityPool;

    address gasPoolAddress;

    ICollSurplusPool collSurplusPool;

    IBaseFeeLMAToken public baseFeeLMAToken;

    IHOGToken public hogToken;

    IHOGStaking public hogStaking;

    IFeesRouter public feesRouter;

    // A doubly linked list of Troves, sorted by their sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    // --- Data structures ---

    uint public constant SECONDS_IN_ONE_MINUTE = 60;
    /*
     * Half-life of 12h. 12h = 720 min
     * (1/2) = d^720 => d = (1/2)^(1/720)
     */
    uint public constant MINUTE_DECAY_REDEMPTION_FACTOR = 999037758833783000;
    uint public constant MINUTE_DECAY_BORROWING_FACTOR = 991152865945140000;
    uint public constant REDEMPTION_FEE_FLOOR = (DECIMAL_PRECISION / 1000) * 5; // 0.5%
    uint public constant MAX_BORROWING_FEE = DECIMAL_PRECISION; // 100%

    // During bootsrap period redemptions are not allowed
    uint public constant BOOTSTRAP_PERIOD = 14 days;

    /*
     * BETA: 18 digit decimal. Parameter by which to divide the redeemed fraction, in order to calc the new base rate from a redemption.
     * Corresponds to (1 / ALPHA) in the white paper.
     */
    uint public constant BETA = 2;

    // HEDGEHOG LOGIC UPDATES: BaseRate is different for redemption and minting tokens
    // 1) Remove baseRate variable
    // 2) Create redemptionBaseRate public state variable
    // 3) Create borrowBaseRate public state variable
    uint public redemptionBaseRate;
    uint public borrowBaseRate;

    // HEDGEHOG LOGIC UPDATES: lastFeeOperationTime is different for redemption and minting tokens
    // 1) Remove lastFeeOperationTime variable
    // 2) Create lastRedemptionTime public state variable
    // 3) Create lastBorrowTime public state variable
    uint public lastRedemptionTime;
    uint public lastBorrowTime;

    enum Status {
        nonExistent,
        active,
        closedByOwner,
        closedByLiquidation,
        closedByRedemption
    }

    // Store the necessary data for a trove
    struct Trove {
        uint debt;
        uint coll;
        uint stake;
        Status status;
        uint128 arrayIndex;
    }

    mapping(address => Trove) public Troves;

    uint public totalStakes;

    // Snapshot of the value of totalStakes, taken immediately after the latest liquidation
    uint public totalStakesSnapshot;

    // Snapshot of the total collateral across the ActivePool and DefaultPool, immediately after the latest liquidation.
    uint public totalCollateralSnapshot;

    /*
     * L_StETH and L_BaseFeeLMADebt track the sums of accumulated liquidation rewards per unit staked. During its lifetime, each stake earns:
     *
     * An StETH gain of ( stake * [L_StETH - L_StETH(0)] )
     * A BaseFeeLMADebt increase  of ( stake * [L_BaseFeeLMADebt - L_BaseFeeLMADebt(0)] )
     *
     * Where L_StETH(0) and L_BaseFeeLMADebt(0) are snapshots of L_StETH and L_BaseFeeLMADebt for the active Trove taken at the instant the stake was made
     */
    uint public L_StETH;
    uint public L_BaseFeeLMADebt;

    // Map addresses with active troves to their RewardSnapshot
    mapping(address => RewardSnapshot) public rewardSnapshots;

    // Object containing the StETH and BaseFeeLMA snapshots for a given active trove
    struct RewardSnapshot {
        uint StETH;
        uint BaseFeeLMADebt;
    }

    // Array of all active trove addresses - used to to compute an approximate hint off-chain, for the sorted list insertion
    address[] public TroveOwners;

    // Error trackers for the trove redistribution calculation
    uint public lastStETHError_Redistribution;
    uint public lastBaseFeeLMADebtError_Redistribution;

    /*
     * --- Variable container structs for liquidations ---
     *
     * These structs are used to hold, return and assign variables inside the liquidation functions,
     * in order to avoid the error: "CompilerError: Stack too deep".
     **/

    struct LocalVariables_OuterLiquidationFunction {
        uint price;
        uint BaseFeeLMAInStabPool;
        bool recoveryModeAtStart;
        uint liquidatedDebt;
        uint liquidatedColl;
    }

    struct LocalVariables_InnerSingleLiquidateFunction {
        uint collToLiquidate;
        uint pendingDebtReward;
        uint pendingCollReward;
    }

    struct LocalVariables_LiquidationSequence {
        uint remainingBaseFeeLMAInStabPool;
        uint i;
        uint ICR;
        address user;
        bool backToNormalMode;
        uint entireSystemDebt;
        uint entireSystemColl;
    }

    struct LiquidationValues {
        uint entireTroveDebt;
        uint entireTroveColl;
        uint collGasCompensation;
        uint BaseFeeLMAGasCompensation;
        uint debtToOffset;
        uint collToSendToSP;
        uint debtToRedistribute;
        uint collToRedistribute;
        uint collSurplus;
    }

    struct LiquidationTotals {
        uint totalCollInSequence;
        uint totalDebtInSequence;
        uint totalCollGasCompensation;
        uint totalBaseFeeLMAGasCompensation;
        uint totalDebtToOffset;
        uint totalCollToSendToSP;
        uint totalDebtToRedistribute;
        uint totalCollToRedistribute;
        uint totalCollSurplus;
    }

    struct ContractsCache {
        IActivePool activePool;
        IDefaultPool defaultPool;
        IBaseFeeLMAToken baseFeeLMAToken;
        IHOGStaking hogStaking;
        ISortedTroves sortedTroves;
        ICollSurplusPool collSurplusPool;
        address gasPoolAddress;
    }
    // --- Variable container structs for redemptions ---

    struct RedemptionTotals {
        uint remainingBaseFeeLMA;
        uint totalBaseFeeLMAToRedeem;
        uint totalStETHDrawn;
        uint StETHFee;
        uint StETHToSendToRedeemer;
        // HEDGEHOG LOGIC UPDATES: BaseRate is different for redemption and minting tokens
        // Rename decayedBaseRate into decayedRedemptionBaseRate
        uint decayedRedemptionBaseRate;
        uint price;
        uint totalBaseFeeLMASupplyAtStart;
    }

    struct SingleRedemptionValues {
        uint BaseFeeLMALot;
        uint StETHLot;
        bool cancelledPartial;
    }

    // --- Events ---

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event BaseFeeLMATokenAddressChanged(address _newBaseFeeLMATokenAddress);
    event ActivePoolAddressChanged(address _activePoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);
    event GasPoolAddressChanged(address _gasPoolAddress);
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event HOGTokenAddressChanged(address _hogTokenAddress);
    event HOGStakingAddressChanged(address _hogStakingAddress);
    event FeesRouterAddressUpdated(IFeesRouter _feesRouter);

    event Liquidation(
        uint _liquidatedDebt,
        uint _liquidatedColl,
        uint _collGasCompensation,
        uint _BaseFeeLMAGasCompensation
    );
    event Redemption(
        uint _attemptedBaseFeeLMAAmount,
        uint _actualBaseFeeLMAAmount,
        uint _StETHSent,
        uint _StETHFee
    );
    event TroveUpdated(
        address indexed _borrower,
        uint _debt,
        uint _coll,
        uint _stake,
        TroveManagerOperation _operation
    );
    event TroveLiquidated(
        address indexed _borrower,
        uint _debt,
        uint _coll,
        TroveManagerOperation _operation
    );

    // HEDGEHOG LOGIC UPDATES: BaseRate is different for redemption and minting tokens
    // 1) Remove BaseRateUpdated event
    // 2) Create RedemptionBaseRateUpdated event that accepts _redemptionBaseRate
    // 3) Create BorrowBaseRateUpdated event that accepts _borrowBaseRate
    event RedemptionBaseRateUpdated(uint _redemptionBaseRate);
    event BorrowBaseRateUpdated(uint _borrowBaseRate);

    // HEDGEHOG LOGIC UPDATES: BaseRate is different for redemption and minting tokens
    // 1) Remove LastFeeOpTimeUpdated event
    // 2) Create LastRedemptionTimeUpdated event that accepts _lastRedemptionTime
    // 3) Create LastBorrowTimeUpdated event that accepts _lastBorrowTime
    event LastRedemptionTimeUpdated(uint _lastRedemptionTime);
    event LastBorrowTimeUpdated(uint _lastBorrowTime);
    event TotalStakesUpdated(uint _newTotalStakes);
    event SystemSnapshotsUpdated(
        uint _totalStakesSnapshot,
        uint _totalCollateralSnapshot
    );
    event LTermsUpdated(uint _L_StETH, uint _L_BaseFeeLMADebt);
    event TroveSnapshotsUpdated(uint _L_StETH, uint _L_BaseFeeLMADebt);
    event TroveIndexUpdated(address _borrower, uint _newIndex);

    enum TroveManagerOperation {
        applyPendingRewards,
        liquidateInNormalMode,
        liquidateInRecoveryMode,
        redeemCollateral
    }

    // --- Dependency setter ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _baseFeeLMATokenAddress,
        address _sortedTrovesAddress,
        address _hogTokenAddress,
        address _hogStakingAddress,
        IFeesRouter _feesRouterAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_priceFeedAddress);
        checkContract(_baseFeeLMATokenAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_hogTokenAddress);
        checkContract(_hogStakingAddress);
        checkContract(address(_feesRouterAddress));

        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePool = IActivePool(_activePoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        stabilityPool = IStabilityPool(_stabilityPoolAddress);
        gasPoolAddress = _gasPoolAddress;
        collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        baseFeeLMAToken = IBaseFeeLMAToken(_baseFeeLMATokenAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        hogToken = IHOGToken(_hogTokenAddress);
        hogStaking = IHOGStaking(_hogStakingAddress);
        feesRouter = IFeesRouter(_feesRouterAddress);

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit BaseFeeLMATokenAddressChanged(_baseFeeLMATokenAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit HOGTokenAddressChanged(_hogTokenAddress);
        emit HOGStakingAddressChanged(_hogStakingAddress);
        emit FeesRouterAddressUpdated(_feesRouterAddress);

        renounceOwnership();
    }

    // --- Getters ---

    function getTroveOwnersCount() external view returns (uint) {
        return TroveOwners.length;
    }

    function getTroveFromTroveOwnersArray(
        uint _index
    ) external view returns (address) {
        return TroveOwners[_index];
    }

    // --- Trove Liquidation functions ---

    // Single liquidation function. Closes the trove if its ICR is lower than the minimum collateral ratio.
    function liquidate(address _borrower) external {
        _requireTroveIsActive(_borrower);

        address[] memory borrowers = new address[](1);
        borrowers[0] = _borrower;
        batchLiquidateTroves(borrowers);
    }

    // --- Inner single liquidation functions ---

    // Liquidate one trove, in Normal Mode.
    function _liquidateNormalMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower,
        uint _BaseFeeLMAInStabPool
    ) internal returns (LiquidationValues memory singleLiquidation) {
        LocalVariables_InnerSingleLiquidateFunction memory vars;

        (
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            vars.pendingDebtReward,
            vars.pendingCollReward
        ) = getEntireDebtAndColl(_borrower);

        _movePendingTroveRewardsToActivePool(
            _activePool,
            _defaultPool,
            vars.pendingDebtReward,
            vars.pendingCollReward
        );
        _removeStake(_borrower);

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            singleLiquidation.entireTroveColl
        );
        singleLiquidation
            .BaseFeeLMAGasCompensation = BaseFeeLMA_GAS_COMPENSATION; // TODO: Why is that being done if BaseFeeLMA_GAS_COMP is static
        uint collToLiquidate = singleLiquidation.entireTroveColl.sub(
            singleLiquidation.collGasCompensation
        );

        (
            singleLiquidation.debtToOffset,
            singleLiquidation.collToSendToSP,
            singleLiquidation.debtToRedistribute,
            singleLiquidation.collToRedistribute
        ) = _getOffsetAndRedistributionVals(
            singleLiquidation.entireTroveDebt,
            collToLiquidate,
            _BaseFeeLMAInStabPool
        );

        _closeTrove(_borrower, Status.closedByLiquidation);
        emit TroveLiquidated(
            _borrower,
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            TroveManagerOperation.liquidateInNormalMode
        );
        emit TroveUpdated(
            _borrower,
            0,
            0,
            0,
            TroveManagerOperation.liquidateInNormalMode
        );
        return singleLiquidation;
    }

    // Liquidate one trove, in Recovery Mode.
    function _liquidateRecoveryMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower,
        uint _ICR,
        uint _BaseFeeLMAInStabPool,
        uint _TCR,
        uint _price
    ) internal returns (LiquidationValues memory singleLiquidation) {
        LocalVariables_InnerSingleLiquidateFunction memory vars;
        if (TroveOwners.length <= 1) {
            return singleLiquidation;
        } // don't liquidate if last trove
        (
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            vars.pendingDebtReward,
            vars.pendingCollReward
        ) = getEntireDebtAndColl(_borrower);

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            singleLiquidation.entireTroveColl
        );
        singleLiquidation
            .BaseFeeLMAGasCompensation = BaseFeeLMA_GAS_COMPENSATION;
        vars.collToLiquidate = singleLiquidation.entireTroveColl.sub(
            singleLiquidation.collGasCompensation
        );

        // If ICR <= 100%, purely redistribute the Trove across all active Troves
        if (_ICR <= _100pct) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            _removeStake(_borrower);

            singleLiquidation.debtToOffset = 0;
            singleLiquidation.collToSendToSP = 0;
            singleLiquidation.debtToRedistribute = singleLiquidation
                .entireTroveDebt;
            singleLiquidation.collToRedistribute = vars.collToLiquidate;

            _closeTrove(_borrower, Status.closedByLiquidation);
            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                TroveManagerOperation.liquidateInRecoveryMode
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                TroveManagerOperation.liquidateInRecoveryMode
            );

            // If 100% < ICR < MCR, offset as much as possible, and redistribute the remainder
        } else if ((_ICR > _100pct) && (_ICR < MCR)) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            _removeStake(_borrower);

            (
                singleLiquidation.debtToOffset,
                singleLiquidation.collToSendToSP,
                singleLiquidation.debtToRedistribute,
                singleLiquidation.collToRedistribute
            ) = _getOffsetAndRedistributionVals(
                singleLiquidation.entireTroveDebt,
                vars.collToLiquidate,
                _BaseFeeLMAInStabPool
            );

            _closeTrove(_borrower, Status.closedByLiquidation);
            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                TroveManagerOperation.liquidateInRecoveryMode
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                TroveManagerOperation.liquidateInRecoveryMode
            );
            /*
             * If 110% <= ICR < current TCR (accounting for the preceding liquidations in the current sequence)
             * and there is BaseFeeLMA in the Stability Pool, only offset, with no redistribution,
             * but at a capped rate of 1.1 and only if the whole debt can be liquidated.
             * The remainder due to the capped rate will be claimable as collateral surplus.
             */
        } else if (
            (_ICR >= MCR) &&
            (_ICR < _TCR) &&
            (singleLiquidation.entireTroveDebt <= _BaseFeeLMAInStabPool)
        ) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            assert(_BaseFeeLMAInStabPool != 0);

            _removeStake(_borrower);
            singleLiquidation = _getCappedOffsetVals(
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                _price
            );

            _closeTrove(_borrower, Status.closedByLiquidation);
            if (singleLiquidation.collSurplus > 0) {
                collSurplusPool.accountSurplus(
                    _borrower,
                    singleLiquidation.collSurplus
                );
            }

            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.collToSendToSP,
                TroveManagerOperation.liquidateInRecoveryMode
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                TroveManagerOperation.liquidateInRecoveryMode
            );
        } else {
            // if (_ICR >= MCR && ( _ICR >= _TCR || singleLiquidation.entireTroveDebt > _BaseFeeLMAInStabPool))
            LiquidationValues memory zeroVals;
            return zeroVals;
        }

        return singleLiquidation;
    }

    /* In a full liquidation, returns the values for a trove's coll and debt to be offset, and coll and debt to be
     * redistributed to active troves.
     */
    function _getOffsetAndRedistributionVals(
        uint _debt,
        uint _coll,
        uint _BaseFeeLMAInStabPool
    )
        internal
        pure
        returns (
            uint debtToOffset,
            uint collToSendToSP,
            uint debtToRedistribute,
            uint collToRedistribute
        )
    {
        if (_BaseFeeLMAInStabPool > 0) {
            /*
             * Offset as much debt & collateral as possible against the Stability Pool, and redistribute the remainder
             * between all active troves.
             *
             *  If the trove's debt is larger than the deposited BaseFeeLMA in the Stability Pool:
             *
             *  - Offset an amount of the trove's debt equal to the BaseFeeLMA in the Stability Pool
             *  - Send a fraction of the trove's collateral to the Stability Pool, equal to the fraction of its offset debt
             *
             */
            debtToOffset = LiquityMath._min(_debt, _BaseFeeLMAInStabPool);
            collToSendToSP = _coll.mul(debtToOffset).div(_debt);
            debtToRedistribute = _debt.sub(debtToOffset);
            collToRedistribute = _coll.sub(collToSendToSP);
        } else {
            debtToOffset = 0;
            collToSendToSP = 0;
            debtToRedistribute = _debt;
            collToRedistribute = _coll;
        }
    }

    /*
     *  Get its offset coll/debt and StETH gas comp, and close the trove.
     */
    function _getCappedOffsetVals(
        uint _entireTroveDebt,
        uint _entireTroveColl,
        uint _price
    ) internal pure returns (LiquidationValues memory singleLiquidation) {
        singleLiquidation.entireTroveDebt = _entireTroveDebt;
        singleLiquidation.entireTroveColl = _entireTroveColl;
        uint cappedCollPortion = _entireTroveDebt.mul(MCR).div(_price);

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            cappedCollPortion
        );
        singleLiquidation
            .BaseFeeLMAGasCompensation = BaseFeeLMA_GAS_COMPENSATION;

        singleLiquidation.debtToOffset = _entireTroveDebt;
        singleLiquidation.collToSendToSP = cappedCollPortion.sub(
            singleLiquidation.collGasCompensation
        );
        singleLiquidation.collSurplus = _entireTroveColl.sub(cappedCollPortion);
        singleLiquidation.debtToRedistribute = 0;
        singleLiquidation.collToRedistribute = 0;
    }

    /*
     * Liquidate a sequence of troves. Closes a maximum number of n under-collateralized Troves,
     * starting from the one with the lowest collateral ratio in the system, and moving upwards
     */
    function liquidateTroves(uint _n) external {
        ContractsCache memory contractsCache = ContractsCache(
            activePool,
            defaultPool,
            IBaseFeeLMAToken(address(0)),
            IHOGStaking(address(0)),
            sortedTroves,
            ICollSurplusPool(address(0)),
            address(0)
        );
        IStabilityPool stabilityPoolCached = stabilityPool;

        LocalVariables_OuterLiquidationFunction memory vars;

        LiquidationTotals memory totals;

        vars.price = priceFeed.fetchPrice();
        vars.BaseFeeLMAInStabPool = stabilityPoolCached
            .getTotalBaseFeeLMADeposits();
        vars.recoveryModeAtStart = _checkRecoveryMode(vars.price);

        // Perform the appropriate liquidation sequence - tally the values, and obtain their totals
        if (vars.recoveryModeAtStart) {
            totals = _getTotalsFromLiquidateTrovesSequence_RecoveryMode(
                contractsCache,
                vars.price,
                vars.BaseFeeLMAInStabPool,
                _n
            );
        } else {
            // if !vars.recoveryModeAtStart
            totals = _getTotalsFromLiquidateTrovesSequence_NormalMode(
                contractsCache.activePool,
                contractsCache.defaultPool,
                vars.price,
                vars.BaseFeeLMAInStabPool,
                _n
            );
        }

        require(
            totals.totalDebtInSequence > 0,
            "TroveManager: nothing to liquidate"
        );

        // Move liquidated StETH and BaseFeeLMA to the appropriate pools
        stabilityPoolCached.offset(
            totals.totalDebtToOffset,
            totals.totalCollToSendToSP
        );
        _redistributeDebtAndColl(
            contractsCache.activePool,
            contractsCache.defaultPool,
            totals.totalDebtToRedistribute,
            totals.totalCollToRedistribute
        );
        if (totals.totalCollSurplus > 0) {
            contractsCache.activePool.sendStETH(
                address(collSurplusPool),
                totals.totalCollSurplus
            );
        }

        // Update system snapshots
        _updateSystemSnapshots_excludeCollRemainder(
            contractsCache.activePool,
            totals.totalCollGasCompensation
        );

        vars.liquidatedDebt = totals.totalDebtInSequence;
        vars.liquidatedColl = totals
            .totalCollInSequence
            .sub(totals.totalCollGasCompensation)
            .sub(totals.totalCollSurplus);
        emit Liquidation(
            vars.liquidatedDebt,
            vars.liquidatedColl,
            totals.totalCollGasCompensation,
            totals.totalBaseFeeLMAGasCompensation
        );

        // Send gas compensation to caller
        _sendGasCompensation(
            contractsCache.activePool,
            msg.sender,
            totals.totalBaseFeeLMAGasCompensation,
            totals.totalCollGasCompensation
        );
    }

    /*
     * This function is used when the liquidateTroves sequence starts during Recovery Mode. However, it
     * handle the case where the system *leaves* Recovery Mode, part way through the liquidation sequence
     */
    function _getTotalsFromLiquidateTrovesSequence_RecoveryMode(
        ContractsCache memory _contractsCache,
        uint _price,
        uint _BaseFeeLMAInStabPool,
        uint _n
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingBaseFeeLMAInStabPool = _BaseFeeLMAInStabPool;
        vars.backToNormalMode = false;
        vars.entireSystemDebt = getEntireSystemDebt();
        vars.entireSystemColl = getEntireSystemColl();

        vars.user = _contractsCache.sortedTroves.getLast();
        address firstUser = _contractsCache.sortedTroves.getFirst();
        for (vars.i = 0; vars.i < _n && vars.user != firstUser; vars.i++) {
            // we need to cache it, because current user is likely going to be deleted
            address nextUser = _contractsCache.sortedTroves.getPrev(vars.user);

            vars.ICR = getCurrentICR(vars.user, _price);

            if (!vars.backToNormalMode) {
                // Break the loop if ICR is greater than MCR and Stability Pool is empty
                if (
                    vars.ICR >= MCR && vars.remainingBaseFeeLMAInStabPool == 0
                ) {
                    break;
                }

                uint TCR = LiquityMath._computeCR(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );

                singleLiquidation = _liquidateRecoveryMode(
                    _contractsCache.activePool,
                    _contractsCache.defaultPool,
                    vars.user,
                    vars.ICR,
                    vars.remainingBaseFeeLMAInStabPool,
                    TCR,
                    _price
                );

                // Update aggregate trackers
                vars.remainingBaseFeeLMAInStabPool = vars
                    .remainingBaseFeeLMAInStabPool
                    .sub(singleLiquidation.debtToOffset);
                vars.entireSystemDebt = vars.entireSystemDebt.sub(
                    singleLiquidation.debtToOffset
                );
                vars.entireSystemColl = vars
                    .entireSystemColl
                    .sub(singleLiquidation.collToSendToSP)
                    .sub(singleLiquidation.collGasCompensation)
                    .sub(singleLiquidation.collSurplus);

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );

                vars.backToNormalMode = !_checkPotentialRecoveryMode(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );
            } else if (vars.backToNormalMode && vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _contractsCache.activePool,
                    _contractsCache.defaultPool,
                    vars.user,
                    vars.remainingBaseFeeLMAInStabPool
                );

                vars.remainingBaseFeeLMAInStabPool = vars
                    .remainingBaseFeeLMAInStabPool
                    .sub(singleLiquidation.debtToOffset);

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            } else break; // break if the loop reaches a Trove with ICR >= MCR

            vars.user = nextUser;
        }
    }

    function _getTotalsFromLiquidateTrovesSequence_NormalMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint _price,
        uint _BaseFeeLMAInStabPool,
        uint _n
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;
        ISortedTroves sortedTrovesCached = sortedTroves;

        vars.remainingBaseFeeLMAInStabPool = _BaseFeeLMAInStabPool;

        for (vars.i = 0; vars.i < _n; vars.i++) {
            vars.user = sortedTrovesCached.getLast();
            vars.ICR = getCurrentICR(vars.user, _price);

            if (vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingBaseFeeLMAInStabPool
                );

                vars.remainingBaseFeeLMAInStabPool = vars
                    .remainingBaseFeeLMAInStabPool
                    .sub(singleLiquidation.debtToOffset);

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            } else break; // break if the loop reaches a Trove with ICR >= MCR
        }
    }

    /*
     * Attempt to liquidate a custom list of troves provided by the caller.
     */
    function batchLiquidateTroves(address[] memory _troveArray) public {
        require(
            _troveArray.length != 0,
            "TroveManager: Calldata address array must not be empty"
        );

        IActivePool activePoolCached = activePool;
        IDefaultPool defaultPoolCached = defaultPool;
        IStabilityPool stabilityPoolCached = stabilityPool;

        LocalVariables_OuterLiquidationFunction memory vars;
        LiquidationTotals memory totals;

        vars.price = priceFeed.fetchPrice();
        vars.BaseFeeLMAInStabPool = stabilityPoolCached
            .getTotalBaseFeeLMADeposits();
        vars.recoveryModeAtStart = _checkRecoveryMode(vars.price);

        // Perform the appropriate liquidation sequence - tally values and obtain their totals.
        if (vars.recoveryModeAtStart) {
            totals = _getTotalFromBatchLiquidate_RecoveryMode(
                activePoolCached,
                defaultPoolCached,
                vars.price,
                vars.BaseFeeLMAInStabPool,
                _troveArray
            );
        } else {
            //  if !vars.recoveryModeAtStart
            totals = _getTotalsFromBatchLiquidate_NormalMode(
                activePoolCached,
                defaultPoolCached,
                vars.price,
                vars.BaseFeeLMAInStabPool,
                _troveArray
            );
        }

        require(
            totals.totalDebtInSequence > 0,
            "TroveManager: nothing to liquidate"
        );

        // Move liquidated StETH and BaseFeeLMA to the appropriate pools
        stabilityPoolCached.offset(
            totals.totalDebtToOffset,
            totals.totalCollToSendToSP
        );
        _redistributeDebtAndColl(
            activePoolCached,
            defaultPoolCached,
            totals.totalDebtToRedistribute,
            totals.totalCollToRedistribute
        );
        console.log("sending coll to coll surplas: ", totals.totalCollSurplus);
        if (totals.totalCollSurplus > 0) {
            collSurplusPool.increaseBalance(totals.totalCollSurplus);
            activePoolCached.sendStETH(
                address(collSurplusPool),
                totals.totalCollSurplus
            );
        }

        // Update system snapshots
        _updateSystemSnapshots_excludeCollRemainder(
            activePoolCached,
            totals.totalCollGasCompensation
        );

        vars.liquidatedDebt = totals.totalDebtInSequence;

        vars.liquidatedColl = totals
            .totalCollInSequence
            .sub(totals.totalCollGasCompensation)
            .sub(totals.totalCollSurplus);

        emit Liquidation(
            vars.liquidatedDebt,
            vars.liquidatedColl,
            totals.totalCollGasCompensation,
            totals.totalBaseFeeLMAGasCompensation
        );

        // Send gas compensation to caller
        _sendGasCompensation(
            activePoolCached,
            msg.sender,
            totals.totalBaseFeeLMAGasCompensation,
            totals.totalCollGasCompensation
        );
    }

    /*
     * This function is used when the batch liquidation sequence starts during Recovery Mode. However, it
     * handle the case where the system *leaves* Recovery Mode, part way through the liquidation sequence
     */
    function _getTotalFromBatchLiquidate_RecoveryMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint _price,
        uint _BaseFeeLMAInStabPool,
        address[] memory _troveArray
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingBaseFeeLMAInStabPool = _BaseFeeLMAInStabPool;
        vars.backToNormalMode = false;
        vars.entireSystemDebt = getEntireSystemDebt();
        vars.entireSystemColl = getEntireSystemColl();

        for (vars.i = 0; vars.i < _troveArray.length; vars.i++) {
            vars.user = _troveArray[vars.i];
            // Skip non-active troves
            if (Troves[vars.user].status != Status.active) {
                continue;
            }
            vars.ICR = getCurrentICR(vars.user, _price);

            if (!vars.backToNormalMode) {
                // Skip this trove if ICR is greater than MCR and Stability Pool is empty
                if (
                    vars.ICR >= MCR && vars.remainingBaseFeeLMAInStabPool == 0
                ) {
                    continue;
                }

                uint TCR = LiquityMath._computeCR(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );

                singleLiquidation = _liquidateRecoveryMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.ICR,
                    vars.remainingBaseFeeLMAInStabPool,
                    TCR,
                    _price
                );

                // Update aggregate trackers
                vars.remainingBaseFeeLMAInStabPool = vars
                    .remainingBaseFeeLMAInStabPool
                    .sub(singleLiquidation.debtToOffset);
                vars.entireSystemDebt = vars.entireSystemDebt.sub(
                    singleLiquidation.debtToOffset
                );
                vars.entireSystemColl = vars
                    .entireSystemColl
                    .sub(singleLiquidation.collToSendToSP)
                    .sub(singleLiquidation.collGasCompensation)
                    .sub(singleLiquidation.collSurplus);

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );

                vars.backToNormalMode = !_checkPotentialRecoveryMode(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );
            } else if (vars.backToNormalMode && vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingBaseFeeLMAInStabPool
                );
                vars.remainingBaseFeeLMAInStabPool = vars
                    .remainingBaseFeeLMAInStabPool
                    .sub(singleLiquidation.debtToOffset);

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            } else continue; // In Normal Mode skip troves with ICR >= MCR
        }
    }

    function _getTotalsFromBatchLiquidate_NormalMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint _price,
        uint _BaseFeeLMAInStabPool,
        address[] memory _troveArray
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingBaseFeeLMAInStabPool = _BaseFeeLMAInStabPool;

        for (vars.i = 0; vars.i < _troveArray.length; vars.i++) {
            vars.user = _troveArray[vars.i];
            vars.ICR = getCurrentICR(vars.user, _price);

            if (vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingBaseFeeLMAInStabPool
                );

                vars.remainingBaseFeeLMAInStabPool = vars
                    .remainingBaseFeeLMAInStabPool
                    .sub(singleLiquidation.debtToOffset);

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            }
        }
    }

    // --- Liquidation helper functions ---

    function _addLiquidationValuesToTotals(
        LiquidationTotals memory oldTotals,
        LiquidationValues memory singleLiquidation
    ) internal pure returns (LiquidationTotals memory newTotals) {
        // Tally all the values with their respective running totals
        newTotals.totalCollGasCompensation = oldTotals
            .totalCollGasCompensation
            .add(singleLiquidation.collGasCompensation);
        newTotals.totalBaseFeeLMAGasCompensation = oldTotals
            .totalBaseFeeLMAGasCompensation
            .add(singleLiquidation.BaseFeeLMAGasCompensation);
        newTotals.totalDebtInSequence = oldTotals.totalDebtInSequence.add(
            singleLiquidation.entireTroveDebt
        );
        newTotals.totalCollInSequence = oldTotals.totalCollInSequence.add(
            singleLiquidation.entireTroveColl
        );
        newTotals.totalDebtToOffset = oldTotals.totalDebtToOffset.add(
            singleLiquidation.debtToOffset
        );
        newTotals.totalCollToSendToSP = oldTotals.totalCollToSendToSP.add(
            singleLiquidation.collToSendToSP
        );
        newTotals.totalDebtToRedistribute = oldTotals
            .totalDebtToRedistribute
            .add(singleLiquidation.debtToRedistribute);
        newTotals.totalCollToRedistribute = oldTotals
            .totalCollToRedistribute
            .add(singleLiquidation.collToRedistribute);
        newTotals.totalCollSurplus = oldTotals.totalCollSurplus.add(
            singleLiquidation.collSurplus
        );

        return newTotals;
    }

    function _sendGasCompensation(
        IActivePool _activePool,
        address _liquidator,
        uint _BaseFeeLMA,
        uint _StETH
    ) internal {
        if (_BaseFeeLMA > 0) {
            baseFeeLMAToken.returnFromPool(
                gasPoolAddress,
                _liquidator,
                _BaseFeeLMA
            );
        }

        if (_StETH > 0) {
            _activePool.sendStETH(_liquidator, _StETH);
        }
    }

    // Move a Trove's pending debt and collateral rewards from distributions, from the Default Pool to the Active Pool
    function _movePendingTroveRewardsToActivePool(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint _BaseFeeLMA,
        uint _StETH
    ) internal {
        _defaultPool.decreaseBaseFeeLMADebt(_BaseFeeLMA);
        _activePool.increaseBaseFeeLMADebt(_BaseFeeLMA);
        _defaultPool.sendStETHToActivePool(_StETH);
    }

    // --- Redemption functions ---

    // Redeem as much collateral as possible from _borrower's Trove in exchange for BaseFeeLMA up to _maxBaseFeeLMAamount
    // HEDGEHOG Updates: Not subtracting gas compensation from the debt anymore
    function _redeemCollateralFromTrove(
        ContractsCache memory _contractsCache,
        address _borrower,
        uint _maxBaseFeeLMAamount,
        uint _price,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint _partialRedemptionHintNICR
    ) internal returns (SingleRedemptionValues memory singleRedemption) {
        // Determine the remaining amount (lot) to be redeemed, capped by the entire debt of the Trove minus the liquidation reserve
        singleRedemption.BaseFeeLMALot = LiquityMath._min(
            _maxBaseFeeLMAamount,
            Troves[_borrower].debt
        );

        // Get the StETHLot of equivalent value in USD
        // HEDGEHOG UPDATES: Change StETHLOT calculations formula from [debtToBeRedeemed * price * 10e9] to [debtToBeRedeemed / price * 1e18]
        singleRedemption.StETHLot = singleRedemption.BaseFeeLMALot.mul(_price);

        // Decrease the debt and collateral of the current Trove according to the BaseFeeLMA lot and corresponding StETH to send
        uint newDebt = (Troves[_borrower].debt).sub(
            singleRedemption.BaseFeeLMALot
        );
        uint newColl = (Troves[_borrower].coll).sub(singleRedemption.StETHLot);

        if (newDebt == BaseFeeLMA_GAS_COMPENSATION) {
            // No debt left in the Trove (except for the liquidation reserve), therefore the trove gets closed
            _removeStake(_borrower);
            _closeTrove(_borrower, Status.closedByRedemption);
            _redeemCloseTrove(
                _contractsCache,
                _borrower,
                BaseFeeLMA_GAS_COMPENSATION,
                newColl
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                TroveManagerOperation.redeemCollateral
            );
        } else {
            uint newNICR = LiquityMath._computeNominalCR(newColl, newDebt);

            /*
             * If the provided hint is out of date, we bail since trying to reinsert without a good hint will almost
             * certainly result in running out of gas.
             *
             * If the resultant net debt of the partial is less than the minimum, net debt we bail.
             */

            if (
                newNICR != _partialRedemptionHintNICR ||
                _getNetDebt(newDebt) < MIN_NET_DEBT
            ) {
                singleRedemption.cancelledPartial = true;
                return singleRedemption;
            }

            _contractsCache.sortedTroves.reInsert(
                _borrower,
                newNICR,
                _upperPartialRedemptionHint,
                _lowerPartialRedemptionHint
            );

            Troves[_borrower].debt = newDebt;
            Troves[_borrower].coll = newColl;
            _updateStakeAndTotalStakes(_borrower);

            emit TroveUpdated(
                _borrower,
                newDebt,
                newColl,
                Troves[_borrower].stake,
                TroveManagerOperation.redeemCollateral
            );
        }

        return singleRedemption;
    }

    /*
     * Called when a full redemption occurs, and closes the trove.
     * The redeemer swaps (debt - liquidation reserve) BaseFeeLMA for (debt - liquidation reserve) worth of StETH, so the BaseFeeLMA liquidation reserve left corresponds to the remaining debt.
     * In order to close the trove, the BaseFeeLMA liquidation reserve is burned, and the corresponding debt is removed from the active pool.
     * The debt recorded on the trove's struct is zero'd elswhere, in _closeTrove.
     * Any surplus StETH left in the trove, is sent to the Coll surplus pool, and can be later claimed by the borrower.
     */
    function _redeemCloseTrove(
        ContractsCache memory _contractsCache,
        address _borrower,
        uint _BaseFeeLMA,
        uint _StETH
    ) internal {
        _contractsCache.baseFeeLMAToken.burn(gasPoolAddress, _BaseFeeLMA);
        // Update Active Pool BaseFeeLMA, and send StETH to account
        _contractsCache.activePool.decreaseBaseFeeLMADebt(_BaseFeeLMA);

        // send StETH from Active Pool to CollSurplus Pool
        _contractsCache.collSurplusPool.accountSurplus(_borrower, _StETH);
        _contractsCache.activePool.sendStETH(
            address(_contractsCache.collSurplusPool),
            _StETH
        );
    }

    function _isValidFirstRedemptionHint(
        ISortedTroves _sortedTroves,
        address _firstRedemptionHint,
        uint _price
    ) internal view returns (bool) {
        if (
            _firstRedemptionHint == address(0) ||
            !_sortedTroves.contains(_firstRedemptionHint) ||
            getCurrentICR(_firstRedemptionHint, _price) < MCR
        ) {
            return false;
        }

        address nextTrove = _sortedTroves.getNext(_firstRedemptionHint);
        return
            nextTrove == address(0) || getCurrentICR(nextTrove, _price) < MCR;
    }

    /* Send _BaseFeeLMAamount BaseFeeLMA to the system and redeem the corresponding amount of collateral from as many Troves as are needed to fill the redemption
     * request.  Applies pending rewards to a Trove before reducing its debt and coll.
     *
     * Note that if _amount is very large, this function can run out of gas, specially if traversed troves are small. This can be easily avoided by
     * splitting the total _amount in appropriate chunks and calling the function multiple times.
     *
     * Param `_maxIterations` can also be provided, so the loop through Troves is capped (if it’s zero, it will be ignored).This makes it easier to
     * avoid OOG for the frontend, as only knowing approximately the average cost of an iteration is enough, without needing to know the “topology”
     * of the trove list. It also avoids the need to set the cap in stone in the contract, nor doing gas calculations, as both gas price and opcode
     * costs can vary.
     *
     * All Troves that are redeemed from -- with the likely exception of the last one -- will end up with no debt left, therefore they will be closed.
     * If the last Trove does have some remaining debt, it has a finite ICR, and the reinsertion could be anywhere in the list, therefore it requires a hint.
     * A frontend should use getRedemptionHints() to calculate what the ICR of this Trove will be after redemption, and pass a hint for its position
     * in the sortedTroves list along with the ICR value that the hint was found for.
     *
     * If another transaction modifies the list between calling getRedemptionHints() and passing the hints to redeemCollateral(), it
     * is very likely that the last (partially) redeemed Trove would end up with a different ICR than what the hint is for. In this case the
     * redemption will stop after the last completely redeemed Trove and the sender will keep the remaining BaseFeeLMA amount, which they can attempt
     * to redeem later.
     */
    function redeemCollateral(
        uint _BaseFeeLMAamount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint _partialRedemptionHintNICR,
        uint _maxIterations,
        uint _maxFeePercentage
    ) external {
        ContractsCache memory contractsCache = ContractsCache(
            activePool,
            defaultPool,
            baseFeeLMAToken,
            hogStaking,
            sortedTroves,
            collSurplusPool,
            gasPoolAddress
        );
        RedemptionTotals memory totals;

        _requireValidMaxFeePercentage(_maxFeePercentage);
        //_requireAfterBootstrapPeriod();
        totals.price = priceFeed.fetchPrice();

        _requireTCRoverMCR(totals.price);
        _requireAmountGreaterThanZero(_BaseFeeLMAamount);
        _requireBaseFeeLMABalanceCoversRedemption(
            contractsCache.baseFeeLMAToken,
            msg.sender,
            _BaseFeeLMAamount
        );

        totals.totalBaseFeeLMASupplyAtStart = getEntireSystemDebt();
        // Confirm redeemer's balance is less than total BaseFeeLMA supply
        assert(
            contractsCache.baseFeeLMAToken.balanceOf(msg.sender) <=
                totals.totalBaseFeeLMASupplyAtStart
        );

        totals.remainingBaseFeeLMA = _BaseFeeLMAamount;
        address currentBorrower;

        if (
            _isValidFirstRedemptionHint(
                contractsCache.sortedTroves,
                _firstRedemptionHint,
                totals.price
            )
        ) {
            currentBorrower = _firstRedemptionHint;
        } else {
            currentBorrower = contractsCache.sortedTroves.getLast();
            // Find the first trove with ICR >= MCR
            while (
                currentBorrower != address(0) &&
                getCurrentICR(currentBorrower, totals.price) < MCR
            ) {
                currentBorrower = contractsCache.sortedTroves.getPrev(
                    currentBorrower
                );
            }
        }
        // Loop through the Troves starting from the one with lowest collateral ratio until _amount of BaseFeeLMA is exchanged for collateral
        if (_maxIterations == 0) {
            // Previous implementation: _maxIterations = uint(-1);
            // Updated since 8th pragma does not allow anymore
            _maxIterations = type(uint).max;
        }
        while (
            currentBorrower != address(0) &&
            totals.remainingBaseFeeLMA > 0 &&
            _maxIterations > 0
        ) {
            _maxIterations--;
            // Save the address of the Trove preceding the current one, before potentially modifying the list
            address nextUserToCheck = contractsCache.sortedTroves.getPrev(
                currentBorrower
            );

            _applyPendingRewards(
                contractsCache.activePool,
                contractsCache.defaultPool,
                currentBorrower
            );

            SingleRedemptionValues
                memory singleRedemption = _redeemCollateralFromTrove(
                    contractsCache,
                    currentBorrower,
                    totals.remainingBaseFeeLMA,
                    totals.price,
                    _upperPartialRedemptionHint,
                    _lowerPartialRedemptionHint,
                    _partialRedemptionHintNICR
                );

            if (singleRedemption.cancelledPartial) break; // Partial redemption was cancelled (out-of-date hint, or new net debt < minimum), therefore we could not redeem from the last Trove
            totals.totalBaseFeeLMAToRedeem = totals.totalBaseFeeLMAToRedeem.add(
                singleRedemption.BaseFeeLMALot
            );
            totals.totalStETHDrawn = totals.totalStETHDrawn.add(
                singleRedemption.StETHLot
            );

            totals.remainingBaseFeeLMA = totals.remainingBaseFeeLMA.sub(
                singleRedemption.BaseFeeLMALot
            );
            currentBorrower = nextUserToCheck;
        }

        require(
            totals.totalStETHDrawn > 0,
            "TroveManager: Unable to redeem any amount"
        );
        // HEDGEHOG LOGIC UPDATE:
        // 1) rename _updateBaseRateFromRedemption into _updateRedemptionBaseRateFromRedemption
        // 2) update commented explanation (baseRate => redemptionBaseRate)
        // Decay the redemptionBaseRate due to time passed, and then increase it according to the size of this redemption.
        // Use the saved total BaseFeeLMA supply value, from before it was reduced by the redemption.
        _updateRedemptionBaseRateFromRedemption(
            totals.totalStETHDrawn,
            totals.price,
            totals.totalBaseFeeLMASupplyAtStart
        );
        // Calculate the StETH fee
        totals.StETHFee = _getRedemptionFee(totals.totalStETHDrawn);

        _requireUserAcceptsFee(
            totals.StETHFee,
            totals.totalStETHDrawn,
            _maxFeePercentage
        );

        // HEDGHEHOG UPDATES:
        // Fees are now distributed among different addresses based on how big they are
        feesRouter.distributeCollFee(totals.totalStETHDrawn, totals.StETHFee);

        totals.StETHToSendToRedeemer = totals.totalStETHDrawn.sub(
            totals.StETHFee
        );

        emit Redemption(
            _BaseFeeLMAamount,
            totals.totalBaseFeeLMAToRedeem,
            totals.totalStETHDrawn,
            totals.StETHFee
        );
        // Burn the total BaseFeeLMA that is cancelled with debt, and send the redeemed StETH to msg.sender
        contractsCache.baseFeeLMAToken.burn(
            msg.sender,
            totals.totalBaseFeeLMAToRedeem
        );
        // Update Active Pool BaseFeeLMA, and send StETH to account
        contractsCache.activePool.decreaseBaseFeeLMADebt(
            totals.totalBaseFeeLMAToRedeem
        );
        contractsCache.activePool.sendStETH(
            msg.sender,
            totals.StETHToSendToRedeemer
        );
    }

    // --- Helper functions ---

    // Return the nominal collateral ratio (ICR) of a given Trove, without the price. Takes a trove's pending coll and debt rewards from redistributions into account.
    function getNominalICR(address _borrower) public view returns (uint) {
        (
            uint currentStETH,
            uint currentBaseFeeLMADebt
        ) = _getCurrentTroveAmounts(_borrower);

        uint NICR = LiquityMath._computeNominalCR(
            currentStETH,
            currentBaseFeeLMADebt
        );
        return NICR;
    }

    /**
     * Hedgehog changes:
     * Get Price directly from the price feed instead of param passing
     */
    // Return the current collateral ratio (ICR) of a given Trove. Takes a trove's pending coll and debt rewards from redistributions into account.
    function getCurrentICR(
        address _borrower,
        uint _price
    ) public view returns (uint) {
        (
            uint currentStETH,
            uint currentBaseFeeLMADebt
        ) = _getCurrentTroveAmounts(_borrower);

        uint ICR = LiquityMath._computeCR(
            currentStETH,
            currentBaseFeeLMADebt,
            _price
        );
        return ICR;
    }

    function getUnreliableTroveICR(
        address _borrower
    ) public view returns (uint) {
        uint256 price = priceFeed.lastGoodPrice();
        (
            uint currentStETH,
            uint currentBaseFeeLMADebt
        ) = _getCurrentTroveAmounts(_borrower);

        uint ICR = LiquityMath._computeCR(
            currentStETH,
            currentBaseFeeLMADebt,
            price
        );
        return ICR;
    }

    function _getCurrentTroveAmounts(
        address _borrower
    ) internal view returns (uint, uint) {
        uint pendingStETHReward = getPendingStETHReward(_borrower);
        uint pendingBaseFeeLMADebtReward = getPendingBaseFeeLMADebtReward(
            _borrower
        );

        uint currentStETH = Troves[_borrower].coll.add(pendingStETHReward);
        uint currentBaseFeeLMADebt = Troves[_borrower].debt.add(
            pendingBaseFeeLMADebtReward
        );

        return (currentStETH, currentBaseFeeLMADebt);
    }

    function applyPendingRewards(address _borrower) external {
        _requireCallerIsBorrowerOperations();
        return _applyPendingRewards(activePool, defaultPool, _borrower);
    }

    // Add the borrowers's coll and debt rewards earned from redistributions, to their Trove
    function _applyPendingRewards(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower
    ) internal {
        if (hasPendingRewards(_borrower)) {
            _requireTroveIsActive(_borrower);

            // Compute pending rewards
            uint pendingStETHReward = getPendingStETHReward(_borrower);

            uint pendingBaseFeeLMADebtReward = getPendingBaseFeeLMADebtReward(
                _borrower
            );

            // Apply pending rewards to trove's state
            Troves[_borrower].coll = Troves[_borrower].coll.add(
                pendingStETHReward
            );

            Troves[_borrower].debt = Troves[_borrower].debt.add(
                pendingBaseFeeLMADebtReward
            );

            _updateTroveRewardSnapshots(_borrower);

            // Transfer from DefaultPool to ActivePool
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                pendingBaseFeeLMADebtReward,
                pendingStETHReward
            );

            emit TroveUpdated(
                _borrower,
                Troves[_borrower].debt,
                Troves[_borrower].coll,
                Troves[_borrower].stake,
                TroveManagerOperation.applyPendingRewards
            );
        }
    }

    // Update borrower's snapshots of L_StETH and L_BaseFeeLMADebt to reflect the current values
    function updateTroveRewardSnapshots(address _borrower) external {
        _requireCallerIsBorrowerOperations();
        return _updateTroveRewardSnapshots(_borrower);
    }

    function _updateTroveRewardSnapshots(address _borrower) internal {
        rewardSnapshots[_borrower].StETH = L_StETH;
        rewardSnapshots[_borrower].BaseFeeLMADebt = L_BaseFeeLMADebt;
        emit TroveSnapshotsUpdated(L_StETH, L_BaseFeeLMADebt);
    }

    // Get the borrower's pending accumulated StETH reward, earned by their stake
    function getPendingStETHReward(
        address _borrower
    ) public view returns (uint) {
        uint snapshotStETH = rewardSnapshots[_borrower].StETH;
        uint rewardPerUnitStaked = L_StETH.sub(snapshotStETH);

        if (
            rewardPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return 0;
        }

        uint stake = Troves[_borrower].stake;

        uint pendingStETHReward = stake.mul(rewardPerUnitStaked).div(
            DECIMAL_PRECISION
        );

        return pendingStETHReward;
    }

    // Get the borrower's pending accumulated BaseFeeLMA reward, earned by their stake
    function getPendingBaseFeeLMADebtReward(
        address _borrower
    ) public view returns (uint) {
        uint snapshotBaseFeeLMADebt = rewardSnapshots[_borrower].BaseFeeLMADebt;
        uint rewardPerUnitStaked = L_BaseFeeLMADebt.sub(snapshotBaseFeeLMADebt);

        if (
            rewardPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return 0;
        }

        uint stake = Troves[_borrower].stake;

        uint pendingBaseFeeLMADebtReward = stake.mul(rewardPerUnitStaked).div(
            DECIMAL_PRECISION
        );

        return pendingBaseFeeLMADebtReward;
    }

    function hasPendingRewards(address _borrower) public view returns (bool) {
        /*
         * A Trove has pending rewards if its snapshot is less than the current rewards per-unit-staked sum:
         * this indicates that rewards have occured since the snapshot was made, and the user therefore has
         * pending rewards
         */
        if (Troves[_borrower].status != Status.active) {
            return false;
        }

        return (rewardSnapshots[_borrower].StETH < L_StETH);
    }

    // Return the Troves entire debt and coll, including pending rewards from redistributions.
    function getEntireDebtAndColl(
        address _borrower
    )
        public
        view
        returns (
            uint debt,
            uint coll,
            uint pendingBaseFeeLMADebtReward,
            uint pendingStETHReward
        )
    {
        debt = Troves[_borrower].debt;
        coll = Troves[_borrower].coll;

        pendingBaseFeeLMADebtReward = getPendingBaseFeeLMADebtReward(_borrower);
        pendingStETHReward = getPendingStETHReward(_borrower);

        debt = debt.add(pendingBaseFeeLMADebtReward);
        coll = coll.add(pendingStETHReward);
    }

    function removeStake(address _borrower) external {
        _requireCallerIsBorrowerOperations();
        return _removeStake(_borrower);
    }

    // Remove borrower's stake from the totalStakes sum, and set their stake to 0
    function _removeStake(address _borrower) internal {
        uint stake = Troves[_borrower].stake;
        totalStakes = totalStakes.sub(stake);
        Troves[_borrower].stake = 0;
    }

    function updateStakeAndTotalStakes(
        address _borrower
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        return _updateStakeAndTotalStakes(_borrower);
    }

    // Update borrower's stake based on their latest collateral value
    function _updateStakeAndTotalStakes(
        address _borrower
    ) internal returns (uint) {
        uint newStake = _computeNewStake(Troves[_borrower].coll);
        uint oldStake = Troves[_borrower].stake;
        Troves[_borrower].stake = newStake;

        totalStakes = totalStakes.sub(oldStake).add(newStake);
        emit TotalStakesUpdated(totalStakes);

        return newStake;
    }

    // Calculate a new stake based on the snapshots of the totalStakes and totalCollateral taken at the last liquidation
    function _computeNewStake(uint _coll) internal view returns (uint) {
        uint stake;
        if (totalCollateralSnapshot == 0) {
            stake = _coll;
        } else {
            /*
             * The following assert() holds true because:
             * - The system always contains >= 1 trove
             * - When we close or liquidate a trove, we redistribute the pending rewards, so if all troves were closed/liquidated,
             * rewards would’ve been emptied and totalCollateralSnapshot would be zero too.
             */
            assert(totalStakesSnapshot > 0);
            stake = _coll.mul(totalStakesSnapshot).div(totalCollateralSnapshot);
        }
        return stake;
    }

    function _redistributeDebtAndColl(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint _debt,
        uint _coll
    ) internal {
        if (_debt == 0) {
            return;
        }

        /*
         * Add distributed coll and debt rewards-per-unit-staked to the running totals. Division uses a "feedback"
         * error correction, to keep the cumulative error low in the running totals L_StETH and L_BaseFeeLMADebt:
         *
         * 1) Form numerators which compensate for the floor division errors that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratios.
         * 3) Multiply each ratio back by its denominator, to reveal the current floor division error.
         * 4) Store these errors for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint StETHNumerator = _coll.mul(DECIMAL_PRECISION).add(
            lastStETHError_Redistribution
        );
        uint BaseFeeLMADebtNumerator = _debt.mul(DECIMAL_PRECISION).add(
            lastBaseFeeLMADebtError_Redistribution
        );

        // Get the per-unit-staked terms
        uint StETHRewardPerUnitStaked = StETHNumerator.div(totalStakes);
        uint BaseFeeLMADebtRewardPerUnitStaked = BaseFeeLMADebtNumerator.div(
            totalStakes
        );

        lastStETHError_Redistribution = StETHNumerator.sub(
            StETHRewardPerUnitStaked.mul(totalStakes)
        );
        lastBaseFeeLMADebtError_Redistribution = BaseFeeLMADebtNumerator.sub(
            BaseFeeLMADebtRewardPerUnitStaked.mul(totalStakes)
        );

        // Add per-unit-staked terms to the running totals
        L_StETH = L_StETH.add(StETHRewardPerUnitStaked);
        L_BaseFeeLMADebt = L_BaseFeeLMADebt.add(
            BaseFeeLMADebtRewardPerUnitStaked
        );

        emit LTermsUpdated(L_StETH, L_BaseFeeLMADebt);

        // Transfer coll and debt from ActivePool to DefaultPool
        _activePool.decreaseBaseFeeLMADebt(_debt);
        _defaultPool.increaseBaseFeeLMADebt(_debt);
        _defaultPool.increaseBalance(_coll);
        _activePool.sendStETH(address(_defaultPool), _coll);
    }

    function closeTrove(address _borrower) external {
        _requireCallerIsBorrowerOperations();
        return _closeTrove(_borrower, Status.closedByOwner);
    }

    function _closeTrove(address _borrower, Status closedStatus) internal {
        assert(
            closedStatus != Status.nonExistent && closedStatus != Status.active
        );

        uint TroveOwnersArrayLength = TroveOwners.length;
        _requireMoreThanOneTroveInSystem(TroveOwnersArrayLength);

        Troves[_borrower].status = closedStatus;
        Troves[_borrower].coll = 0;
        Troves[_borrower].debt = 0;

        rewardSnapshots[_borrower].StETH = 0;
        rewardSnapshots[_borrower].BaseFeeLMADebt = 0;

        _removeTroveOwner(_borrower, TroveOwnersArrayLength);
        sortedTroves.remove(_borrower);
    }

    /*
     * Updates snapshots of system total stakes and total collateral, excluding a given collateral remainder from the calculation.
     * Used in a liquidation sequence.
     *
     * The calculation excludes a portion of collateral that is in the ActivePool:
     *
     * the total StETH gas compensation from the liquidation sequence
     *
     * The StETH as compensation must be excluded as it is always sent out at the very end of the liquidation sequence.
     */
    function _updateSystemSnapshots_excludeCollRemainder(
        IActivePool _activePool,
        uint _collRemainder
    ) internal {
        totalStakesSnapshot = totalStakes;

        uint activeColl = _activePool.getStETH();
        uint liquidatedColl = defaultPool.getStETH();
        totalCollateralSnapshot = activeColl.sub(_collRemainder).add(
            liquidatedColl
        );

        emit SystemSnapshotsUpdated(
            totalStakesSnapshot,
            totalCollateralSnapshot
        );
    }

    // Push the owner's address to the Trove owners list, and record the corresponding array index on the Trove struct
    function addTroveOwnerToArray(
        address _borrower
    ) external returns (uint index) {
        _requireCallerIsBorrowerOperations();
        return _addTroveOwnerToArray(_borrower);
    }

    function _addTroveOwnerToArray(
        address _borrower
    ) internal returns (uint128 index) {
        /* Max array size is 2**128 - 1, i.e. ~3e30 troves. No risk of overflow, since troves have minimum BaseFeeLMA
        debt of liquidation reserve plus MIN_NET_DEBT. 3e30 BaseFeeLMA dwarfs the value of all wealth in the world ( which is < 1e15 USD). */

        // Push the Troveowner to the array
        TroveOwners.push(_borrower);

        // Record the index of the new Troveowner on their Trove struct
        index = uint128(TroveOwners.length.sub(1));
        Troves[_borrower].arrayIndex = index;

        return index;
    }

    /*
     * Remove a Trove owner from the TroveOwners array, not preserving array order. Removing owner 'B' does the following:
     * [A B C D E] => [A E C D], and updates E's Trove struct to point to its new array index.
     */
    function _removeTroveOwner(
        address _borrower,
        uint TroveOwnersArrayLength
    ) internal {
        Status troveStatus = Troves[_borrower].status;
        // It’s set in caller function `_closeTrove`
        assert(
            troveStatus != Status.nonExistent && troveStatus != Status.active
        );

        uint128 index = Troves[_borrower].arrayIndex;
        uint length = TroveOwnersArrayLength;
        uint idxLast = length.sub(1);

        assert(index <= idxLast);

        address addressToMove = TroveOwners[idxLast];

        TroveOwners[index] = addressToMove;
        Troves[addressToMove].arrayIndex = index;
        emit TroveIndexUpdated(addressToMove, index);

        TroveOwners.pop();
    }

    // --- Recovery Mode and TCR functions ---

    function getTCR(uint _price) external view returns (uint) {
        return _getTCR(_price);
    }

    function getUnreliableTCR() external view returns (uint) {
        return _getTCR(priceFeed.lastGoodPrice());
    }

    function checkRecoveryMode(uint _price) external view returns (bool) {
        return _checkRecoveryMode(_price);
    }

    function checkUnreliableRecoveryMode() external view returns (bool) {
        return _checkRecoveryMode(priceFeed.lastGoodPrice());
    }

    // Check whether or not the system *would be* in Recovery Mode, given an StETH:USD price, and the entire system coll and debt.
    function _checkPotentialRecoveryMode(
        uint _entireSystemColl,
        uint _entireSystemDebt,
        uint _price
    ) internal pure returns (bool) {
        uint TCR = LiquityMath._computeCR(
            _entireSystemColl,
            _entireSystemDebt,
            _price
        );

        return TCR < CCR;
    }

    // --- Redemption fee functions ---

    /*
     * HEDGEHOG LOGIC UPDATES:
     * 1) Rename variable in docs (baseRate => redemptionBaseRate)
     * 2) decayedRemeptionBaseRate (decayedBaseRate) is now calculated by _calcDecayedRedemptionBaseRate();
     * 3) Updating RedemptionBaseRate state variable instead of baseRate
     * 4) Emiting RedemptionBaseRateUpdated instead of BaseRateUpdates();
     * 5) Now updates time only of redemeption operation instead of both redemption and borrow
     *
     * This function has two impacts on the redemptionBaseRate state variable:
     * 1) decays the redemptionBaseRate based on time passed since last redemption or BaseFeeLMA borrowing operation.
     * then,
     * 2) increases the redemptionBaseRate based on the amount redeemed, as a proportion of total supply
     */
    function _updateRedemptionBaseRateFromRedemption(
        uint _StETHDrawn,
        uint _price,
        uint _totalBaseFeeLMASupply
    ) internal returns (uint) {
        uint decayedRedemptionBaseRate = _calcDecayedRedemptionBaseRate();
        // Hedgehog updates: Now calculating what part of total collateral is getting withdrawn from the
        // system
        /* Convert the drawn StETH back to BaseFeeLMA at face value rate (1 BaseFeeLMA:1 USD), in order to get
         * the fraction of total supply that was redeemed at face value. */
        uint redeemedBaseFeeLMAFraction = _StETHDrawn
            .mul(DECIMAL_PRECISION)
            .div(activePool.getStETH());

        // Hedgehog Updates: Remove division by BETA
        uint newBaseRate = decayedRedemptionBaseRate.add(
            redeemedBaseFeeLMAFraction
        );

        newBaseRate = LiquityMath._min(newBaseRate, DECIMAL_PRECISION); // cap baseRate at a maximum of 100%
        //assert(newBaseRate <= DECIMAL_PRECISION); // This is already enforced in the line above
        assert(newBaseRate > 0); // Base rate is always non-zero after redemption

        // Update the baseRate state variable
        redemptionBaseRate = newBaseRate;
        emit RedemptionBaseRateUpdated(newBaseRate);

        _updateLastRedemptionTime();
        return newBaseRate;
    }

    /*
     * HEDGEHOG LOGIC UPDATES:
     * 1) Now passing redemptionBaseRate instead of combined baseRate
     */
    function getRedemptionRate(
        uint _redemptionColl
    ) public view returns (uint) {
        return _calcRedemptionRate(redemptionBaseRate, _redemptionColl);
    }

    function getRedemptionRateWithDecay(
        uint _redemptionColl
    ) public view returns (uint) {
        return
            _calcRedemptionRate(
                _calcDecayedRedemptionBaseRate(),
                _redemptionColl
            );
    }

    /*
     * HEDGEHOG UPDATES:
     * Redemption Rate formula now is: RedFloor + RedBaseRate*MinuteDecayFactorMinutes + RedemptionETH/TotalColl
     * 1) Rename param name (_baseRate => _redemptionBaseRate)
     * 2) Now redeemed collateral divided by total collateral in active pool is added to the sum of redemption floor and redeem base rate
     */
    function _calcRedemptionRate(
        uint _redemptionBaseRate,
        uint _redemptionColl
    ) internal view returns (uint) {
        return
            LiquityMath._min(
                REDEMPTION_FEE_FLOOR.add(_redemptionBaseRate).add(
                    _redemptionColl.div(activePool.getStETH())
                ),
                DECIMAL_PRECISION // cap at a maximum of 100%
            );
    }

    function _getRedemptionFee(uint _StETHDrawn) internal view returns (uint) {
        return _calcRedemptionFee(getRedemptionRate(_StETHDrawn), _StETHDrawn);
    }

    function getRedemptionFeeWithDecay(
        uint _StETHDrawn
    ) external view returns (uint) {
        return
            _calcRedemptionFee(
                getRedemptionRateWithDecay(_StETHDrawn),
                _StETHDrawn
            );
    }

    function _calcRedemptionFee(
        uint _redemptionRate,
        uint _StETHDrawn
    ) internal pure returns (uint) {
        uint redemptionFee = _redemptionRate.mul(_StETHDrawn).div(
            DECIMAL_PRECISION
        );
        require(
            redemptionFee < _StETHDrawn,
            "TroveManager: Fee would eat up all returned collateral"
        );
        return redemptionFee;
    }

    // --- Borrowing fee functions ---

    /*
     * HEDGEHOG LOGIC UPDATES:
     * 1) Now passing borrowBaseRate instead of combined baseRate
     */
    function getBorrowingRate(
        uint _issuedBaseFeeLMA
    ) public view returns (uint) {
        return _calcBorrowingRate(borrowBaseRate, _issuedBaseFeeLMA);
    }

    /*
     * HEDGEHOG LOGIC UPDATES:
     * 1) Now passing _calcDecayedBorrowBaseRate instead of _calcDecayedBaseRate function to calculate the decayed borrowBaseRate
     */
    function getBorrowingRateWithDecay(
        uint _issuedBaseFeeLMA
    ) public view returns (uint) {
        return
            _calcBorrowingRate(
                _calcDecayedRedemptionBaseRate(),
                _issuedBaseFeeLMA
            );
    }

    /*
     * HEDGEHOG UPDATES:
     * Now full dynamic fees formula is as follows: RedRate = RedFloor + RedBaseRate*MinuteDecayFactorMinutes + RedemptionETH / Total Collateral in the system
     * 1) Rename param name (_baseRate => _borrowBaseRate)
     * 2) Now adding issued asset divided by total supply of the asset to the sum of borrow flor and borrow decayed baseRate
     */
    function _calcBorrowingRate(
        uint _borrowBaseRate,
        uint _issuedBaseFeeLMA
    ) internal view returns (uint) {
        uint256 supply = baseFeeLMAToken.totalSupply();
        console.log("base rate: ", _borrowBaseRate);
        console.log("supply: ", supply);
        console.log("issued bf: ", _issuedBaseFeeLMA);
        // Checking if there are tokens in supply, otherwise return 1 to avoid division by zero
        if (supply == 0) {
            return BORROWING_FEE_FLOOR;
        }

        return
            LiquityMath._min(
                BORROWING_FEE_FLOOR.add(_borrowBaseRate).add(
                    _issuedBaseFeeLMA.mul(DECIMAL_PRECISION).div(supply)
                ),
                MAX_BORROWING_FEE
            );
    }

    function getBorrowingFee(
        uint _BaseFeeLMADebt
    ) external view returns (uint, uint) {
        uint baseRate = getBorrowingRate(_BaseFeeLMADebt);
        return (_calcBorrowingFee(baseRate, _BaseFeeLMADebt), baseRate);
    }

    function getBorrowingFeeWithDecay(
        uint _BaseFeeLMADebt
    ) external view returns (uint) {
        return
            _calcBorrowingFee(
                getBorrowingRateWithDecay(_BaseFeeLMADebt),
                _BaseFeeLMADebt
            );
    }

    function _calcBorrowingFee(
        uint _borrowingRate,
        uint _BaseFeeLMADebt
    ) internal pure returns (uint) {
        return _borrowingRate.mul(_BaseFeeLMADebt).div(DECIMAL_PRECISION);
    }

    function updateBaseRateFromBorrowing(uint _newBaseRate) external {
        require(
            msg.sender == borrowerOperationsAddress,
            "TroveManager: Only Borrower operations may call"
        );
        if (_newBaseRate >= BORROWING_FEE_FLOOR) {
            borrowBaseRate = _newBaseRate - BORROWING_FEE_FLOOR;
        } else {
            borrowBaseRate = 0;
        }

        emit BorrowBaseRateUpdated(_newBaseRate);
    }

    /*
     * HEDGEHOG LOGIC UPDATES:
     * 1) Now updates borrowBaseRate instead of baseRate used by both redemption and minting functions
     * 2) Emit BorrowBaseRateUpdated instead of BaseRateUpdated
     * 3) Now updates time only of borrow operation instead of both redemption and borrow
     * 4) Update doc variable name baseRate => borrowBaseRate
     */
    // Updates the borrowBaseRate state variable based on time elapsed since the last redemption or BaseFeeLMA borrowing operation.
    function decayBaseRateFromBorrowing() external {
        _requireCallerIsBorrowerOperations();
        console.log("base rate before decay: ", borrowBaseRate);
        uint decayedBaseRate = _calcDecayedBorrowBaseRate();
        assert(decayedBaseRate <= DECIMAL_PRECISION); // The baseRate can decay to 0
        // HEDGEHOG LOGIC CHANGES: Updating borrowing base rate instead
        borrowBaseRate = decayedBaseRate;

        emit BorrowBaseRateUpdated(decayedBaseRate);

        _updateLastBorrowTime();
    }

    // --- Internal fee functions ---

    /*
     * HEDGEHOG LOGIC UPDATES:
     * removed _updateLastFeeOpTime
     * New function _updateLastRedemptionTime simmilar to _updateLastFeeOpTime, that sets lastRedemptionTime and emits respective event.
     */
    // Update the last fee operation time only if time passed >= decay interval. This prevents base rate griefing.
    function _updateLastRedemptionTime() internal {
        uint timePassed = block.timestamp.sub(lastRedemptionTime);

        if (timePassed >= SECONDS_IN_ONE_MINUTE) {
            lastRedemptionTime = block.timestamp;
            emit LastRedemptionTimeUpdated(block.timestamp);
        }
    }

    /*
     * HEDGEHOG LOGIC UPDATES:
     * removed _updateLastFeeOpTime
     * New function _updateLastBorrowTime simmilar to _updateLastFeeOpTime, that sets lastBorrowTime and emits respective event.
     */
    // Update the last fee operation time only if time passed >= decay interval. This prevents base rate griefing.
    function _updateLastBorrowTime() internal {
        uint timePassed = block.timestamp.sub(lastBorrowTime);

        if (timePassed >= SECONDS_IN_ONE_MINUTE) {
            lastBorrowTime = block.timestamp;
            emit LastBorrowTimeUpdated(block.timestamp);
        }
    }

    /*
     * HEDGEHOG LOGIC UPDATES:
     * New function simmilar to _calcDecayedBaseRate. However used particularly for redemptionBaseRate calculation
     */
    function _calcDecayedRedemptionBaseRate() internal view returns (uint) {
        uint minutesPassed = _minutesPassedSinceLastRedemption();
        uint decayFactor = LiquityMath._decPow(
            MINUTE_DECAY_REDEMPTION_FACTOR,
            minutesPassed
        );
        return redemptionBaseRate.mul(decayFactor).div(DECIMAL_PRECISION);
    }

    /*
     * HEDGEHOG LOGIC UPDATES:
     * New function simmilar to _calcDecayedBaseRate. However used particularly for borrowBaseRate calculation
     */
    function _calcDecayedBorrowBaseRate() internal view returns (uint) {
        uint minutesPassed = _minutesPassedSinceLastBorrow();
        console.log("minutes pass: ", minutesPassed);
        uint decayFactor = LiquityMath._decPow(
            MINUTE_DECAY_BORROWING_FACTOR,
            minutesPassed
        );

        return borrowBaseRate.mul(decayFactor).div(DECIMAL_PRECISION);
    }

    /*
     * HEDGEHOG LOGIC UPDATES:
     * removed _minutesPassedSinceLastFeeOp
     * New function _minutesPassedSinceLastRedemption simmilar to _minutesPassedSinceLastFeeOp, that returns amount of minutes since last registered redemption
     */
    function _minutesPassedSinceLastRedemption() internal view returns (uint) {
        return
            (block.timestamp.sub(lastRedemptionTime)).div(
                SECONDS_IN_ONE_MINUTE
            );
    }

    /*
     * HEDGEHOG LOGIC UPDATES:
     * removed _minutesPassedSinceLastFeeOp
     * New function _minutesPassedSinceLastBorrow simmilar to _minutesPassedSinceLastFeeOp, that returns amount of minutes since last registered borrow
     */
    function _minutesPassedSinceLastBorrow() internal view returns (uint) {
        return (block.timestamp.sub(lastBorrowTime)).div(SECONDS_IN_ONE_MINUTE);
    }

    // --- 'require' wrapper functions ---

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "TroveManager: Caller is not the BorrowerOperations contract"
        );
    }

    function _requireTroveIsActive(address _borrower) internal view {
        require(
            Troves[_borrower].status == Status.active,
            "TroveManager: Trove does not exist or is closed"
        );
    }

    function _requireBaseFeeLMABalanceCoversRedemption(
        IBaseFeeLMAToken _baseFeeLMAToken,
        address _redeemer,
        uint _amount
    ) internal view {
        require(
            _baseFeeLMAToken.balanceOf(_redeemer) >= _amount,
            "TroveManager: Requested redemption amount must be <= user's BaseFeeLMA token balance"
        );
    }

    function _requireMoreThanOneTroveInSystem(
        uint TroveOwnersArrayLength
    ) internal view {
        require(
            TroveOwnersArrayLength > 1 && sortedTroves.getSize() > 1,
            "TroveManager: Only one trove in the system"
        );
    }

    function _requireAmountGreaterThanZero(uint _amount) internal pure {
        require(_amount > 0, "TroveManager: Amount must be greater than zero");
    }

    function _requireTCRoverMCR(uint _price) internal view {
        require(
            _getTCR(_price) >= MCR,
            "TroveManager: Cannot redeem when TCR < MCR"
        );
    }

    function _requireAfterBootstrapPeriod() internal view {
        uint systemDeploymentTime = hogToken.getDeploymentStartTime();
        require(
            block.timestamp >= systemDeploymentTime.add(BOOTSTRAP_PERIOD),
            "TroveManager: Redemptions are not allowed during bootstrap phase"
        );
    }

    function _requireValidMaxFeePercentage(
        uint _maxFeePercentage
    ) internal pure {
        require(
            _maxFeePercentage >= REDEMPTION_FEE_FLOOR &&
                _maxFeePercentage <= DECIMAL_PRECISION,
            "Max fee percentage must be between 0.5% and 100%"
        );
    }

    // --- Trove property getters ---

    function getTroveStatus(address _borrower) external view returns (uint) {
        return uint(Troves[_borrower].status);
    }

    function getTroveStake(address _borrower) external view returns (uint) {
        return Troves[_borrower].stake;
    }

    function getTroveDebt(address _borrower) external view returns (uint) {
        return Troves[_borrower].debt;
    }

    function getTroveColl(address _borrower) external view returns (uint) {
        return Troves[_borrower].coll;
    }

    // --- Trove property setters, called by BorrowerOperations ---

    function setTroveStatus(address _borrower, uint _num) external {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].status = Status(_num);
    }

    function increaseTroveColl(
        address _borrower,
        uint _collIncrease
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint newColl = Troves[_borrower].coll.add(_collIncrease);
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function decreaseTroveColl(
        address _borrower,
        uint _collDecrease
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint newColl = Troves[_borrower].coll.sub(_collDecrease);
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function increaseTroveDebt(
        address _borrower,
        uint _debtIncrease
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint newDebt = Troves[_borrower].debt.add(_debtIncrease);
        Troves[_borrower].debt = newDebt;
        return newDebt;
    }

    function decreaseTroveDebt(
        address _borrower,
        uint _debtDecrease
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint newDebt = Troves[_borrower].debt.sub(_debtDecrease);
        Troves[_borrower].debt = newDebt;
        return newDebt;
    }

    function getNormalLiquidationPrice(
        uint256 _coll,
        uint256 _debt
    ) external pure returns (uint256) {
        uint256 price = LiquityMath._findPriceBelowMCR(
            _coll,
            _debt,
            20,
            HedgehogBase.MCR
        );
        return price;
    }

    function getRecoveryLiquidationPrice(
        uint256 _coll,
        uint256 _debt
    ) external pure returns (uint256) {
        uint256 price = LiquityMath._findPriceBelowMCR(
            _coll,
            _debt,
            20,
            HedgehogBase._100pct
        );
        return price;
    }
}
