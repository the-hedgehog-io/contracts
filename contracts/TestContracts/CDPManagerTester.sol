// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../TroveManager.sol";

/* Tester contract inherits from TroveManager, and provides external functions 
for testing the parent's internal functions. */

contract TroveManagerTester is TroveManager {
    function computeICR(
        uint _coll,
        uint _debt,
        uint _price
    ) external pure returns (uint) {
        return LiquityMath._computeCR(_coll, _debt, _price);
    }

    function getCollGasCompensation(uint _coll) external pure returns (uint) {
        return _getCollGasCompensation(_coll);
    }

    function getBaseFeeLMAGasCompensation() external pure returns (uint) {
        return BaseFeeLMA_GAS_COMPENSATION;
    }

    function getCompositeDebt(uint _debt) external pure returns (uint) {
        return _getCompositeDebt(_debt);
    }

    function unprotectedDecayBaseRateFromBorrowing() external returns (uint) {
        redemptionBaseRate = _calcDecayedRedemptionBaseRate();
        assert(
            redemptionBaseRate >= 0 && redemptionBaseRate <= DECIMAL_PRECISION
        );

        _updateLastRedemptionTime();
        return redemptionBaseRate;
    }

    function minutesPassedSinceLastFeeOp() external view returns (uint) {
        return _minutesPassedSinceLastRedemption();
    }

    function setLastFeeOpTimeToNow() external {
        lastRedemptionTime = block.timestamp;
    }

    function setBaseRate(uint _baseRate) external {
        redemptionBaseRate = _baseRate;
    }

    function callGetRedemptionFee(uint _ETHDrawn) external view returns (uint) {
        _getRedemptionFee(_ETHDrawn);
    }

    function getActualDebtFromComposite(
        uint _debtVal
    ) external pure returns (uint) {
        return _getNetDebt(_debtVal);
    }

    function callInternalRemoveTroveOwner(address _troveOwner) external {
        uint troveOwnersArrayLength = TroveOwners.length;
        _removeTroveOwner(_troveOwner, troveOwnersArrayLength);
    }
}
