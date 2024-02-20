// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../DefaultPool.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract DefaultPoolTester is DefaultPool {
    using SafeMath for uint256;

    function unprotectedIncreaseBaseFeeLMADebt(uint _amount) external {
        BaseFeeLMADebt = BaseFeeLMADebt.add(_amount);
    }

    function unprotectedPayable() external payable {
        WStETH = WStETH.add(msg.value);
    }
}
