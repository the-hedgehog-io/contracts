// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../StabilityPool.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract StabilityPoolTester is StabilityPool {
    using SafeMath for uint256;

    function unprotectedPayable() external payable {
        WStETH = WStETH.add(msg.value);
    }

    function setCurrentScale(uint128 _currentScale) external {
        currentScale = _currentScale;
    }

    function setTotalDeposits(uint _totalBaseFeeLMADeposits) external {
        totalBaseFeeLMADeposits = _totalBaseFeeLMADeposits;
    }
}
