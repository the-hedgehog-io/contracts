// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract BorrowerOperationsLiquidationsTest {
    uint256 public unusedWithdrawlLimit;
    uint256 public lastWithdrawlTimestamp;
    uint256 public activePoolWStETH;

    function setWithdrawlLimit(uint256 _limit) public {
        unusedWithdrawlLimit = _limit;
    }

    function setActivePoolWStETH(uint256 _amount) public {
        activePoolWStETH = _amount;
    }

    function setLastWithdrawlTimestamp(uint256 _timestamp) public {
        lastWithdrawlTimestamp = _timestamp;
    }

    function simulateWithdraw(uint256 _collWithdrawal) public {
        if (activePoolWStETH > 100000000000000000000) {
            uint256 fullLimit = unusedWithdrawlLimit;
            if (_collWithdrawal > (fullLimit * 80) / 100) {
                revert("Cannot withdraw more than 80% in one tx");
            }
            unusedWithdrawlLimit = fullLimit - _collWithdrawal;
        } else {
            unusedWithdrawlLimit = activePoolWStETH;
        }
        lastWithdrawlTimestamp = block.timestamp;
    }

    function simulateLiquidation(uint256 _collWithdrawal) public {
        simulateWithdraw(_collWithdrawal);

        _sendGasCompensation();
    }

    function _sendGasCompensation() internal view {
        if (unusedWithdrawlLimit == 0) {
            revert("Insufficient funds for gas compensation");
        }
    }
}
