// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../../PriceFeed.sol";

contract TestPriceFeed is PriceFeed {

    constructor(uint _TIMEOUT) PriceFeed(_TIMEOUT) {
    }

    function setLastGoodPrice(uint _lastGoodPrice) external {
        lastGoodPrice = _lastGoodPrice;
    }

    function setStatus(Status _status) external {
        status = _status;
    }
}
