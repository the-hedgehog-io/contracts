// SPDX-License-Identifier: MIT

pragma solidity >=0.8.19;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TERC20 is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply
    ) ERC20(name, symbol) {
        _mint(msg.sender, supply * 10 ** 18);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function mint(address _account, uint256 _amount) external {
        _mint(_account, _amount);
    }
}
