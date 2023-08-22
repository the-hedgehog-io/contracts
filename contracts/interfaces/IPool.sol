// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

// Common interface for the Pools.
interface IPool {
    // --- Events ---

    event StETHBalanceUpdated(uint _newBalance);
    event BaseFeeLMABalanceUpdated(uint _newBalance);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event StETHSent(address _to, uint _amount);

    // --- Functions ---

    function getStETH() external view returns (uint);

    function getBaseFeeLMADebt() external view returns (uint);

    function increaseBaseFeeLMADebt(uint _amount) external;

    function decreaseBaseFeeLMADebt(uint _amount) external;
}
