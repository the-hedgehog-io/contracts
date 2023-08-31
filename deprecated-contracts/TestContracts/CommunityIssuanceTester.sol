// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../HOG/CommunityIssuance.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract CommunityIssuanceTester is CommunityIssuance {
    using SafeMath for uint256;

    function obtainHOG(uint _amount) external {
        hogToken.transfer(msg.sender, _amount);
    }

    function getCumulativeIssuanceFraction() external view returns (uint) {
        return _getCumulativeIssuanceFraction();
    }

    function unprotectedIssueHOG() external returns (uint) {
        // No checks on caller address

        uint latestTotalhogIssued = HOGSupplyCap
            .mul(_getCumulativeIssuanceFraction())
            .div(DECIMAL_PRECISION);
        uint issuance = latestTotalhogIssued.sub(totalHOGIssued);

        totalHOGIssued = latestTotalhogIssued;
        return issuance;
    }
}
