// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dependencies/CheckContract.sol";
import "../interfaces/IStabilityPool.sol";

contract StabilityPoolScript is CheckContract {
    string public constant NAME = "StabilityPoolScript";

    IStabilityPool immutable stabilityPool;

    constructor(IStabilityPool _stabilityPool) {
        checkContract(address(_stabilityPool));
        stabilityPool = _stabilityPool;
    }

    function provideToSP(uint _amount, address _frontEndTag) external {
        stabilityPool.provideToSP(_amount, _frontEndTag);
    }

    function withdrawFromSP(uint _amount) external {
        stabilityPool.withdrawFromSP(_amount);
    }

    function withdrawStETHGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external {
        stabilityPool.withdrawStETHGainToTrove(_upperHint, _lowerHint);
    }
}
