// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../PriceFeed.sol";

contract TestPriceFeed is PriceFeed {

    constructor() PriceFeed(39) {
    }

    function setLastGoodPrice(uint _lastGoodPrice) external {
        lastGoodPrice = _lastGoodPrice;
    }

    function setStatus(Status _status) external {
        status = _status;
    }
}
