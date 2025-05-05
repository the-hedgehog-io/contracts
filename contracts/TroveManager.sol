// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/ITroveManager.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IBaseFeeLMAToken.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/IHOGToken.sol";
import "./interfaces/IFeesRouter.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./dependencies/HedgehogBase.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";

/**
 * @notice Fork of Liquity's TroveManager. Most of the Logic remains unchanged.
 * Changes to the contract:
 * - Raised pragma version
 * - SafeMath is removed & native math operators are used from this point
 * - Removed an import of ActivePool Interface
 * - Logic updates with redemption & borrowing fees calculation and their distribution
 */

contract TroveManager is HedgehogBase, Ownable, CheckContract, ITroveManager {
    string public constant NAME = "TroveManager";

    // --- Connected contract declarations ---

    address public borrowerOperationsAddress;

    IStabilityPool public stabilityPool;

    address gasPoolAddress;

    ICollSurplusPool collSurplusPool;

    IBaseFeeLMAToken public baseFeeLMAToken;

    IHOGToken public hogToken;

    IFeesRouter public feesRouter;

    // A doubly linked list of Troves, sorted by their sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    // --- Data structures ---

    uint public constant SECONDS_IN_ONE_MINUTE = 60;
    /*
     * Half-life of 12h. 12h = 720 min
     * (1/2) = d^720 => d = (1/2)^(1/720)
     */
    // HEDGEHOG UPDATES: Redemption and Borrowing Decay factors are now different variables
    uint public constant MINUTE_DECAY_REDEMPTION_FACTOR = 999037758833783000;
    uint public constant MINUTE_DECAY_BORROWING_FACTOR = 991152865945140000;
    uint public constant REDEMPTION_FEE_FLOOR = (DECIMAL_PRECISION / 1000) * 5; // 0.5%
    // HEDGEHOG UPDATES: Can reach 100% now
    uint public constant MAX_BORROWING_FEE = DECIMAL_PRECISION; // 100%

    // During bootsrap period redemptions are not allowed
    uint public immutable BOOTSTRAP_PERIOD; // 14 days for mainnet
    uint public immutable SYSTEM_DEPLOYMENT_TIME;

    // HEDGEHOG UPDATES: BaseRate is different for redemption and minting tokens
    // 1) Remove baseRate variable
    // 2) Create redemptionBaseRate public state variable
    // 3) Create borrowBaseRate public state variable
    uint public redemptionBaseRate;
    uint public borrowBaseRate;

    // HEDGEHOG UPDATES: lastFeeOperationTime is different for redemption and minting tokens
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
        uint256 lastBlockUpdated; // Hedgehog Updates: New Field in the Trove structure that holds last block update of a trove. Keeps in place even if trove get's closed
    }

    mapping(address => Trove) public Troves;

    uint public totalStakes;

    // Snapshot of the value of totalStakes, taken immediately after the latest liquidation
    uint public totalStakesSnapshot;

    // Snapshot of the total collateral across the ActivePool and DefaultPool, immediately after the latest liquidation.
    uint public totalCollateralSnapshot;

    /*
     * L_WStETH and L_BaseFeeLMADebt track the sums of accumulated liquidation rewards per unit staked. During its lifetime, each stake earns:
     *
     * An WStETH gain of ( stake * [L_WStETH - L_WStETH(0)] )
     * A BaseFeeLMADebt increase  of ( stake * [L_BaseFeeLMADebt - L_BaseFeeLMADebt(0)] )
     *
     * Where L_WStETH(0) and L_BaseFeeLMADebt(0) are snapshots of L_WStETH and L_BaseFeeLMADebt for the active Trove taken at the instant the stake was made
     */
    uint public L_WStETH;
    uint public L_BaseFeeLMADebt;

    // Map addresses with active troves to their RewardSnapshot
    mapping(address => RewardSnapshot) public rewardSnapshots;

    // Object containing the WStETH and BaseFeeLMA snapshots for a given active trove
    struct RewardSnapshot {
        uint WStETH;
        uint BaseFeeLMADebt;
    }

    // Array of all active trove addresses - used to to compute an approximate hint off-chain, for the sorted list insertion
    address[] public TroveOwners;

    // Error trackers for the trove redistribution calculation
    uint public lastWStETHError_Redistribution;
    uint public lastBaseFeeLMADebtError_Redistribution;

    /*
     * --- Variable container structs for liquidations ---
     *
     * These structs are used to hold, return and assign variables inside the liquidation functions,
     * in order to avoid the error: "CompilerError: Stack too deep".
     **/

    struct LocalVariables_OuterLiquidationFunction {
        uint price;
        uint BaseFeeLMAForOffsets;
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
        uint remainingBaseFeeLMAForOffsets;
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
        ISortedTroves sortedTroves;
        ICollSurplusPool collSurplusPool;
        address gasPoolAddress;
    }
    // --- Variable container structs for redemptions ---

    struct RedemptionTotals {
        uint remainingBaseFeeLMA;
        uint totalBaseFeeLMAToRedeem;
        uint totalWStETHDrawn;
        uint WStETHFee;
        uint WStETHToSendToRedeemer;
        // HEDGEHOG UPDATES: BaseRate is different for redemption and minting tokens
        // Rename decayedBaseRate into decayedRedemptionBaseRate
        uint decayedRedemptionBaseRate;
        uint price;
        uint totalBaseFeeLMASupplyAtStart;
    }

    struct SingleRedemptionValues {
        uint BaseFeeLMALot;
        uint WStETHLot;
        bool cancelledPartial;
    }

    // --- Events ---

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

    // HEDGEHOG UPDATES: BaseRate is different for redemption and minting tokens
    // 1) Remove BaseRateUpdated event
    // 2) Create RedemptionBaseRateUpdated event that accepts _redemptionBaseRate
    // 3) Create BorrowBaseRateUpdated event that accepts _borrowBaseRate
    event RedemptionBaseRateUpdated(uint _redemptionBaseRate);
    event BorrowBaseRateUpdated(uint _borrowBaseRate);

    // HEDGEHOG UPDATES: BaseRate is different for redemption and minting tokens
    // 1) Remove LastFeeOpTimeUpdated event
    // 2) Create LastRedemptionTimeUpdated event that accepts _lastRedemptionTime
    // 3) Create LastBorrowTimeUpdated event that accepts _lastBorrowTime
    event LastRedemptionTimeUpdated(uint _lastRedemptionTime);
    event LastBorrowTimeUpdated(uint _lastBorrowTime);

    enum TroveManagerOperation {
        applyPendingRewards,
        liquidateInNormalMode,
        liquidateInRecoveryMode,
        redeemCollateral
    }

    constructor(uint256 _bootsrapDaysAmount) {
        BOOTSTRAP_PERIOD = _bootsrapDaysAmount * 60 * 60 * 24;
        SYSTEM_DEPLOYMENT_TIME = block.timestamp;
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
        address _feesRouterAddress
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
        checkContract(_feesRouterAddress);

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
        uint _BaseFeeLMAForOffsets
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
            .BaseFeeLMAGasCompensation = BaseFeeLMA_GAS_COMPENSATION;
        uint collToLiquidate = singleLiquidation.entireTroveColl -
            singleLiquidation.collGasCompensation;

        (
            singleLiquidation.debtToOffset,
            singleLiquidation.collToSendToSP,
            singleLiquidation.debtToRedistribute,
            singleLiquidation.collToRedistribute
        ) = _getOffsetAndRedistributionVals(
            singleLiquidation.entireTroveDebt,
            collToLiquidate,
            _BaseFeeLMAForOffsets
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
        uint _BaseFeeLMAForOffsets,
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
        vars.collToLiquidate =
            singleLiquidation.entireTroveColl -
            singleLiquidation.collGasCompensation;

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
                _BaseFeeLMAForOffsets
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
            (singleLiquidation.entireTroveDebt <= _BaseFeeLMAForOffsets)
        ) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            assert(_BaseFeeLMAForOffsets != 0);

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
            // if (_ICR >= MCR && ( _ICR >= _TCR || singleLiquidation.entireTroveDebt > _BaseFeeLMAForOffsets))
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
        uint _BaseFeeLMAForOffsets
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
        if (_BaseFeeLMAForOffsets > 0) {
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
            debtToOffset = LiquityMath._min(_debt, _BaseFeeLMAForOffsets);
            collToSendToSP = (_coll * debtToOffset) / _debt;
            debtToRedistribute = _debt - debtToOffset;
            collToRedistribute = _coll - collToSendToSP;
        } else {
            debtToOffset = 0;
            collToSendToSP = 0;
            debtToRedistribute = _debt;
            collToRedistribute = _coll;
        }
    }

    /*
     *  Get its offset coll/debt and WStETH gas comp, and close the trove.
     */
    function _getCappedOffsetVals(
        uint _entireTroveDebt,
        uint _entireTroveColl,
        uint _price
    ) internal pure returns (LiquidationValues memory singleLiquidation) {
        singleLiquidation.entireTroveDebt = _entireTroveDebt;
        singleLiquidation.entireTroveColl = _entireTroveColl;

        // HEDGEHOG UPDATES:
        // Changed the cappedCollPortion formula from [entireTroveDebt] * [MCR] / [price]  to => [entireTroveDebt] * [MCR] / [DECIMAL_PRECISION] * [price] / [DECIMAL_PRECISION]
        uint cappedCollPortion = (((_entireTroveDebt * MCR) /
            DECIMAL_PRECISION) * _price) / DECIMAL_PRECISION;

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            cappedCollPortion
        );
        singleLiquidation
            .BaseFeeLMAGasCompensation = BaseFeeLMA_GAS_COMPENSATION;

        singleLiquidation.debtToOffset = _entireTroveDebt;
        singleLiquidation.collToSendToSP =
            cappedCollPortion -
            singleLiquidation.collGasCompensation;
        singleLiquidation.collSurplus = _entireTroveColl - cappedCollPortion;
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
            sortedTroves,
            ICollSurplusPool(address(0)),
            address(0)
        );
        IStabilityPool stabilityPoolCached = stabilityPool;

        LocalVariables_OuterLiquidationFunction memory vars;

        LiquidationTotals memory totals;

        vars.price = priceFeed.fetchPrice();
        vars.BaseFeeLMAForOffsets = stabilityPoolCached.getMaxAmountToOffset();
        vars.recoveryModeAtStart = _checkRecoveryMode(vars.price);

        // Perform the appropriate liquidation sequence - tally the values, and obtain their totals
        if (vars.recoveryModeAtStart) {
            totals = _getTotalsFromLiquidateTrovesSequence_RecoveryMode(
                contractsCache,
                vars.price,
                vars.BaseFeeLMAForOffsets,
                _n
            );
        } else {
            // if !vars.recoveryModeAtStart
            totals = _getTotalsFromLiquidateTrovesSequence_NormalMode(
                contractsCache.activePool,
                contractsCache.defaultPool,
                vars.price,
                vars.BaseFeeLMAForOffsets,
                _n
            );
        }

        require(
            totals.totalDebtInSequence > 0,
            "TroveManager: nothing to liquidate"
        );

        // Move liquidated WStETH and BaseFeeLMA to the appropriate pools
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
            collSurplusPool.increaseBalance(totals.totalCollSurplus);
            contractsCache.activePool.sendWStETH(
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
        vars.liquidatedColl =
            totals.totalCollInSequence -
            totals.totalCollGasCompensation -
            totals.totalCollSurplus;
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
        uint _BaseFeeLMAForOffsets,
        uint _n
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingBaseFeeLMAForOffsets = _BaseFeeLMAForOffsets;
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
                    vars.ICR >= MCR && vars.remainingBaseFeeLMAForOffsets == 0
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
                    vars.remainingBaseFeeLMAForOffsets,
                    TCR,
                    _price
                );

                // Update aggregate trackers
                vars.remainingBaseFeeLMAForOffsets =
                    vars.remainingBaseFeeLMAForOffsets -
                    singleLiquidation.debtToOffset;
                vars.entireSystemDebt =
                    vars.entireSystemDebt -
                    singleLiquidation.debtToOffset;
                vars.entireSystemColl =
                    vars.entireSystemColl -
                    singleLiquidation.collToSendToSP -
                    singleLiquidation.collGasCompensation -
                    singleLiquidation.collSurplus;

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
                    vars.remainingBaseFeeLMAForOffsets
                );

                vars.remainingBaseFeeLMAForOffsets =
                    vars.remainingBaseFeeLMAForOffsets -
                    singleLiquidation.debtToOffset;

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
        uint _BaseFeeLMAForOffsets,
        uint _n
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;
        ISortedTroves sortedTrovesCached = sortedTroves;

        vars.remainingBaseFeeLMAForOffsets = _BaseFeeLMAForOffsets;

        for (vars.i = 0; vars.i < _n; vars.i++) {
            vars.user = sortedTrovesCached.getLast();
            vars.ICR = getCurrentICR(vars.user, _price);

            if (vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingBaseFeeLMAForOffsets
                );

                vars.remainingBaseFeeLMAForOffsets =
                    vars.remainingBaseFeeLMAForOffsets -
                    singleLiquidation.debtToOffset;

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
        vars.BaseFeeLMAForOffsets = stabilityPoolCached.getMaxAmountToOffset();

        vars.recoveryModeAtStart = _checkRecoveryMode(vars.price);
        // Perform the appropriate liquidation sequence - tally values and obtain their totals.
        if (vars.recoveryModeAtStart) {
            totals = _getTotalFromBatchLiquidate_RecoveryMode(
                activePoolCached,
                defaultPoolCached,
                vars.price,
                vars.BaseFeeLMAForOffsets,
                _troveArray
            );
        } else {
            //  if !vars.recoveryModeAtStart
            totals = _getTotalsFromBatchLiquidate_NormalMode(
                activePoolCached,
                defaultPoolCached,
                vars.price,
                vars.BaseFeeLMAForOffsets,
                _troveArray
            );
        }
        require(
            totals.totalDebtInSequence > 0,
            "TroveManager: nothing to liquidate"
        );

        // Move liquidated WStETH and BaseFeeLMA to the appropriate pools
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
        if (totals.totalCollSurplus > 0) {
            collSurplusPool.increaseBalance(totals.totalCollSurplus);
            activePoolCached.sendWStETH(
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

        vars.liquidatedColl =
            totals.totalCollInSequence -
            totals.totalCollGasCompensation -
            totals.totalCollSurplus;
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
        uint _BaseFeeLMAForOffsets,
        address[] memory _troveArray
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingBaseFeeLMAForOffsets = _BaseFeeLMAForOffsets;
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
                    vars.ICR >= MCR && vars.remainingBaseFeeLMAForOffsets == 0
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
                    vars.remainingBaseFeeLMAForOffsets,
                    TCR,
                    _price
                );

                // Update aggregate trackers
                vars.remainingBaseFeeLMAForOffsets =
                    vars.remainingBaseFeeLMAForOffsets -
                    singleLiquidation.debtToOffset;
                vars.entireSystemDebt =
                    vars.entireSystemDebt -
                    singleLiquidation.debtToOffset;

                vars.entireSystemColl =
                    vars.entireSystemColl -
                    singleLiquidation.collToSendToSP -
                    singleLiquidation.collGasCompensation -
                    singleLiquidation.collSurplus;

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
                    vars.remainingBaseFeeLMAForOffsets
                );
                vars.remainingBaseFeeLMAForOffsets =
                    vars.remainingBaseFeeLMAForOffsets -
                    singleLiquidation.debtToOffset;

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
        uint _BaseFeeLMAForOffsets,
        address[] memory _troveArray
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingBaseFeeLMAForOffsets = _BaseFeeLMAForOffsets;

        for (vars.i = 0; vars.i < _troveArray.length; vars.i++) {
            vars.user = _troveArray[vars.i];
            vars.ICR = getCurrentICR(vars.user, _price);

            if (vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingBaseFeeLMAForOffsets
                );

                vars.remainingBaseFeeLMAForOffsets =
                    vars.remainingBaseFeeLMAForOffsets -
                    singleLiquidation.debtToOffset;

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
        newTotals.totalCollGasCompensation =
            oldTotals.totalCollGasCompensation +
            singleLiquidation.collGasCompensation;
        newTotals.totalBaseFeeLMAGasCompensation =
            oldTotals.totalBaseFeeLMAGasCompensation +
            singleLiquidation.BaseFeeLMAGasCompensation;
        newTotals.totalDebtInSequence =
            oldTotals.totalDebtInSequence +
            singleLiquidation.entireTroveDebt;
        newTotals.totalCollInSequence =
            oldTotals.totalCollInSequence +
            singleLiquidation.entireTroveColl;
        newTotals.totalDebtToOffset =
            oldTotals.totalDebtToOffset +
            singleLiquidation.debtToOffset;
        newTotals.totalCollToSendToSP =
            oldTotals.totalCollToSendToSP +
            singleLiquidation.collToSendToSP;
        newTotals.totalDebtToRedistribute =
            oldTotals.totalDebtToRedistribute +
            singleLiquidation.debtToRedistribute;
        newTotals.totalCollToRedistribute =
            oldTotals.totalCollToRedistribute +
            singleLiquidation.collToRedistribute;
        newTotals.totalCollSurplus =
            oldTotals.totalCollSurplus +
            singleLiquidation.collSurplus;

        return newTotals;
    }

    function _sendGasCompensation(
        IActivePool _activePool,
        address _liquidator,
        uint _BaseFeeLMA,
        uint _WStETH
    ) internal {
        if (_BaseFeeLMA > 0) {
            baseFeeLMAToken.returnFromPool(
                gasPoolAddress,
                _liquidator,
                _BaseFeeLMA
            );
        }

        if (_WStETH > 0) {
            _activePool.sendWStETH(_liquidator, _WStETH);
        }
    }

    // Move a Trove's pending debt and collateral rewards from distributions, from the Default Pool to the Active Pool
    function _movePendingTroveRewardsToActivePool(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint _BaseFeeLMA,
        uint _WStETH
    ) internal {
        _defaultPool.decreaseBaseFeeLMADebt(_BaseFeeLMA);
        _activePool.increaseBaseFeeLMADebt(_BaseFeeLMA);

        _defaultPool.sendWStETHToActivePool(_WStETH);
    }

    // --- Redemption functions ---

    // Redeem as much collateral as possible from _borrower's Trove in exchange for BaseFeeLMA up to _maxBaseFeeLMAamount
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
            Troves[_borrower].debt - BaseFeeLMA_GAS_COMPENSATION
        );

        // Get the WStETHLot of equivalent value in BaseFeeLMA
        // HEDGEHOG UPDATES: Change WStETHLOT calculations formula from [debtToBeRedeemed * price * 10e9] to [debtToBeRedeemed * price / 10e18]
        singleRedemption.WStETHLot =
            (singleRedemption.BaseFeeLMALot * _price) /
            DECIMAL_PRECISION;

        // Decrease the debt and collateral of the current Trove according to the BaseFeeLMA lot and corresponding WStETH to send
        uint newDebt = (Troves[_borrower].debt) -
            singleRedemption.BaseFeeLMALot;
        uint newColl = (Troves[_borrower].coll) - singleRedemption.WStETHLot;

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
     * The redeemer swaps (debt - liquidation reserve) BaseFeeLMA for (debt - liquidation reserve) worth of WStETH, so the BaseFeeLMA liquidation reserve left corresponds to the remaining debt.
     * In order to close the trove, the BaseFeeLMA liquidation reserve is burned, and the corresponding debt is removed from the active pool.
     * The debt recorded on the trove's struct is zero'd elsewhere, in _closeTrove.
     * Any surplus WStETH left in the trove, is sent to the Coll surplus pool, and can be later claimed by the borrower.
     */
    function _redeemCloseTrove(
        ContractsCache memory _contractsCache,
        address _borrower,
        uint _BaseFeeLMA,
        uint _WStETH
    ) internal {
        _contractsCache.baseFeeLMAToken.burn(gasPoolAddress, _BaseFeeLMA);
        // Update Active Pool BaseFeeLMA, and send WStETH to account
        _contractsCache.activePool.decreaseBaseFeeLMADebt(_BaseFeeLMA);

        // send WStETH from Active Pool to CollSurplus Pool
        _contractsCache.collSurplusPool.increaseBalance(_WStETH);
        _contractsCache.collSurplusPool.accountSurplus(_borrower, _WStETH);

        _contractsCache.activePool.sendWStETH(
            address(_contractsCache.collSurplusPool),
            _WStETH
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
            sortedTroves,
            collSurplusPool,
            gasPoolAddress
        );
        RedemptionTotals memory totals;

        _requireValidMaxFeePercentage(_maxFeePercentage);
        _requireAfterBootstrapPeriod();
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
            totals.totalBaseFeeLMAToRedeem =
                totals.totalBaseFeeLMAToRedeem +
                singleRedemption.BaseFeeLMALot;
            totals.totalWStETHDrawn =
                totals.totalWStETHDrawn +
                singleRedemption.WStETHLot;

            totals.remainingBaseFeeLMA =
                totals.remainingBaseFeeLMA -
                singleRedemption.BaseFeeLMALot;
            currentBorrower = nextUserToCheck;
        }

        require(
            totals.totalWStETHDrawn > 0,
            "TroveManager: Unable to redeem any amount"
        );
        // HEDGEHOG LOGIC UPDATE:
        // 1) rename _updateBaseRateFromRedemption into _updateRedemptionBaseRateFromRedemption
        // 2) update commented explanation (baseRate => redemptionBaseRate)
        // Decay the redemptionBaseRate due to time passed, and then increase it according to the size of this redemption.
        // Use the saved total BaseFeeLMA supply value, from before it was reduced by the redemption.
        _updateRedemptionBaseRateFromRedemption(totals.totalWStETHDrawn);
        // Calculate the WStETH fee
        totals.WStETHFee = _getRedemptionFee(totals.totalWStETHDrawn);

        _requireUserAcceptsFee(
            totals.WStETHFee,
            totals.totalWStETHDrawn,
            _maxFeePercentage
        );

        // HEDGHEHOG UPDATES:
        // Fees are now distributed among different addresses based on how big they are
        feesRouter.distributeCollFee(totals.totalWStETHDrawn, totals.WStETHFee);

        totals.WStETHToSendToRedeemer =
            totals.totalWStETHDrawn -
            totals.WStETHFee;

        emit Redemption(
            _BaseFeeLMAamount,
            totals.totalBaseFeeLMAToRedeem,
            totals.totalWStETHDrawn,
            totals.WStETHFee
        );
        // Burn the total BaseFeeLMA that is cancelled with debt, and send the redeemed WStETH to msg.sender
        contractsCache.baseFeeLMAToken.burn(
            msg.sender,
            totals.totalBaseFeeLMAToRedeem
        );
        // Update Active Pool BaseFeeLMA, and send WStETH to account
        contractsCache.activePool.decreaseBaseFeeLMADebt(
            totals.totalBaseFeeLMAToRedeem
        );
        contractsCache.activePool.sendWStETH(
            msg.sender,
            totals.WStETHToSendToRedeemer
        );
    }

    // --- Helper functions ---

    // Return the nominal collateral ratio (ICR) of a given Trove, without the price. Takes a trove's pending coll and debt rewards from redistributions into account.
    function getNominalICR(address _borrower) public view returns (uint) {
        (
            uint currentWStETH,
            uint currentBaseFeeLMADebt
        ) = _getCurrentTroveAmounts(_borrower);

        uint NICR = LiquityMath._computeNominalCR(
            currentWStETH,
            currentBaseFeeLMADebt
        );
        return NICR;
    }

    /**
     * HEDGEHOG UPDATES:
     * Get Price directly from the price feed instead of param passing
     */
    // Return the current collateral ratio (ICR) of a given Trove. Takes a trove's pending coll and debt rewards from redistributions into account.
    function getCurrentICR(
        address _borrower,
        uint _price
    ) public view returns (uint) {
        (
            uint currentWStETH,
            uint currentBaseFeeLMADebt
        ) = _getCurrentTroveAmounts(_borrower);
        uint ICR = LiquityMath._computeCR(
            currentWStETH,
            currentBaseFeeLMADebt,
            _price
        );
        return ICR;
    }

    /**
     * HEDGEHOG UPDATES:
     * New view method to help with getting the data on frontends
     */
    function getUnreliableTroveICR(
        address _borrower
    ) public view returns (uint) {
        uint256 price = priceFeed.lastGoodPrice();
        (
            uint currentWStETH,
            uint currentBaseFeeLMADebt
        ) = _getCurrentTroveAmounts(_borrower);

        uint ICR = LiquityMath._computeCR(
            currentWStETH,
            currentBaseFeeLMADebt,
            price
        );
        return ICR;
    }

    function _getCurrentTroveAmounts(
        address _borrower
    ) internal view returns (uint, uint) {
        uint pendingWStETHReward = getPendingWStETHReward(_borrower);
        uint pendingBaseFeeLMADebtReward = getPendingBaseFeeLMADebtReward(
            _borrower
        );

        uint currentWStETH = Troves[_borrower].coll + pendingWStETHReward;
        uint currentBaseFeeLMADebt = Troves[_borrower].debt +
            pendingBaseFeeLMADebtReward;

        return (currentWStETH, currentBaseFeeLMADebt);
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
            uint pendingWStETHReward = getPendingWStETHReward(_borrower);

            uint pendingBaseFeeLMADebtReward = getPendingBaseFeeLMADebtReward(
                _borrower
            );

            // Apply pending rewards to trove's state
            Troves[_borrower].coll =
                Troves[_borrower].coll +
                pendingWStETHReward;

            Troves[_borrower].debt =
                Troves[_borrower].debt +
                pendingBaseFeeLMADebtReward;

            _updateTroveRewardSnapshots(_borrower);

            // Transfer from DefaultPool to ActivePool
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                pendingBaseFeeLMADebtReward,
                pendingWStETHReward
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

    // Update borrower's snapshots of L_WStETH and L_BaseFeeLMADebt to reflect the current values
    function updateTroveRewardSnapshots(address _borrower) external {
        _requireCallerIsBorrowerOperations();
        return _updateTroveRewardSnapshots(_borrower);
    }

    function _updateTroveRewardSnapshots(address _borrower) internal {
        rewardSnapshots[_borrower].WStETH = L_WStETH;
        rewardSnapshots[_borrower].BaseFeeLMADebt = L_BaseFeeLMADebt;
        emit TroveSnapshotsUpdated(L_WStETH, L_BaseFeeLMADebt);
    }

    // Get the borrower's pending accumulated WStETH reward, earned by their stake
    function getPendingWStETHReward(
        address _borrower
    ) public view returns (uint) {
        uint snapshotWStETH = rewardSnapshots[_borrower].WStETH;
        uint rewardPerUnitStaked = L_WStETH - snapshotWStETH;

        if (
            rewardPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return 0;
        }

        uint stake = Troves[_borrower].stake;

        uint pendingWStETHReward = (stake * rewardPerUnitStaked) /
            DECIMAL_PRECISION;

        return pendingWStETHReward;
    }

    // Get the borrower's pending accumulated BaseFeeLMA reward, earned by their stake
    function getPendingBaseFeeLMADebtReward(
        address _borrower
    ) public view returns (uint) {
        uint snapshotBaseFeeLMADebt = rewardSnapshots[_borrower].BaseFeeLMADebt;
        uint rewardPerUnitStaked = L_BaseFeeLMADebt - snapshotBaseFeeLMADebt;

        if (
            rewardPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return 0;
        }

        uint stake = Troves[_borrower].stake;

        uint pendingBaseFeeLMADebtReward = (stake * rewardPerUnitStaked) /
            DECIMAL_PRECISION;

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

        return (rewardSnapshots[_borrower].WStETH < L_WStETH);
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
            uint pendingWStETHReward
        )
    {
        debt = Troves[_borrower].debt;
        coll = Troves[_borrower].coll;

        pendingBaseFeeLMADebtReward = getPendingBaseFeeLMADebtReward(_borrower);
        pendingWStETHReward = getPendingWStETHReward(_borrower);

        debt = debt + pendingBaseFeeLMADebtReward;
        coll = coll + pendingWStETHReward;
    }

    function removeStake(address _borrower) external {
        _requireCallerIsBorrowerOperations();
        return _removeStake(_borrower);
    }

    // Remove borrower's stake from the totalStakes sum, and set their stake to 0
    function _removeStake(address _borrower) internal {
        uint stake = Troves[_borrower].stake;
        totalStakes = totalStakes - stake;
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

        totalStakes = totalStakes - oldStake + newStake;
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
            stake = (_coll * totalStakesSnapshot) / totalCollateralSnapshot;
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
         * error correction, to keep the cumulative error low in the running totals L_WStETH and L_BaseFeeLMADebt:
         *
         * 1) Form numerators which compensate for the floor division errors that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratios.
         * 3) Multiply each ratio back by its denominator, to reveal the current floor division error.
         * 4) Store these errors for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint WStETHNumerator = (_coll * DECIMAL_PRECISION) +
            lastWStETHError_Redistribution;
        uint BaseFeeLMADebtNumerator = (_debt * DECIMAL_PRECISION) +
            lastBaseFeeLMADebtError_Redistribution;

        // Get the per-unit-staked terms
        uint WStETHRewardPerUnitStaked = WStETHNumerator / totalStakes;
        uint BaseFeeLMADebtRewardPerUnitStaked = BaseFeeLMADebtNumerator /
            totalStakes;

        lastWStETHError_Redistribution =
            WStETHNumerator -
            WStETHRewardPerUnitStaked *
            totalStakes;
        lastBaseFeeLMADebtError_Redistribution =
            BaseFeeLMADebtNumerator -
            BaseFeeLMADebtRewardPerUnitStaked *
            totalStakes;

        // Add per-unit-staked terms to the running totals
        L_WStETH = L_WStETH + WStETHRewardPerUnitStaked;
        L_BaseFeeLMADebt = L_BaseFeeLMADebt + BaseFeeLMADebtRewardPerUnitStaked;

        emit LTermsUpdated(L_WStETH, L_BaseFeeLMADebt);

        // Transfer coll and debt from ActivePool to DefaultPool
        _activePool.decreaseBaseFeeLMADebt(_debt);
        _defaultPool.increaseBaseFeeLMADebt(_debt);
        _defaultPool.increaseBalance(_coll);
        _activePool.sendWStETH(address(_defaultPool), _coll);
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
        rewardSnapshots[_borrower].WStETH = 0;
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
     * the total WStETH gas compensation from the liquidation sequence
     *
     * The WStETH as compensation must be excluded as it is always sent out at the very end of the liquidation sequence.
     */
    function _updateSystemSnapshots_excludeCollRemainder(
        IActivePool _activePool,
        uint _collRemainder
    ) internal {
        totalStakesSnapshot = totalStakes;

        uint activeColl = _activePool.getWStETH();
        uint liquidatedColl = defaultPool.getWStETH();
        totalCollateralSnapshot = activeColl - _collRemainder + liquidatedColl;

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
        debt of liquidation reserve plus MIN_NET_DEBT. 3e30 BaseFeeLMA dwarfs the value of all wealth in the world ( which is < 1e15 BaseFeeLMA). */

        // Push the Troveowner to the array
        TroveOwners.push(_borrower);

        // Record the index of the new Troveowner on their Trove struct
        index = uint128(TroveOwners.length - 1);
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
        uint idxLast = length - 1;

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

    /**
     * HEDGEHOG UPDATES:
     * New view method to help with getting the data on frontends
     */
    function getUnreliableTCR() external view returns (uint) {
        return _getTCR(priceFeed.lastGoodPrice());
    }

    function checkRecoveryMode(uint _price) external view returns (bool) {
        return _checkRecoveryMode(_price);
    }

    /**
     * HEDGEHOG UPDATES:
     * New view method to help with getting the data on frontends
     */
    function checkUnreliableRecoveryMode() external view returns (bool) {
        return _checkRecoveryMode(priceFeed.lastGoodPrice());
    }

    // Check whether or not the system *would be* in Recovery Mode, given an BaseFeeLMA:WStETH price, and the entire system coll and debt.
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
     * HEDGEHOG UPDATES:
     * 1) Rename variable in docs (baseRate => redemptionBaseRate)
     * 2) decayedRemeptionBaseRate (decayedBaseRate) is now calculated by _calcDecayedRedemptionBaseRate();
     * 3) Updating RedemptionBaseRate state variable instead of baseRate
     * 4) Emiting RedemptionBaseRateUpdated instead of BaseRateUpdates();
     * 5) Now updates time only of redemeption operation instead of both redemption and borrow
     *
     * This function has two impacts on the redemptionBaseRate state variable:
     * 1) decays the redemptionBaseRate based on time passed since last redemption or BaseFeeLMA borrowing operation.
     * then,
     * 2) increases the redemptionBaseRate based on the amount redeemed, as a proportion of totall collateral in the system.
     * total collateral taken into the account is a sum of default and active pools collaterals
     */
    function _updateRedemptionBaseRateFromRedemption(
        uint _WStETHDrawn
    ) internal returns (uint) {
        uint decayedRedemptionBaseRate = _calcDecayedRedemptionBaseRate();
        // Hedgehog updates: Now calculating what part of total collateral is getting withdrawn from the
        // system

        // HEDGEHOG UPDATES: Calculation the fraction now as a ratio of Collateral that is about to get redeemed and a sum of collateral in active & default pools.
        uint redeemedCollFraction = (_WStETHDrawn * DECIMAL_PRECISION) /
            (activePool.getWStETH() + defaultPool.getWStETH());

        // Hedgehog Updates: Remove division by BETA
        uint newBaseRate = decayedRedemptionBaseRate + redeemedCollFraction;

        newBaseRate = LiquityMath._min(newBaseRate, DECIMAL_PRECISION); // cap baseRate at a maximum of 100%
        //assert(newBaseRate <= DECIMAL_PRECISION); // This is already enforced in the line above
        // Hedgehog Updates: Remove assertion check to make sure first redemption does not revert after the bootstrapping period if more than 10^18 WstETH was transfer into the contract
        // assert(newBaseRate > 0); // Base rate is always non-zero after redemption

        // HEDGEHOG UPDATES: succesful redemption now updates only the redemption base rate. Redemption base rate update also received a new event.
        // Update the baseRate state variable
        redemptionBaseRate = newBaseRate;
        emit RedemptionBaseRateUpdated(newBaseRate);

        _updateLastRedemptionTime();
        return newBaseRate;
    }

    /*
     * HEDGEHOG UPDATES:
     * 1) Now passing redemptionBaseRate instead of combined baseRate
     */
    function getRedemptionRate() public view returns (uint) {
        return _calcRedemptionRate(redemptionBaseRate);
    }

    /*
     * HEDGEHOG UPDATES:
     * Now accepts a new param: redemptionColl as we can't get that amount from value anymore since of ERC20 transition
     */
    function getRedemptionRateWithDecay() public view returns (uint) {
        return _calcRedemptionRate(_calcDecayedRedemptionBaseRate());
    }

    /*
     * HEDGEHOG UPDATES:
     * Redemption Rate formula now is: RedFloor + RedBaseRate*MinuteDecayFactorMinutes + RedemptionETH/TotalColl
     * 1) Rename param name (_baseRate => _redemptionBaseRate)
     * 2) Now redeemed collateral divided by total collateral in active & defaul pools is added to the sum of redemption floor and redeem base rate
     */
    function _calcRedemptionRate(
        uint _redemptionBaseRate
    ) internal pure returns (uint) {
        return
            LiquityMath._min(
                REDEMPTION_FEE_FLOOR + _redemptionBaseRate,
                DECIMAL_PRECISION // cap at a maximum of 100%
            );
    }

    function _getRedemptionFee(uint _WStETHDrawn) internal view returns (uint) {
        return _calcRedemptionFee(getRedemptionRate(), _WStETHDrawn);
    }

    function getRedemptionFeeWithDecay(
        uint _WStETHDrawn
    ) external view returns (uint) {
        return _calcRedemptionFee(getRedemptionRateWithDecay(), _WStETHDrawn);
    }

    function _calcRedemptionFee(
        uint _redemptionRate,
        uint _WStETHDrawn
    ) internal pure returns (uint) {
        uint redemptionFee = (_redemptionRate * _WStETHDrawn) /
            DECIMAL_PRECISION;

        // Hedgehog Updates: check if fee is too big is now performed at the redeemCollateral function

        return redemptionFee;
    }

    // --- Borrowing fee functions ---

    /*
     * HEDGEHOG UPDATES:
     * 1) Now passing borrowBaseRate instead of combined baseRate
     */
    function getBorrowingRate(
        uint _issuedBaseFeeLMA
    ) public view returns (uint) {
        return _calcBorrowingRate(borrowBaseRate, _issuedBaseFeeLMA);
    }

    /*
     * HEDGEHOG UPDATES:
     * 1) Now passing _calcDecayedBorrowBaseRate instead of _calcDecayedBaseRate function to calculate the decayed borrowBaseRate
     */
    function getBorrowingRateWithDecay(
        uint _issuedBaseFeeLMA
    ) public view returns (uint) {
        return
            _calcBorrowingRate(_calcDecayedBorrowBaseRate(), _issuedBaseFeeLMA);
    }

    /*
     * HEDGEHOG UPDATES:
     * Now full dynamic fees formula is as follows: RedRate = RedFloor + RedBaseRate*MinuteDecayFactorMinutes + RedemptionETH / Total Collateral in the system
     * 1) Rename param name (_baseRate => _borrowBaseRate)
     * 2) If BFE total supply is 0, returning fee floor
     * 3) Now adding issued bfe amount divided by total supply of the asset to the sum of borrow floor and decayed borrowedBaseRate
     */
    function _calcBorrowingRate(
        uint _borrowBaseRate,
        uint _issuedBaseFeeLMA
    ) internal view returns (uint) {
        uint256 supply = baseFeeLMAToken.totalSupply();
        // Checking if there are tokens in supply, otherwise return 1 to avoid division by zero
        if (supply == 0) {
            return BORROWING_FEE_FLOOR;
        }

        return
            LiquityMath._min(
                BORROWING_FEE_FLOOR +
                    _borrowBaseRate +
                    (_issuedBaseFeeLMA * DECIMAL_PRECISION) /
                    supply,
                MAX_BORROWING_FEE
            );
    }

    // HEDGEHOG UPDATES: Now retuns also a calculated base rate along with a borrowing fee
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
        return (_borrowingRate * _BaseFeeLMADebt) / DECIMAL_PRECISION;
    }

    // HEDGEHOG UPDATES: New function to updtae borrowBaseRate during borrowing op on BorrowersOperations contract
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
     * HEDGEHOG UPDATES:
     * 1) Now updates borrowBaseRate instead of baseRate used by both redemption and minting functions
     * 2) Emit BorrowBaseRateUpdated instead of BaseRateUpdated
     * 3) Now updates time only of borrow operation instead of both redemption and borrow
     * 4) Update doc variable name baseRate => borrowBaseRate
     */
    // Updates the borrowBaseRate state variable based on time elapsed since the last redemption or BaseFeeLMA borrowing operation.
    function decayBaseRateFromBorrowing() external {
        _requireCallerIsBorrowerOperations();
        uint decayedBaseRate = _calcDecayedBorrowBaseRate();
        assert(decayedBaseRate <= DECIMAL_PRECISION); // The baseRate can decay to 0
        // HEDGEHOG LOGIC CHANGES: Updating a unique borrowing base rate instead of just "baseRate"
        borrowBaseRate = decayedBaseRate;

        _updateLastBorrowTime();
    }

    // --- Internal fee functions ---

    /*
     * HEDGEHOG UPDATES:
     * removed _updateLastFeeOpTime
     * New function _updateLastRedemptionTime simmilar to _updateLastFeeOpTime, that sets lastRedemptionTime and emits respective event.
     */
    // Update the last fee operation time only if time passed >= decay interval. This prevents base rate griefing.
    function _updateLastRedemptionTime() internal {
        uint timePassed = block.timestamp - lastRedemptionTime;

        if (timePassed >= SECONDS_IN_ONE_MINUTE) {
            lastRedemptionTime += _minutesPassedSinceLastRedemption() * 60;
            emit LastRedemptionTimeUpdated(block.timestamp);
        }
    }

    /*
     * HEDGEHOG UPDATES:
     * removed _updateLastFeeOpTime
     * New function _updateLastBorrowTime simmilar to _updateLastFeeOpTime, that sets lastBorrowTime and emits respective event.
     */
    // Update the last fee operation time only if time passed >= decay interval. This prevents base rate griefing.
    function _updateLastBorrowTime() internal {
        uint timePassed = block.timestamp - lastBorrowTime;

        if (timePassed >= SECONDS_IN_ONE_MINUTE) {
            lastBorrowTime += _minutesPassedSinceLastBorrow() * 60;
            emit LastBorrowTimeUpdated(block.timestamp);
        }
    }

    /*
     * HEDGEHOG UPDATES:
     * New function simmilar to _calcDecayedBaseRate. However used particularly for redemptionBaseRate calculation
     */
    function _calcDecayedRedemptionBaseRate() internal view returns (uint) {
        uint minutesPassed = _minutesPassedSinceLastRedemption();

        uint decayFactor = LiquityMath._decPow(
            MINUTE_DECAY_REDEMPTION_FACTOR,
            minutesPassed
        );
        return (redemptionBaseRate * decayFactor) / DECIMAL_PRECISION;
    }

    /*
     * HEDGEHOG UPDATES:
     * New function simmilar to _calcDecayedBaseRate. However used particularly for borrowBaseRate calculation
     */
    function _calcDecayedBorrowBaseRate() internal view returns (uint) {
        uint minutesPassed = _minutesPassedSinceLastBorrow();
        uint decayFactor = LiquityMath._decPow(
            MINUTE_DECAY_BORROWING_FACTOR,
            minutesPassed
        );

        return (borrowBaseRate * decayFactor) / DECIMAL_PRECISION;
    }

    /*
     * HEDGEHOG UPDATES:
     * removed _minutesPassedSinceLastFeeOp
     * New function _minutesPassedSinceLastRedemption simmilar to _minutesPassedSinceLastFeeOp, that returns amount of minutes since last registered redemption
     */
    function _minutesPassedSinceLastRedemption() internal view returns (uint) {
        return (block.timestamp - lastRedemptionTime) / SECONDS_IN_ONE_MINUTE;
    }

    /*
     * HEDGEHOG UPDATES:
     * removed _minutesPassedSinceLastFeeOp
     * New function _minutesPassedSinceLastBorrow simmilar to _minutesPassedSinceLastFeeOp, that returns amount of minutes since last registered borrow
     */
    function _minutesPassedSinceLastBorrow() internal view returns (uint) {
        return (block.timestamp - lastBorrowTime) / SECONDS_IN_ONE_MINUTE;
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
        require(
            block.timestamp >= SYSTEM_DEPLOYMENT_TIME + BOOTSTRAP_PERIOD,
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

    // Hedgehog Updates: New function that returns last block update number of a trove. This block is checked at the start of adjust, close and open functions.
    function getTroveUpdateBlock(
        address _borrower
    ) external view returns (uint) {
        return Troves[_borrower].lastBlockUpdated;
    }

    // --- Trove property setters, called by BorrowerOperations ---

    function setTroveStatus(address _borrower, uint _num) external {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].status = Status(_num);
    }

    // Hedgehog Updates: New function that stores block update into a trove. This block is checked at the start of adjust, close and open functions.
    function setTroveLastUpdatedBlock(address _borrower) external {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].lastBlockUpdated = block.number;
    }

    function increaseTroveColl(
        address _borrower,
        uint _collIncrease
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint newColl = Troves[_borrower].coll + _collIncrease;
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function decreaseTroveColl(
        address _borrower,
        uint _collDecrease
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint newColl = Troves[_borrower].coll - _collDecrease;
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function increaseTroveDebt(
        address _borrower,
        uint _debtIncrease
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint newDebt = Troves[_borrower].debt + _debtIncrease;
        Troves[_borrower].debt = newDebt;
        return newDebt;
    }

    function decreaseTroveDebt(
        address _borrower,
        uint _debtDecrease
    ) external returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint newDebt = Troves[_borrower].debt - _debtDecrease;
        Troves[_borrower].debt = newDebt;
        return newDebt;
    }

    /*
     * HEDGEHOG UPDATES:
     * New frontend helper function easing up the calculation of a baseFeeLma price coming from an oracle for a trove with given coll and debt to become eligble for liquidation
     */
    function getNormalLiquidationPrice(
        uint256 _coll,
        uint256 _debt
    ) external pure returns (uint256) {
        uint256 price = LiquityMath._findPriceBelowMCR(
            _coll,
            _debt,
            HedgehogBase.MCR
        );
        return price;
    }
}
