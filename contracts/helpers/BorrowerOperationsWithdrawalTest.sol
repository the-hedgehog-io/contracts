// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import {HedgehogBase} from "../dependencies/HedgehogBase.sol";
import {IActivePool} from "../interfaces/IActivePool.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import "../dependencies/LiquityMath.sol";

contract BorrowerOperationsWithdrawalTest is HedgehogBase {
    uint256 lastWithdrawalTimestamp;
    IERC20 collToken;
    uint256 unusedWithdrawalLimit;

    constructor(address _activePool, IERC20 _collToken) {
        activePool = IActivePool(_activePool);
        collToken = _collToken;

        lastWithdrawalTimestamp = block.timestamp - (EXPAND_DURATION);
    }

    function withdrawColl(
        uint _collWithdrawal,
        address _upperHint,
        address _lowerHint
    ) external {
        _adjustTrove(
            msg.sender,
            _collWithdrawal,
            0,
            0,
            false,
            _upperHint,
            _lowerHint,
            0
        );
    }

    function openTrove(
        uint _maxFeePercentage,
        uint _BaseFeeLMAAmount,
        uint _collAmount,
        address _upperHint,
        address _lowerHint
    ) external {
        uint256 oldColl = activePool.getWStETH();
        collToken.transferFrom(msg.sender, address(activePool), _collAmount);
        activePool.increaseBalance(_collAmount);

        _updateWithdrawalLimitFromCollIncrease(oldColl, _collAmount);
    }

    function addColl(
        address _upperHint,
        address _lowerHint,
        uint _amount
    ) external {
        require(_amount > 0, "Borrower Operations: Invalid amount");

        _adjustTrove(
            msg.sender,
            0,
            _amount,
            0,
            false,
            _upperHint,
            _lowerHint,
            0
        );
    }

    function adjustTrove(
        uint _maxFeePercentage,
        uint _collWithdrawal,
        uint _collIncrease,
        uint _BaseFeeLMAChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external {
        _adjustTrove(
            msg.sender,
            _collWithdrawal,
            _collIncrease,
            _BaseFeeLMAChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint,
            _maxFeePercentage
        );
    }

    function _adjustTrove(
        address _borrower,
        uint _collWithdrawal,
        uint _collIncrease,
        uint _BaseFeeLMAChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint,
        uint _maxFeePercentage
    ) internal {
        uint256 previousColl = activePool.getWStETH();
        if (_collWithdrawal > 0) {
            _checkWithdrawalLimit(_collWithdrawal);
            activePool.sendWStETH(msg.sender, _collWithdrawal);
        }
        if (_collIncrease > 0) {
            collToken.transferFrom(
                msg.sender,
                address(activePool),
                _collIncrease
            );
            activePool.increaseBalance(_collIncrease);

            _updateWithdrawalLimitFromCollIncrease(previousColl, _collIncrease);
        }
    }

    function _updateWithdrawalLimitFromCollIncrease(
        uint256 _previousColl,
        uint256 _collIncrease
    ) internal {
        uint256 newColl = _previousColl + _collIncrease;

        uint256 newLimit = (_previousColl / 2) + (_collIncrease / 2);
        if (newLimit >= _previousColl) {
            newLimit = (newColl / 2);
            lastWithdrawalTimestamp = block.timestamp - 720 minutes;
        }

        unusedWithdrawalLimit = newLimit;
    }

    function _checkWithdrawalLimit(uint256 _collWithdrawal) internal {
        if (_collWithdrawal > 0) {
            // If coll in the system is greater then threshold - we check if user may withdraw the desired amount. Otherwise they are free to withdraw whole amount
            if (activePool.getWStETH() > WITHDRAWAL_LIMIT_THRESHOLD) {
                (uint256 fullLimit, uint256 singleTxWithdrawable) = LiquityMath
                    ._checkWithdrawalLimit(
                        lastWithdrawalTimestamp,
                        EXPAND_DURATION,
                        unusedWithdrawalLimit,
                        activePool.getWStETH()
                    );

                if (singleTxWithdrawable < _collWithdrawal) {
                    revert(
                        "BO: Cannot withdraw more than 80% of withdrawble in one tx"
                    );
                }

                // Update current unusedWithdrawalLimit
                unusedWithdrawalLimit = fullLimit - _collWithdrawal;
            } else {
                unusedWithdrawalLimit = activePool.getWStETH();
            }
            // Update the withdrawal recorded timestamp
            lastWithdrawalTimestamp = block.timestamp;
        }
    }
}
