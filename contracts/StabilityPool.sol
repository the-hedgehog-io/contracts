// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IBaseFeeLMAToken.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ICommunityIssuance.sol";
import "./dependencies/HedgehogBase.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/LiquitySafeMath128.sol";
import "./dependencies/CheckContract.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Fork of Liquity's Stability Pool. Logic remains unchanged.
 * Changes to the contract:
 * - Raised pragma version
 * - Removed an import of IStabilityPool Interface
 * Even though SafeMath is no longer required, the decision was made to keep it to avoid human factor errors
 *
 * The Stability Pool holds BaseFeeLMA tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, then depending on system conditions, some of its BaseFeeLMA debt gets offset with
 * BaseFeeLMA in the Stability Pool:  that is, the offset debt evaporates, and an equal amount of BaseFeeLMA tokens in the Stability Pool is burned.
 *
 * Thus, a liquidation causes each depositor to receive a BaseFeeLMA loss, in proportion to their deposit as a share of total deposits.
 * They also receive an WStETH gain, as the WStETH collateral of the liquidated trove is distributed among Stability depositors,
 * in the same proportion.
 *
 * When a liquidation occurs, it depletes every deposit by the same fraction: for example, a liquidation that depletes 40%
 * of the total BaseFeeLMA in the Stability Pool, depletes 40% of each deposit.
 *
 * A deposit that has experienced a series of liquidations is termed a "compounded deposit": each liquidation depletes the deposit,
 * multiplying it by some factor in range ]0,1[
 *
 *
 * --- IMPLEMENTATION ---
 *
 * We use a highly scalable method of tracking deposits and WStETH gains that has O(1) complexity.
 *
 * When a liquidation occurs, rather than updating each depositor's deposit and WStETH gain, we simply update two state variables:
 * a product P, and a sum S.
 *
 * A mathematical manipulation allows us to factor out the initial deposit, and accurately track all depositors' compounded deposits
 * and accumulated WStETH gains over time, as liquidations occur, using just these two variables P and S. When depositors join the
 * Stability Pool, they get a snapshot of the latest P and S: P_t and S_t, respectively.
 *
 * The formula for a depositor's accumulated WStETH gain is derived here:
 * https://github.com/liquity/dev/blob/main/papers/Scalable_Reward_Distribution_with_Compounding_Stakes.pdf
 *
 * For a given deposit d_t, the ratio P/P_t tells us the factor by which a deposit has decreased since it joined the Stability Pool,
 * and the term d_t * (S - S_t)/P_t gives us the deposit's total accumulated WStETH gain.
 *
 * Each liquidation updates the product P and sum S. After a series of liquidations, a compounded deposit and corresponding WStETH gain
 * can be calculated using the initial deposit, the depositor’s snapshots of P and S, and the latest values of P and S.
 *
 * Any time a depositor updates their deposit (withdrawal, top-up) their accumulated WStETH gain is paid out, their new deposit is recorded
 * (based on their latest compounded deposit and modified by the withdrawal/top-up), and they receive new snapshots of the latest P and S.
 * Essentially, they make a fresh deposit that overwrites the old one.
 *
 *
 * --- SCALE FACTOR ---
 *
 * Since P is a running product in range ]0,1] that is always-decreasing, it should never reach 0 when multiplied by a number in range ]0,1[.
 * Unfortunately, Solidity floor division always reaches 0, sooner or later.
 *
 * A series of liquidations that nearly empty the Pool (and thus each multiply P by a very small number in range ]0,1[ ) may push P
 * to its 18 digit decimal limit, and round it to 0, when in fact the Pool hasn't been emptied: this would break deposit tracking.
 *
 * So, to track P accurately, we use a scale factor: if a liquidation would cause P to decrease to <1e-9 (and be rounded to 0 by Solidity),
 * we first multiply P by 1e9, and increment a currentScale factor by 1.
 *
 * The added benefit of using 1e9 for the scale factor (rather than 1e18) is that it ensures negligible precision loss close to the
 * scale boundary: when P is at its minimum value of 1e9, the relative precision loss in P due to floor division is only on the
 * order of 1e-9.
 *
 * --- EPOCHS ---
 *
 * Whenever a liquidation fully empties the Stability Pool, all deposits should become 0. However, setting P to 0 would make P be 0
 * forever, and break all future reward calculations.
 *
 * So, every time the Stability Pool is emptied by a liquidation, we reset P = 1 and currentScale = 0, and increment the currentEpoch by 1.
 *
 * --- TRACKING DEPOSIT OVER SCALE CHANGES AND EPOCHS ---
 *
 * When a deposit is made, it gets snapshots of the currentEpoch and the currentScale.
 *
 * When calculating a compounded deposit, we compare the current epoch to the deposit's epoch snapshot. If the current epoch is newer,
 * then the deposit was present during a pool-emptying liquidation, and necessarily has been depleted to 0.
 *
 * Otherwise, we then compare the current scale to the deposit's scale snapshot. If they're equal, the compounded deposit is given by d_t * P/P_t.
 * If it spans one scale change, it is given by d_t * P/(P_t * 1e9). If it spans more than one scale change, we define the compounded deposit
 * as 0, since it is now less than 1e-9'th of its initial value (e.g. a deposit of 1 billion BaseFeeLMA has depleted to < 1 BaseFeeLMA).
 *
 *
 *  --- TRACKING DEPOSITOR'S WStETH GAIN OVER SCALE CHANGES AND EPOCHS ---
 *
 * In the current epoch, the latest value of S is stored upon each scale change, and the mapping (scale -> S) is stored for each epoch.
 *
 * This allows us to calculate a deposit's accumulated WStETH gain, during the epoch in which the deposit was non-zero and earned WStETH.
 *
 * We calculate the depositor's accumulated WStETH gain for the scale at which they made the deposit, using the WStETH gain formula:
 * e_1 = d_t * (S - S_t) / P_t
 *
 * and also for scale after, taking care to divide the latter by a factor of 1e9:
 * e_2 = d_t * S / (P_t * 1e9)
 *
 * The gain in the second scale will be full, as the starting point was in the previous scale, thus no need to subtract anything.
 * The deposit therefore was present for reward events from the beginning of that second scale.
 *
 *        S_i-S_t + S_{i+1}
 *      .<--------.------------>
 *      .         .
 *      . S_i     .   S_{i+1}
 *   <--.-------->.<----------->
 *   S_t.         .
 *   <->.         .
 *      t         .
 *  |---+---------|-------------|-----...
 *         i            i+1
 *
 * The sum of (e_1 + e_2) captures the depositor's total accumulated WStETH gain, handling the case where their
 * deposit spanned one scale change. We only care about gains across one scale change, since the compounded
 * deposit is defined as being 0 once it has spanned more than one scale change.
 *
 *
 * --- UPDATING P WHEN A LIQUIDATION OCCURS ---
 *
 * Please see the implementation spec in the proof document, which closely follows on from the compounded deposit / WStETH gain derivations:
 * https://github.com/liquity/liquity/blob/master/papers/Scalable_Reward_Distribution_with_Compounding_Stakes.pdf
 *
 *
 * --- HOG ISSUANCE TO STABILITY POOL DEPOSITORS ---
 *
 * A HOG issuance event occurs at every deposit operation, and every liquidation.
 *
 * Each deposit is tagged with the address of the front end through which it was made.
 *
 * All deposits earn a share of the issued HOG in proportion to the deposit as a share of total deposits. The HOG earned
 * by a given deposit, is split between the depositor and the front end through which the deposit was made, based on the front end's kickbackRate.
 *
 * Please see the system Readme for an overview:
 * https://github.com/liquity/dev/blob/main/README.md#hog-issuance-to-stability-providers
 *
 * We use the same mathematical product-sum approach to track HOG gains for depositors, where 'G' is the sum corresponding to HOG gains.
 * The product P (and snapshot P_t) is re-used, as the ratio P/P_t tracks a deposit's depletion due to liquidations.
 *
 */
contract StabilityPool is HedgehogBase, Ownable, CheckContract {
    using LiquitySafeMath128 for uint128;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string public constant NAME = "StabilityPool";

    IBorrowerOperations public borrowerOperations;

    ITroveManager public troveManager;

    IBaseFeeLMAToken public baseFeeLMAToken;

    // Needed to check if there are pending liquidations
    ISortedTroves public sortedTroves;

    ICommunityIssuance public communityIssuance;

    uint256 internal WStETH; // deposited wStETH tracker
    IERC20 public WStETHToken;

    // Tracker for BaseFeeLMA held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
    uint256 internal totalBaseFeeLMADeposits;

    // --- Data structures ---

    struct Deposit {
        uint initialValue;
    }

    struct Snapshots {
        uint S;
        uint P;
        uint G;
        uint128 scale;
        uint128 epoch;
    }

    mapping(address => Deposit) public deposits; // depositor address -> Deposit struct
    mapping(address => Snapshots) public depositSnapshots; // depositor address -> snapshots struct

    /*  Product 'P': Running product by which to multiply an initial deposit, in order to find the current compounded deposit,
     * after a series of liquidations have occurred, each of which cancel some BaseFeeLMA debt with the deposit.
     *
     * During its lifetime, a deposit's value evolves from d_t to d_t * P / P_t , where P_t
     * is the snapshot of P taken at the instant the deposit was made. 18-digit decimal.
     */
    uint public P = DECIMAL_PRECISION;

    uint public constant SCALE_FACTOR = 1e9;

    // Each time the scale of P shifts by SCALE_FACTOR, the scale is incremented by 1
    uint128 public currentScale;

    // With each offset that fully empties the Pool, the epoch is incremented by 1
    uint128 public currentEpoch;

    /* WStETH Gain sum 'S': During its lifetime, each deposit d_t earns an WStETH gain of ( d_t * [S - S_t] )/P_t, where S_t
     * is the depositor's snapshot of S taken at the time t when the deposit was made.
     *
     * The 'S' sums are stored in a nested mapping (epoch => scale => sum):
     *
     * - The inner mapping records the sum S at different scales
     * - The outer mapping records the (scale => sum) mappings, for different epochs.
     */
    mapping(uint128 => mapping(uint128 => uint)) public epochToScaleToSum;

    /*
     * Similarly, the sum 'G' is used to calculate HOG gains. During it's lifetime, each deposit d_t earns a HOG gain of
     *  ( d_t * [G - G_t] )/P_t, where G_t is the depositor's snapshot of G taken at time t when  the deposit was made.
     *
     *  HOG reward events occur are triggered by depositor operations (new deposit, topup, withdrawal), and liquidations.
     *  In each case, the HOG reward is issued (i.e. G is updated), before other state changes are made.
     */
    mapping(uint128 => mapping(uint128 => uint)) public epochToScaleToG;

    // Error tracker for the error correction in the HOG issuance calculation
    uint public lastHOGError;
    // Error trackers for the error correction in the offset calculation
    uint public lastWStETHError_Offset;
    uint public lastBaseFeeLMALossError_Offset;

    // --- Events ---

    event StabilityPoolWStETHBalanceUpdated(uint _newBalance);
    event StabilityPoolBaseFeeLMABalanceUpdated(uint _newBalance);

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event BaseFeeLMATokenAddressChanged(address _newBaseFeeLMATokenAddress);
    event SortedTrovesAddressChanged(address _newSortedTrovesAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event CommunityIssuanceAddressChanged(address _newCommunityIssuanceAddress);
    event WStETHTokenAddressUpdated(IERC20 _WStEthAddress);

    event P_Updated(uint _P);
    event S_Updated(uint _S, uint128 _epoch, uint128 _scale);
    event G_Updated(uint _G, uint128 _epoch, uint128 _scale);
    event EpochUpdated(uint128 _currentEpoch);
    event ScaleUpdated(uint128 _currentScale);

    event DepositSnapshotUpdated(
        address indexed _depositor,
        uint _P,
        uint _S,
        uint _G
    );

    event UserDepositChanged(address indexed _depositor, uint _newDeposit);

    event WStETHGainWithdrawn(
        address indexed _depositor,
        uint _WStETH,
        uint _BaseFeeLMALoss
    );
    event HOGPaidToDepositor(address indexed _depositor, uint _HOG);
    event WStETHSent(address _to, uint _amount);

    constructor(
        uint _gasComp,
        uint _minNetDebt
    ) HedgehogBase(_gasComp, _minNetDebt) {}

    // --- Contract setters ---

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral instead of native token.
     * Setting erc20 address in the initialisation
     */
    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _baseFeeLMATokenAddress,
        address _sortedTrovesAddress,
        address _priceFeedAddress,
        address _communityIssuanceAddress,
        IERC20 _WStETHTokenAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_baseFeeLMATokenAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_priceFeedAddress);
        checkContract(_communityIssuanceAddress);
        checkContract(address(_WStETHTokenAddress));

        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        baseFeeLMAToken = IBaseFeeLMAToken(_baseFeeLMATokenAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        communityIssuance = ICommunityIssuance(_communityIssuanceAddress);
        WStETHToken = _WStETHTokenAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BaseFeeLMATokenAddressChanged(_baseFeeLMATokenAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit CommunityIssuanceAddressChanged(_communityIssuanceAddress);
        emit WStETHTokenAddressUpdated(_WStETHTokenAddress);

        renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    function getWStETH() external view returns (uint) {
        return WStETH;
    }

    function getTotalBaseFeeLMADeposits() external view returns (uint) {
        return totalBaseFeeLMADeposits;
    }

    // --- External Depositor Functions ---

    /*  provideToSP():
     *
     * - Triggers a HOG issuance, based on time passed since the last issuance. The HOG issuance is shared between *all* depositors and front ends
     * - Tags the deposit with the provided front end tag param, if it's a new deposit
     * - Sends depositor's accumulated gains (HOG, WStETH) to depositor
     * - Sends the tagged front end's accumulated HOG gains to the tagged front end
     * - Increases deposit and tagged front end's stake, and takes new snapshots for each.
     */
    function provideToSP(uint _amount) external {
        _requireNonZeroAmount(_amount);

        uint initialDeposit = deposits[msg.sender].initialValue;

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerHOGIssuance(communityIssuanceCached);

        uint depositorWStETHGain = getDepositorWStETHGain(msg.sender);
        uint compoundedBaseFeeLMADeposit = getCompoundedBaseFeeLMADeposit(
            msg.sender
        );
        uint BaseFeeLMALoss = initialDeposit.sub(compoundedBaseFeeLMADeposit); // Needed only for event log

        // HEDGEHOG UPDATES: No longer perfor any kind of "frontend" payments
        // First pay out any HOG gains
        _payOutHOGGains(communityIssuanceCached, msg.sender);

        _sendBaseFeeLMAtoStabilityPool(msg.sender, _amount);

        uint newDeposit = compoundedBaseFeeLMADeposit.add(_amount);
        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit WStETHGainWithdrawn(
            msg.sender,
            depositorWStETHGain,
            BaseFeeLMALoss
        ); // BaseFeeLMA Loss required for event log

        _sendWStETHGainToDepositor(depositorWStETHGain);
    }

    /*  withdrawFromSP():
     *
     * - Triggers a HOG issuance, based on time passed since the last issuance. The HOG issuance is shared between *all* depositors and front ends
     * - Removes the deposit's front end tag if it is a full withdrawal
     * - Sends all depositor's accumulated gains (HOG, WStETH) to depositor
     * - Sends the tagged front end's accumulated HOG gains to the tagged front end
     * - Decreases deposit and tagged front end's stake, and takes new snapshots for each.
     *
     * If _amount > userDeposit, the user withdraws all of their compounded deposit.
     */
    function withdrawFromSP(uint _amount) external {
        if (_amount != 0) {
            _requireNoUnderCollateralizedTroves();
        }
        uint initialDeposit = deposits[msg.sender].initialValue;
        _requireUserHasDeposit(initialDeposit);

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerHOGIssuance(communityIssuanceCached);

        uint depositorWStETHGain = getDepositorWStETHGain(msg.sender);

        uint compoundedBaseFeeLMADeposit = getCompoundedBaseFeeLMADeposit(
            msg.sender
        );
        uint BaseFeeLMAtoWithdraw = LiquityMath._min(
            _amount,
            compoundedBaseFeeLMADeposit
        );
        uint BaseFeeLMALoss = initialDeposit.sub(compoundedBaseFeeLMADeposit); // Needed only for event log

        // HEDGEHOG UPDATES: No longer perfor any kind of "frontend" payments
        // First pay out any HOG gains
        _payOutHOGGains(communityIssuanceCached, msg.sender);

        _sendBaseFeeLMAToDepositor(msg.sender, BaseFeeLMAtoWithdraw);

        // Update deposit
        uint newDeposit = compoundedBaseFeeLMADeposit.sub(BaseFeeLMAtoWithdraw);
        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit WStETHGainWithdrawn(
            msg.sender,
            depositorWStETHGain,
            BaseFeeLMALoss
        ); // BaseFeeLMA Loss required for event log

        _sendWStETHGainToDepositor(depositorWStETHGain);
    }

    /* withdrawWStETHGainToTrove:

     * HEDGEHOG UPDATES: use SafeERC20 safe transfer instead of native token transfer. Therefore 
     * transfer value isn't paste anymore as a {value: }, but as a separate input param

     * - Triggers a HOG issuance, based on time passed since the last issuance. The HOG issuance is shared between *all* depositors and front ends
     * - Sends all depositor's HOG gain to  depositor
     * - Sends all tagged front end's HOG gain to the tagged front end
     * - Transfers the depositor's entire WStETH gain from the Stability Pool to the caller's trove
     * - Leaves their compounded deposit in the Stability Pool
     * - Updates snapshots for deposit and tagged front end stake */
    function withdrawWStETHGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external {
        uint initialDeposit = deposits[msg.sender].initialValue;
        _requireUserHasDeposit(initialDeposit);
        _requireUserHasTrove(msg.sender);
        _requireUserHasWStETHGain(msg.sender);

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerHOGIssuance(communityIssuanceCached);

        uint depositorWStETHGain = getDepositorWStETHGain(msg.sender);

        uint compoundedBaseFeeLMADeposit = getCompoundedBaseFeeLMADeposit(
            msg.sender
        );
        uint BaseFeeLMALoss = initialDeposit.sub(compoundedBaseFeeLMADeposit); // Needed only for event log

        // HEDGEHOG UPDATES: No longer perfor any kind of "frontend" payments
        // First pay out any HOG gains
        _payOutHOGGains(communityIssuanceCached, msg.sender);

        _updateDepositAndSnapshots(msg.sender, compoundedBaseFeeLMADeposit);

        /* Emit events before transferring WStETH gain to Trove.
         This lets the event log make more sense (i.e. so it appears that first the WStETH gain is withdrawn
        and then it is deposited into the Trove, not the other way around). */
        emit WStETHGainWithdrawn(
            msg.sender,
            depositorWStETHGain,
            BaseFeeLMALoss
        );
        emit UserDepositChanged(msg.sender, compoundedBaseFeeLMADeposit);

        WStETH = WStETH.sub(depositorWStETHGain);
        emit StabilityPoolWStETHBalanceUpdated(WStETH);
        emit WStETHSent(msg.sender, depositorWStETHGain);

        borrowerOperations.moveWStETHGainToTrove(
            msg.sender,
            _upperHint,
            _lowerHint,
            depositorWStETHGain
        );
    }

    // --- HOG issuance functions ---

    function _triggerHOGIssuance(
        ICommunityIssuance _communityIssuance
    ) internal {
        uint HOGIssuance = _communityIssuance.issueHOG();
        _updateG(HOGIssuance);
    }

    function _updateG(uint _HOGIssuance) internal {
        uint totalBaseFeeLMA = totalBaseFeeLMADeposits; // cached to save an SLOAD
        /*
         * When total deposits is 0, G is not updated. In this case, the HOG issued can not be obtained by later
         * depositors - it is missed out on, and remains in the balanceof the CommunityIssuance contract.
         *
         */
        if (totalBaseFeeLMA == 0 || _HOGIssuance == 0) {
            return;
        }

        uint HOGPerUnitStaked;
        HOGPerUnitStaked = _computeHOGPerUnitStaked(
            _HOGIssuance,
            totalBaseFeeLMA
        );

        uint marginalHOGGain = HOGPerUnitStaked.mul(P);
        epochToScaleToG[currentEpoch][currentScale] = epochToScaleToG[
            currentEpoch
        ][currentScale].add(marginalHOGGain);

        emit G_Updated(
            epochToScaleToG[currentEpoch][currentScale],
            currentEpoch,
            currentScale
        );
    }

    function _computeHOGPerUnitStaked(
        uint _HOGIssuance,
        uint _totalBaseFeeLMADeposits
    ) internal returns (uint) {
        /*
         * Calculate the HOG-per-unit staked.  Division uses a "feedback" error correction, to keep the
         * cumulative error low in the running total G:
         *
         * 1) Form a numerator which compensates for the floor division error that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratio.
         * 3) Multiply the ratio back by its denominator, to reveal the current floor division error.
         * 4) Store this error for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint HOGNumerator = _HOGIssuance.mul(DECIMAL_PRECISION).add(
            lastHOGError
        );

        uint HOGPerUnitStaked = HOGNumerator.div(_totalBaseFeeLMADeposits);
        lastHOGError = HOGNumerator.sub(
            HOGPerUnitStaked.mul(_totalBaseFeeLMADeposits)
        );

        return HOGPerUnitStaked;
    }

    // --- Liquidation functions ---

    /*
     * Cancels out the specified debt against the BaseFeeLMA contained in the Stability Pool (as far as possible)
     * and transfers the Trove's WStETH collateral from ActivePool to StabilityPool.
     * Only called by liquidation functions in the TroveManager.
     */
    function offset(uint _debtToOffset, uint _collToAdd) external {
        _requireCallerIsTroveManager();
        uint totalBaseFeeLMA = totalBaseFeeLMADeposits; // cached to save an SLOAD
        if (totalBaseFeeLMA == 0 || _debtToOffset == 0) {
            return;
        }

        _triggerHOGIssuance(communityIssuance);

        (
            uint WStETHGainPerUnitStaked,
            uint BaseFeeLMALossPerUnitStaked
        ) = _computeRewardsPerUnitStaked(
                _collToAdd,
                _debtToOffset,
                totalBaseFeeLMA
            );

        _updateRewardSumAndProduct(
            WStETHGainPerUnitStaked,
            BaseFeeLMALossPerUnitStaked
        ); // updates S and P

        _moveOffsetCollAndDebt(_collToAdd, _debtToOffset);
    }

    // --- Offset helper functions ---

    function _computeRewardsPerUnitStaked(
        uint _collToAdd,
        uint _debtToOffset,
        uint _totalBaseFeeLMADeposits
    )
        internal
        returns (uint WStETHGainPerUnitStaked, uint BaseFeeLMALossPerUnitStaked)
    {
        /*
         * Compute the BaseFeeLMA and WStETH rewards. Uses a "feedback" error correction, to keep
         * the cumulative error in the P and S state variables low:
         *
         * 1) Form numerators which compensate for the floor division errors that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratios.
         * 3) Multiply each ratio back by its denominator, to reveal the current floor division error.
         * 4) Store these errors for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint WStETHNumerator = _collToAdd.mul(DECIMAL_PRECISION).add(
            lastWStETHError_Offset
        );

        assert(_debtToOffset <= _totalBaseFeeLMADeposits);
        if (_debtToOffset == _totalBaseFeeLMADeposits) {
            BaseFeeLMALossPerUnitStaked = DECIMAL_PRECISION; // When the Pool depletes to 0, so does each deposit
            lastBaseFeeLMALossError_Offset = 0;
        } else {
            uint BaseFeeLMALossNumerator = _debtToOffset
                .mul(DECIMAL_PRECISION)
                .sub(lastBaseFeeLMALossError_Offset);
            /*
             * Add 1 to make error in quotient positive. We want "slightly too much" BaseFeeLMA loss,
             * which ensures the error in any given compoundedBaseFeeLMADeposit favors the Stability Pool.
             */
            BaseFeeLMALossPerUnitStaked = (
                BaseFeeLMALossNumerator.div(_totalBaseFeeLMADeposits)
            ).add(1);
            lastBaseFeeLMALossError_Offset = (
                BaseFeeLMALossPerUnitStaked.mul(_totalBaseFeeLMADeposits)
            ).sub(BaseFeeLMALossNumerator);
        }

        WStETHGainPerUnitStaked = WStETHNumerator.div(_totalBaseFeeLMADeposits);
        lastWStETHError_Offset = WStETHNumerator.sub(
            WStETHGainPerUnitStaked.mul(_totalBaseFeeLMADeposits)
        );

        return (WStETHGainPerUnitStaked, BaseFeeLMALossPerUnitStaked);
    }

    // Update the Stability Pool reward sum S and product P
    function _updateRewardSumAndProduct(
        uint _WStETHGainPerUnitStaked,
        uint _BaseFeeLMALossPerUnitStaked
    ) internal {
        uint currentP = P;
        uint newP;

        assert(_BaseFeeLMALossPerUnitStaked <= DECIMAL_PRECISION);
        /*
         * The newProductFactor is the factor by which to change all deposits, due to the depletion of Stability Pool BaseFeeLMA in the liquidation.
         * We make the product factor 0 if there was a pool-emptying. Otherwise, it is (1 - BaseFeeLMALossPerUnitStaked)
         */
        uint newProductFactor = uint(DECIMAL_PRECISION).sub(
            _BaseFeeLMALossPerUnitStaked
        );

        uint128 currentScaleCached = currentScale;
        uint128 currentEpochCached = currentEpoch;
        uint currentS = epochToScaleToSum[currentEpochCached][
            currentScaleCached
        ];

        /*
         * Calculate the new S first, before we update P.
         * The WStETH gain for any given depositor from a liquidation depends on the value of their deposit
         * (and the value of totalDeposits) prior to the Stability being depleted by the debt in the liquidation.
         *
         * Since S corresponds to WStETH gain, and P to deposit loss, we update S first.
         */
        uint marginalWStETHGain = _WStETHGainPerUnitStaked.mul(currentP);
        uint newS = currentS.add(marginalWStETHGain);
        epochToScaleToSum[currentEpochCached][currentScaleCached] = newS;
        emit S_Updated(newS, currentEpochCached, currentScaleCached);

        // If the Stability Pool was emptied, increment the epoch, and reset the scale and product P
        if (newProductFactor == 0) {
            currentEpoch = currentEpochCached.add(1);
            emit EpochUpdated(currentEpoch);
            currentScale = 0;
            emit ScaleUpdated(currentScale);
            newP = DECIMAL_PRECISION;

            // If multiplying P by a non-zero product factor would reduce P below the scale boundary, increment the scale
        } else if (
            currentP.mul(newProductFactor).div(DECIMAL_PRECISION) < SCALE_FACTOR
        ) {
            newP = currentP.mul(newProductFactor).mul(SCALE_FACTOR).div(
                DECIMAL_PRECISION
            );
            currentScale = currentScaleCached.add(1);
            emit ScaleUpdated(currentScale);
        } else {
            newP = currentP.mul(newProductFactor).div(DECIMAL_PRECISION);
        }

        assert(newP > 0);
        P = newP;

        emit P_Updated(newP);
    }

    function _moveOffsetCollAndDebt(
        uint _collToAdd,
        uint _debtToOffset
    ) internal {
        IActivePool activePoolCached = activePool;

        // Cancel the liquidated BaseFeeLMA debt with the BaseFeeLMA in the stability pool
        activePoolCached.decreaseBaseFeeLMADebt(_debtToOffset);
        _decreaseBaseFeeLMA(_debtToOffset);

        // Burn the debt that was successfully offset
        baseFeeLMAToken.burn(address(this), _debtToOffset);

        _increaseBalance(_collToAdd);
        activePoolCached.sendWStETH(address(this), _collToAdd);
    }

    function _decreaseBaseFeeLMA(uint _amount) internal {
        uint newTotalBaseFeeLMADeposits = totalBaseFeeLMADeposits.sub(_amount);
        totalBaseFeeLMADeposits = newTotalBaseFeeLMADeposits;
        emit StabilityPoolBaseFeeLMABalanceUpdated(newTotalBaseFeeLMADeposits);
    }

    // --- Reward calculator functions for depositor and front end ---

    /* Calculates the WStETH gain earned by the deposit since its last snapshots were taken.
     * Given by the formula:  E = d0 * (S - S(0))/P(0)
     * where S(0) and P(0) are the depositor's snapshots of the sum S and product P, respectively.
     * d0 is the last recorded deposit value.
     */
    function getDepositorWStETHGain(
        address _depositor
    ) public view returns (uint) {
        uint initialDeposit = deposits[_depositor].initialValue;

        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint WStETHGain = _getWStETHGainFromSnapshots(
            initialDeposit,
            snapshots
        );
        return WStETHGain;
    }

    function _getWStETHGainFromSnapshots(
        uint initialDeposit,
        Snapshots memory snapshots
    ) internal view returns (uint) {
        /*
         * Grab the sum 'S' from the epoch at which the stake was made. The WStETH gain may span up to one scale change.
         * If it does, the second portion of the WStETH gain is scaled by 1e9.
         * If the gain spans no scale change, the second portion will be 0.
         */
        uint128 epochSnapshot = snapshots.epoch;
        uint128 scaleSnapshot = snapshots.scale;
        uint S_Snapshot = snapshots.S;
        uint P_Snapshot = snapshots.P;

        uint firstPortion = epochToScaleToSum[epochSnapshot][scaleSnapshot].sub(
            S_Snapshot
        );
        uint secondPortion = epochToScaleToSum[epochSnapshot][
            scaleSnapshot.add(1)
        ].div(SCALE_FACTOR);

        uint WStETHGain = initialDeposit
            .mul(firstPortion.add(secondPortion))
            .div(P_Snapshot)
            .div(DECIMAL_PRECISION);

        return WStETHGain;
    }

    /*
     * Calculate the HOG gain earned by a deposit since its last snapshots were taken.
     * Given by the formula:  HOG = d0 * (G - G(0))/P(0)
     * where G(0) and P(0) are the depositor's snapshots of the sum G and product P, respectively.
     * d0 is the last recorded deposit value.
     */
    function getDepositorHOGGain(
        address _depositor
    ) public view returns (uint) {
        uint initialDeposit = deposits[_depositor].initialValue;
        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint HOGGain = _getHOGGainFromSnapshots(initialDeposit, snapshots);

        return HOGGain;
    }

    function _getHOGGainFromSnapshots(
        uint initialStake,
        Snapshots memory snapshots
    ) internal view returns (uint) {
        /*
         * Grab the sum 'G' from the epoch at which the stake was made. The HOG gain may span up to one scale change.
         * If it does, the second portion of the HOG gain is scaled by 1e9.
         * If the gain spans no scale change, the second portion will be 0.
         */
        uint128 epochSnapshot = snapshots.epoch;
        uint128 scaleSnapshot = snapshots.scale;
        uint G_Snapshot = snapshots.G;
        uint P_Snapshot = snapshots.P;

        uint firstPortion = epochToScaleToG[epochSnapshot][scaleSnapshot].sub(
            G_Snapshot
        );
        uint secondPortion = epochToScaleToG[epochSnapshot][
            scaleSnapshot.add(1)
        ].div(SCALE_FACTOR);

        uint HOGGain = initialStake
            .mul(firstPortion.add(secondPortion))
            .div(P_Snapshot)
            .div(DECIMAL_PRECISION);

        return HOGGain;
    }

    // --- Compounded deposit and compounded front end stake ---

    /*
     * Return the user's compounded deposit. Given by the formula:  d = d0 * P/P(0)
     * where P(0) is the depositor's snapshot of the product P, taken when they last updated their deposit.
     */
    function getCompoundedBaseFeeLMADeposit(
        address _depositor
    ) public view returns (uint) {
        uint initialDeposit = deposits[_depositor].initialValue;
        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint compoundedDeposit = _getCompoundedStakeFromSnapshots(
            initialDeposit,
            snapshots
        );
        return compoundedDeposit;
    }

    // Internal function, used to calculcate compounded deposits and compounded front end stakes.
    function _getCompoundedStakeFromSnapshots(
        uint initialStake,
        Snapshots memory snapshots
    ) internal view returns (uint) {
        uint snapshot_P = snapshots.P;
        uint128 scaleSnapshot = snapshots.scale;
        uint128 epochSnapshot = snapshots.epoch;

        // If stake was made before a pool-emptying event, then it has been fully cancelled with debt -- so, return 0
        if (epochSnapshot < currentEpoch) {
            return 0;
        }

        uint compoundedStake;
        uint128 scaleDiff = currentScale.sub(scaleSnapshot);

        /* Compute the compounded stake. If a scale change in P was made during the stake's lifetime,
         * account for it. If more than one scale change was made, then the stake has decreased by a factor of
         * at least 1e-9 -- so return 0.
         */
        if (scaleDiff == 0) {
            compoundedStake = initialStake.mul(P).div(snapshot_P);
        } else if (scaleDiff == 1) {
            compoundedStake = initialStake.mul(P).div(snapshot_P).div(
                SCALE_FACTOR
            );
        } else {
            // if scaleDiff >= 2
            compoundedStake = 0;
        }

        /*
         * If compounded deposit is less than a billionth of the initial deposit, return 0.
         *
         * NOTE: originally, this line was in place to stop rounding errors making the deposit too large. However, the error
         * corrections should ensure the error in P "favors the Pool", i.e. any given compounded deposit should slightly less
         * than it's theoretical value.
         *
         * Thus it's unclear whether this line is still really needed.
         */
        if (compoundedStake < initialStake.div(1e9)) {
            return 0;
        }

        return compoundedStake;
    }

    // --- Sender functions for BaseFeeLMA deposit, WStETH gains and HOG gains ---

    // Transfer the BaseFeeLMA tokens from the user to the Stability Pool's address, and update its recorded BaseFeeLMA
    function _sendBaseFeeLMAtoStabilityPool(
        address _address,
        uint _amount
    ) internal {
        baseFeeLMAToken.sendToPool(_address, address(this), _amount);
        uint newTotalBaseFeeLMADeposits = totalBaseFeeLMADeposits.add(_amount);
        totalBaseFeeLMADeposits = newTotalBaseFeeLMADeposits;
        emit StabilityPoolBaseFeeLMABalanceUpdated(newTotalBaseFeeLMADeposits);
    }

    /**
     * HEDGEHOG UPDATES: use SafeERC20 safe transfer instead of native token transfer
     */
    function _sendWStETHGainToDepositor(uint _amount) internal {
        if (_amount == 0) {
            return;
        }
        uint newWStETH = WStETH.sub(_amount);
        WStETH = newWStETH;
        emit StabilityPoolWStETHBalanceUpdated(newWStETH);
        emit WStETHSent(msg.sender, _amount);

        WStETHToken.safeTransfer(msg.sender, _amount);
    }

    // Send BaseFeeLMA to user and decrease BaseFeeLMA in Pool
    function _sendBaseFeeLMAToDepositor(
        address _depositor,
        uint BaseFeeLMAWithdrawal
    ) internal {
        if (BaseFeeLMAWithdrawal == 0) {
            return;
        }

        baseFeeLMAToken.returnFromPool(
            address(this),
            _depositor,
            BaseFeeLMAWithdrawal
        );
        _decreaseBaseFeeLMA(BaseFeeLMAWithdrawal);
    }

    // --- Stability Pool Deposit Functionality ---
    function _updateDepositAndSnapshots(
        address _depositor,
        uint _newValue
    ) internal {
        deposits[_depositor].initialValue = _newValue;

        if (_newValue == 0) {
            delete depositSnapshots[_depositor];
            emit DepositSnapshotUpdated(_depositor, 0, 0, 0);
            return;
        }
        uint128 currentScaleCached = currentScale;
        uint128 currentEpochCached = currentEpoch;
        uint currentP = P;

        // Get S and G for the current epoch and current scale
        uint currentS = epochToScaleToSum[currentEpochCached][
            currentScaleCached
        ];
        uint currentG = epochToScaleToG[currentEpochCached][currentScaleCached];

        // Record new snapshots of the latest running product P, sum S, and sum G, for the depositor
        depositSnapshots[_depositor].P = currentP;
        depositSnapshots[_depositor].S = currentS;
        depositSnapshots[_depositor].G = currentG;
        depositSnapshots[_depositor].scale = currentScaleCached;
        depositSnapshots[_depositor].epoch = currentEpochCached;

        emit DepositSnapshotUpdated(_depositor, currentP, currentS, currentG);
    }

    function _payOutHOGGains(
        ICommunityIssuance _communityIssuance,
        address _depositor
    ) internal {
        // Pay out depositor's HOG gain
        uint depositorHOGGain = getDepositorHOGGain(_depositor);
        _communityIssuance.sendHOG(_depositor, depositorHOGGain);
        emit HOGPaidToDepositor(_depositor, depositorHOGGain);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == address(activePool),
            "StabilityPool: Caller is not ActivePool"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == address(troveManager),
            "StabilityPool: Caller is not TroveManager"
        );
    }

    function _requireNoUnderCollateralizedTroves() internal {
        uint price = priceFeed.fetchPrice();
        address lowestTrove = sortedTroves.getLast();
        uint ICR = troveManager.getCurrentICR(lowestTrove, price);
        require(
            ICR >= MCR,
            "StabilityPool: Cannot withdraw while there are troves with ICR < MCR"
        );
    }

    function _requireUserHasDeposit(uint _initialDeposit) internal pure {
        require(
            _initialDeposit > 0,
            "StabilityPool: User must have a non-zero deposit"
        );
    }

    function _requireUserHasNoDeposit(address _address) internal view {
        uint initialDeposit = deposits[_address].initialValue;
        require(
            initialDeposit == 0,
            "StabilityPool: User must have no deposit"
        );
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, "StabilityPool: Amount must be non-zero");
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(
            troveManager.getTroveStatus(_depositor) == 1,
            "StabilityPool: caller must have an active trove to withdraw WStETHGain to"
        );
    }

    function _requireUserHasWStETHGain(address _depositor) internal view {
        uint WStETHGain = getDepositorWStETHGain(_depositor);
        require(
            WStETHGain > 0,
            "StabilityPool: caller must have non-zero WStETH Gain"
        );
    }

    function _requireValidKickbackRate(uint _kickbackRate) internal pure {
        require(
            _kickbackRate <= DECIMAL_PRECISION,
            "StabilityPool: Kickback rate must be in range [0,1]"
        );
    }

    /**
     * Hedgehog Updates:
     * Remove native token fallback function and replace with internal balance increaser as it is used only in the offset function
     *
     */
    function _increaseBalance(uint256 _amount) internal {
        WStETH = WStETH.add(_amount);
    }

    // --- Fallback function ---
}
