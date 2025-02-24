// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../BaseFeeLMAToken.sol";

contract BaseFeeLMATokenTester is BaseFeeLMAToken {
    constructor(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _feesRouter
    ) BaseFeeLMAToken(
        _troveManagerAddress,
        _stabilityPoolAddress,
        _borrowerOperationsAddress,
        _feesRouter
    ) {
        _mint(msg.sender, 100000000000000000 * (10 ** 18));
    }
}
