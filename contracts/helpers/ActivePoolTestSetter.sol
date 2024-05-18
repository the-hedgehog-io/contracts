// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IIActivePool {
    function increaseBalance(uint256 _amount) external;
}

contract ActivePoolTestSetter {
    IIActivePool public activePool;

    constructor(IIActivePool _activePool) {
        activePool = _activePool;
    }

    function increasePayTokenBalance(uint256 _amount) public {
        activePool.increaseBalance(_amount);
    }
}
