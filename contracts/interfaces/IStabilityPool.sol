// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

/*
 * The Stability Pool holds BaseFeeLMA tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, then depending on system conditions, some of its BaseFeeLMA debt gets offset with
 * BaseFeeLMA in the Stability Pool:  that is, the offset debt evaporates, and an equal amount of BaseFeeLMA tokens in the Stability Pool is burned.
 *
 * Thus, a liquidation causes each depositor to receive a BaseFeeLMA loss, in proportion to their deposit as a share of total deposits.
 * They also receive an StETH gain, as the StETH collateral of the liquidated trove is distributed among Stability depositors,
 * in the same proportion.
 *
 * When a liquidation occurs, it depletes every deposit by the same fraction: for example, a liquidation that depletes 40%
 * of the total BaseFeeLMA in the Stability Pool, depletes 40% of each deposit.
 *
 * A deposit that has experienced a series of liquidations is termed a "compounded deposit": each liquidation depletes the deposit,
 * multiplying it by some factor in range ]0,1[
 *
 * Please see the implementation spec in the proof document, which closely follows on from the compounded deposit / StETH gain derivations:
 * https://github.com/liquity/liquity/blob/master/papers/Scalable_Reward_Distribution_with_Compounding_Stakes.pdf
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
 */
interface IStabilityPool {
    // --- Events ---

    event StabilityPoolStETHBalanceUpdated(uint _newBalance);
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

    event StETHGainWithdrawn(
        address indexed _depositor,
        uint _StETH,
        uint _BaseFeeLMALoss
    );
    event HOGPaidToDepositor(address indexed _depositor, uint _HOG);
    event StETHSent(address _to, uint _amount);

    // --- Functions ---

    /*
     * Called only once on init, to set addresses of other Hedgehog contracts
     * Callable only by owner, renounces ownership at the end
     */
    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _baseFeeLMATokenAddress,
        address _sortedTrovesAddress,
        address _priceFeedAddress,
        address _communityIssuanceAddress
    ) external;

    /*
     * Initial checks:
     * - _amount is not zero
     * ---
     * - Triggers a HOG issuance, based on time passed since the last issuance. The HOG issuance is shared between *all* depositors and front ends
     * - Tags the deposit with the provided front end tag param, if it's a new deposit
     * - Sends depositor's accumulated gains (HOG, StETH) to depositor
     * - Sends the tagged front end's accumulated HOG gains to the tagged front end
     * - Increases deposit and tagged front end's stake, and takes new snapshots for each.
     */
    function provideToSP(uint _amount) external;

    /*
     * Initial checks:
     * - _amount is zero or there are no under collateralized troves left in the system
     * - User has a non zero deposit
     * ---
     * - Triggers a HOG issuance, based on time passed since the last issuance. The HOG issuance is shared between *all* depositors and front ends
     * - Removes the deposit's front end tag if it is a full withdrawal
     * - Sends all depositor's accumulated gains (HOG, StETH) to depositor
     * - Sends the tagged front end's accumulated HOG gains to the tagged front end
     * - Decreases deposit and tagged front end's stake, and takes new snapshots for each.
     *
     * If _amount > userDeposit, the user withdraws all of their compounded deposit.
     */
    function withdrawFromSP(uint _amount) external;

    /*
     * Initial checks:
     * - User has a non zero deposit
     * - User has an open trove
     * - User has some StETH gain
     * ---
     * - Triggers a HOG issuance, based on time passed since the last issuance. The HOG issuance is shared between *all* depositors and front ends
     * - Sends all depositor's HOG gain to  depositor
     * - Sends all tagged front end's HOG gain to the tagged front end
     * - Transfers the depositor's entire StETH gain from the Stability Pool to the caller's trove
     * - Leaves their compounded deposit in the Stability Pool
     * - Updates snapshots for deposit and tagged front end stake
     */
    function withdrawStETHGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external;

    /*
     * Initial checks:
     * - Caller is TroveManager
     * ---
     * Cancels out the specified debt against the BaseFeeLMA contained in the Stability Pool (as far as possible)
     * and transfers the Trove's StETH collateral from ActivePool to StabilityPool.
     * Only called by liquidation functions in the TroveManager.
     */
    function offset(uint _debt, uint _coll) external;

    /*
     * Returns the total amount of StETH held by the pool, accounted in an internal variable instead of `balance`,
     * to exclude edge cases like StETH received from a self-destruct.
     */
    function getStETH() external view returns (uint);

    /*
     * Returns BaseFeeLMA held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
     */
    function getTotalBaseFeeLMADeposits() external view returns (uint);

    /*
     * Calculates the StETH gain earned by the deposit since its last snapshots were taken.
     */
    function getDepositorStETHGain(
        address _depositor
    ) external view returns (uint);

    /*
     * Calculate the HOG gain earned by a deposit since its last snapshots were taken.
     * If not tagged with a front end, the depositor gets a 100% cut of what their deposit earned.
     * Otherwise, their cut of the deposit's earnings is equal to the kickbackRate, set by the front end through
     * which they made their deposit.
     */
    function getDepositorHOGGain(
        address _depositor
    ) external view returns (uint);

    /*
     * Return the user's compounded deposit.
     */
    function getCompoundedBaseFeeLMADeposit(
        address _depositor
    ) external view returns (uint);
}
