// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dependencies/CheckContract.sol";
import "../interfaces/IHOGStaking.sol";

contract HOGStakingScript is CheckContract {
    IHOGStaking immutable HOGStaking;

    constructor(address _hogStakingAddress) {
        checkContract(_hogStakingAddress);
        HOGStaking = IHOGStaking(_hogStakingAddress);
    }

    function stake(uint _HOGamount) external {
        HOGStaking.stake(_HOGamount);
    }
}
