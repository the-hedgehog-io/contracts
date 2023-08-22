// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../HOG/HOGStaking.sol";

contract hogStakingTester is HOGStaking {
    function requireCallerIsTroveManager() external view {
        _requireCallerIsTroveManager();
    }
}
