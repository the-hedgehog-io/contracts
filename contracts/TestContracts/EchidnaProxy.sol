// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../TroveManager.sol";
import "../BorrowerOperations.sol";
import "../StabilityPool.sol";
import "../BaseFeeLMAToken.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract EchidnaProxy {
    TroveManager troveManager;
    BorrowerOperations borrowerOperations;
    StabilityPool stabilityPool;
    BaseFeeLMAToken baseFeeLMAToken;

    constructor(
        TroveManager _troveManager,
        BorrowerOperations _borrowerOperations,
        StabilityPool _stabilityPool,
        BaseFeeLMAToken _BaseFeeLMAToken
    ) {
        troveManager = _troveManager;
        borrowerOperations = _borrowerOperations;
        stabilityPool = _stabilityPool;
        baseFeeLMAToken = _BaseFeeLMAToken;
    }

    receive() external payable {
        // do nothing
    }

    // TroveManager

    function liquidatePrx(address _user) external {
        troveManager.liquidate(_user);
    }

    function liquidateTrovesPrx(uint _n) external {
        troveManager.liquidateTroves(_n);
    }

    function batchLiquidateTrovesPrx(address[] calldata _troveArray) external {
        troveManager.batchLiquidateTroves(_troveArray);
    }

    function redeemCollateralPrx(
        uint _BaseFeeLMAAmount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint _partialRedemptionHintNICR,
        uint _maxIterations,
        uint _maxFee
    ) external {
        troveManager.redeemCollateral(
            _BaseFeeLMAAmount,
            _firstRedemptionHint,
            _upperPartialRedemptionHint,
            _lowerPartialRedemptionHint,
            _partialRedemptionHintNICR,
            _maxIterations,
            _maxFee
        );
    }

    // Borrower Operations
    function openTrovePrx(
        uint _StETH,
        uint _BaseFeeLMAAmount,
        address _upperHint,
        address _lowerHint,
        uint _maxFee
    ) external payable {
        borrowerOperations.openTrove{value: _StETH}(
            _maxFee,
            _BaseFeeLMAAmount,
            _upperHint,
            _lowerHint
        );
    }

    function addCollPrx(
        uint _StETH,
        address _upperHint,
        address _lowerHint
    ) external payable {
        borrowerOperations.addColl{value: _StETH}(_upperHint, _lowerHint);
    }

    function withdrawCollPrx(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        borrowerOperations.withdrawColl(_amount, _upperHint, _lowerHint);
    }

    function withdrawBaseFeeLMAPrx(
        uint _amount,
        address _upperHint,
        address _lowerHint,
        uint _maxFee
    ) external {
        borrowerOperations.withdrawBaseFeeLMA(
            _maxFee,
            _amount,
            _upperHint,
            _lowerHint
        );
    }

    function repayBaseFeeLMAPrx(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        borrowerOperations.repayBaseFeeLMA(_amount, _upperHint, _lowerHint);
    }

    function closeTrovePrx() external {
        borrowerOperations.closeTrove();
    }

    function adjustTrovePrx(
        uint _StETH,
        uint _collWithdrawal,
        uint _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint,
        uint _maxFee
    ) external payable {
        borrowerOperations.adjustTrove{value: _StETH}(
            _maxFee,
            _collWithdrawal,
            _debtChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint
        );
    }

    // Pool Manager
    function provideToSPPrx(uint _amount, address _frontEndTag) external {
        stabilityPool.provideToSP(_amount, _frontEndTag);
    }

    function withdrawFromSPPrx(uint _amount) external {
        stabilityPool.withdrawFromSP(_amount);
    }

    // BaseFeeLMA Token

    function transferPrx(
        address recipient,
        uint256 amount
    ) external returns (bool) {
        return baseFeeLMAToken.transfer(recipient, amount);
    }

    function approvePrx(
        address spender,
        uint256 amount
    ) external returns (bool) {
        return baseFeeLMAToken.approve(spender, amount);
    }

    function transferFromPrx(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        return baseFeeLMAToken.transferFrom(sender, recipient, amount);
    }

    function increaseAllowancePrx(
        address spender,
        uint256 addedValue
    ) external returns (bool) {
        return baseFeeLMAToken.increaseAllowance(spender, addedValue);
    }

    function decreaseAllowancePrx(
        address spender,
        uint256 subtractedValue
    ) external returns (bool) {
        return baseFeeLMAToken.decreaseAllowance(spender, subtractedValue);
    }
}
