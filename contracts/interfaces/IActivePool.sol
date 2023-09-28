// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./IPool.sol";

interface IActivePool is IPool {
    // --- Events ---
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolBaseFeeLMADebtUpdated(uint _BaseFeeLMADebt);
    event ActivePoolStETHBalanceUpdated(uint _StETH);

    // --- Functions ---
    function sendStETH(address _account, uint _amount) external;

    function getStETH() external view returns (uint256);

    function increaseBalance(uint256 _amount) external;
}
