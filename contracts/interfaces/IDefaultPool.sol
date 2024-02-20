// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./IPool.sol";

interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolBaseFeeLMADebtUpdated(uint _BaseFeeLMADebt);
    event DefaultPoolWStETHBalanceUpdated(uint _WStETH);

    // --- Functions ---
    function sendWStETHToActivePool(uint _amount) external;

    function increaseBalance(uint256 _amount) external;
}
