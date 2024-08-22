// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import {HedgehogBase} from "../dependencies/HedgehogBase.sol";
import {IActivePool} from "../interfaces/IActivePool.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import "../dependencies/LiquityMath.sol";

contract BorrowerOperationsWithdrawalTest is HedgehogBase {
    uint256 lastWithdrawlTimestamp;
    IERC20 collToken;
    uint256 unusedWithdrawlLimit;

    constructor(address _activePool, IERC20 _collToken) {
        activePool = IActivePool(_activePool);
        collToken = _collToken;

        lastWithdrawlTimestamp = block.timestamp - (720 minutes);
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
        collToken.transferFrom(msg.sender, address(activePool), _collAmount);
        activePool.increaseBalance(_collAmount);
        uint256 newLimit = unusedWithdrawlLimit + _collAmount;

        if (newLimit >= (unusedWithdrawlLimit * 3) / 4) {
            unusedWithdrawlLimit = (activePool.getWStETH() * 3) / 4;
            lastWithdrawlTimestamp = block.timestamp - 720 minutes;
        } else {
            unusedWithdrawlLimit = newLimit;
        }
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
        if (_collWithdrawal > 0) {
            _checkWithdrawlLimit(_collWithdrawal);
            activePool.sendWStETH(msg.sender, _collWithdrawal);
        }
        if (_collIncrease > 0) {
            collToken.transferFrom(
                msg.sender,
                address(activePool),
                _collIncrease
            );
            activePool.increaseBalance(_collIncrease);
            uint256 newColl = activePool.getWStETH() + _collIncrease;
            uint256 newLimit = unusedWithdrawlLimit + ((_collIncrease * 3) / 4);
            if (newLimit > activePool.getWStETH()) {
                newLimit = (newColl * 3) / 4;
            }

            unusedWithdrawlLimit = newLimit;
        }
    }

    function _checkWithdrawlLimit(uint256 _collWithdrawal) internal {
        if (_collWithdrawal > 0) {
            // If coll in the system is greater then threshold - we check if user may withdraw the desired amount. Otherwise they are free to withdraw whole amount
            if (activePool.getWStETH() > WITHDRAWL_LIMIT_THRESHOLD) {
                (uint256 fullLimit, uint256 singleTxWithdrawable) = LiquityMath
                    ._checkWithdrawlLimit(
                        lastWithdrawlTimestamp,
                        EXPAND_DURATION,
                        unusedWithdrawlLimit,
                        activePool.getWStETH()
                    );

                if (singleTxWithdrawable < _collWithdrawal) {
                    revert(
                        "BO: Cannot withdraw more then 80% of withdrawble in one tx"
                    );
                }

                // Update current unusedWithdrawlLimit
                unusedWithdrawlLimit = fullLimit - _collWithdrawal;
            } else {
                unusedWithdrawlLimit = activePool.getWStETH();
            }
            // Update the withdrawl recorded timestamp
            lastWithdrawlTimestamp = block.timestamp;
        }
    }
}
