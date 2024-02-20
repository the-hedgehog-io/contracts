// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

// Common interface for the Pools.
interface IPool {
    // --- Events ---

    event WStETHBalanceUpdated(uint _newBalance);
    event BaseFeeLMABalanceUpdated(uint _newBalance);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event WStETHSent(address _to, uint _amount);

    // --- Functions ---

    function getWStETH() external view returns (uint);

    function getBaseFeeLMADebt() external view returns (uint);

    function increaseBaseFeeLMADebt(uint _amount) external;

    function decreaseBaseFeeLMADebt(uint _amount) external;

    // function increaseCollCountInPool(uint256 _amount) external;
}
