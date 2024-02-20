// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../ActivePool.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract ActivePoolTester is ActivePool {
    using SafeMath for uint256;

    function unprotectedIncreaseBaseFeeLMADebt(uint _amount) external {
        BaseFeeLMADebt = BaseFeeLMADebt.add(_amount);
    }

    function unprotectedPayable() external payable {
        WStETH = WStETH.add(msg.value);
    }
}
