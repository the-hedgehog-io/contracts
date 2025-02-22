// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./TroveManager.sol";

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
}

contract TroveManagerArb is TroveManager {

    // HEDGEHOG UPDATES: New constant interface ArbSys - enabling retrieval of block number
    ArbSys constant arbsys = ArbSys(address(100));

    constructor(uint256 _bootsrapDaysAmount) TroveManager(_bootsrapDaysAmount) {
    }

    // Hedgehog Updates: New function that stores block update into a trove. This block is checked at the start of adjust, close and open functions.
    function setTroveLastUpdatedBlock(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].lastBlockUpdated = arbsys.arbBlockNumber();
    }
}
