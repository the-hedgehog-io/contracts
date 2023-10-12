// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

interface IFeesRouter {
    function distributeDebtFee(uint256 _debt, uint256 _fee) external;

    function distributeCollFee(uint256 _debt, uint256 _fee) external;
}
