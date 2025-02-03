// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../BorrowerOperations.sol";
import "../dependencies/CheckContract.sol";

contract BorrowerOperationsLiquidationsTest is BorrowerOperations {
    using SafeMath for uint256;

    IERC20 collToken;
    uint256 public unusedWithdrawalLimit;
    uint public withdrawalLimitThreshould = 100000000000000000000;

    constructor(address _activePool, IERC20 _collToken) {
        activePool = IActivePool(_activePool);
        collToken = _collToken;

        lastWithdrawalTimestamp = block.timestamp - (EXPAND_DURATION);
    }

    function setUnusedWithdrawalLimit(uint256 _newLimit) external {
        unusedWithdrawalLimit = _newLimit;
    }

    function setWithDrawalLimitThreshold(uint256 _newLimit) external {
        withdrawalLimitThreshould = _newLimit;
    }
}
