// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./IPool.sol";

interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolBaseFeeLMADebtUpdated(uint _BaseFeeLMADebt);
    event DefaultPoolStETHBalanceUpdated(uint _StETH);

    // --- Functions ---
    function sendStETHToActivePool(uint _amount) external;
}
