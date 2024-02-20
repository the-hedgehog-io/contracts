// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./BaseMath.sol";
import "./LiquityMath.sol";
import "../interfaces/IActivePool.sol";
import "../interfaces/IDefaultPool.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IHedgehogBase.sol";

/**
 * @notice Fork of LiquityMath with an upgraded pragma and:
 * Base contract for TroveManager, BorrowerOperations and StabilityPool. Contains global system constants and
 * common functions.
 *
 * Hedgehog updates:
 * Rename variables,
 * Increase MCR and CCR,
 * Update Min Net Debt
 */
contract HedgehogBase is BaseMath, IHedgehogBase {
    using SafeMath for uint;

    uint public constant _100pct = 1000000000000000000; // 1e18 == 100%

    // Minimum collateral ratio for individual troves
    uint public constant MCR = 1500000000000000000; // 150%

    // Critical system collateral ratio. If the system's total collateral ratio (TCR) falls below the CCR, Recovery Mode is triggered.
    uint public constant CCR = 5000000000000000000; // 150%

    // HEDGEHOG: Decreased to 0.1 BFE
    // Amount of BaseFeeLMA to be locked in gas pool on opening troves
    uint public immutable BaseFeeLMA_GAS_COMPENSATION;

    // HEDGEHOG UPDATES: Decreased min net debt to 0.1 BFE
    // Minimum amount of net BaseFeeLMA debt a trove must have
    uint public immutable MIN_NET_DEBT;

    uint public constant PERCENT_DIVISOR = 200; // dividing by 200 yields 0.5%

    uint public constant BORROWING_FEE_FLOOR = (DECIMAL_PRECISION / 1000) * 5; // 0.5%

    IActivePool public activePool;

    IDefaultPool public defaultPool;

    IPriceFeed public override priceFeed;

    constructor(uint _gasComp, uint _minNetDebt) {
        BaseFeeLMA_GAS_COMPENSATION = _gasComp;
        MIN_NET_DEBT = _minNetDebt;
    }

    // --- Gas compensation functions ---

    // Returns the composite debt (drawn debt + gas compensation) of a trove, for the purpose of ICR calculation
    // HEDGEHOG UPDATES:
    // No longer deduct gas comp from a net debt
    function _getCompositeDebt(uint _debt) internal pure returns (uint) {
        return _debt;
    }

    // HEDGEHOG UPDATES:
    // No longer deduct gas comp from a net debt
    function _getNetDebt(uint _debt) internal pure returns (uint) {
        return _debt;
    }

    // Return the amount of WStETH to be drawn from a trove's collateral and sent as gas compensation.
    function _getCollGasCompensation(
        uint _entireColl
    ) internal pure returns (uint) {
        return _entireColl / PERCENT_DIVISOR;
    }

    function getEntireSystemColl() public view returns (uint entireSystemColl) {
        uint activeColl = activePool.getWStETH();
        uint liquidatedColl = defaultPool.getWStETH();
        return activeColl.add(liquidatedColl);
    }

    function getEntireSystemDebt() public view returns (uint entireSystemDebt) {
        uint activeDebt = activePool.getBaseFeeLMADebt();
        uint closedDebt = defaultPool.getBaseFeeLMADebt();

        return activeDebt.add(closedDebt);
    }

    function _getTCR(uint _price) internal view returns (uint TCR) {
        uint entireSystemColl = getEntireSystemColl();
        uint entireSystemDebt = getEntireSystemDebt();
        TCR = LiquityMath._computeCR(
            entireSystemColl,
            entireSystemDebt,
            _price
        );

        return TCR;
    }

    function _checkRecoveryMode(uint _price) internal view returns (bool) {
        uint TCR = _getTCR(_price);

        return TCR < CCR;
    }

    function _requireUserAcceptsFee(
        uint _fee,
        uint _amount,
        uint _maxFeePercentage
    ) internal pure {
        uint feePercentage = _fee.mul(DECIMAL_PRECISION).div(_amount);
        require(
            feePercentage <= _maxFeePercentage,
            "Fee exceeded provided maximum"
        );
    }
}
