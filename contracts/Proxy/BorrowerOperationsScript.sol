// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dependencies/CheckContract.sol";
import "../interfaces/IBorrowerOperations.sol";

contract BorrowerOperationsScript is CheckContract {
    IBorrowerOperations immutable borrowerOperations;

    constructor(IBorrowerOperations _borrowerOperations) {
        checkContract(address(_borrowerOperations));
        borrowerOperations = _borrowerOperations;
    }

    function openTrove(
        uint _maxFee,
        uint _BaseFeeLMAAmount,
        uint _collAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        borrowerOperations.openTrove(
            _maxFee,
            _BaseFeeLMAAmount,
            _collAmount,
            _upperHint,
            _lowerHint
        );
    }

    function addColl(
        address _upperHint,
        address _lowerHint,
        uint _collAmount
    ) external payable {
        borrowerOperations.addColl(_upperHint, _lowerHint, _collAmount);
    }

    function withdrawColl(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        borrowerOperations.withdrawColl(_amount, _upperHint, _lowerHint);
    }

    function withdrawBaseFeeLMA(
        uint _maxFee,
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        borrowerOperations.withdrawBaseFeeLMA(
            _maxFee,
            _amount,
            _upperHint,
            _lowerHint
        );
    }

    function repayBaseFeeLMA(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        borrowerOperations.repayBaseFeeLMA(_amount, _upperHint, _lowerHint);
    }

    function closeTrove() external {
        borrowerOperations.closeTrove();
    }

    function adjustTrove(
        uint _maxFee,
        uint _collWithdrawal,
        uint _collIncrease,
        uint _debtChange,
        bool isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external payable {
        borrowerOperations.adjustTrove(
            _maxFee,
            _collWithdrawal,
            _collIncrease,
            _debtChange,
            isDebtIncrease,
            _upperHint,
            _lowerHint
        );
    }

    function claimCollateral() external {
        borrowerOperations.claimCollateral();
    }
}
