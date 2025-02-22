// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./BaseMath.sol";
import "./LiquityMath.sol";
import "../interfaces/IActivePool.sol";
import "../interfaces/IDefaultPool.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IHedgehogBase.sol";
import "hardhat/console.sol";

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

    // HEDGEHOG UPDATES: Increased to 150%
    // Minimum collateral ratio for individual troves
    uint public constant MCR = 1500000000000000000; // 150%

    // HEDGEHOG UPDATES: Increased to 200%
    // Critical system collateral ratio. If the system's total collateral ratio (TCR) falls below the CCR, Recovery Mode is triggered.
    uint public constant CCR = 2000000000000000000; // 200%

    // HEDGEHOG UPDATES: Updated to 150000000000000000000000
    // Amount of BaseFeeLMA to be locked in gas pool on opening troves
    uint public constant BaseFeeLMA_GAS_COMPENSATION = 300000000000000000000000;

    // HEDGEHOG UPDATES: Updated to to 100000000000000000000000000 BFE
    // Minimum amount of net BaseFeeLMA debt a trove must have
    uint public constant MIN_NET_DEBT = 100000000000000000000000000;

    uint256 public constant EXPAND_DURATION = 720 minutes;

    uint public constant PERCENT_DIVISOR = 200; // dividing by 200 yields 0.5%

    uint public constant BORROWING_FEE_FLOOR = (DECIMAL_PRECISION / 1000) * 5; // 0.5%

    IActivePool public activePool;

    IDefaultPool public defaultPool;

    IPriceFeed public override priceFeed;

    // --- Gas compensation functions ---

    // Returns the composite debt (drawn debt + gas compensation) of a trove, for the purpose of ICR calculation
    function _getCompositeDebt(uint _debt) internal pure returns (uint) {
        return _debt.add(BaseFeeLMA_GAS_COMPENSATION);
    }

    function _getNetDebt(uint _debt) internal pure returns (uint) {
        return _debt.sub(BaseFeeLMA_GAS_COMPENSATION);
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
