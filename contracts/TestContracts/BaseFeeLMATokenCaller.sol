// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IBaseFeeLMAToken.sol";

contract BaseFeeLMATokenCaller {
    IBaseFeeLMAToken BaseFeeLMA;

    function setBaseFeeLMA(IBaseFeeLMAToken _BaseFeeLMA) external {
        BaseFeeLMA = _BaseFeeLMA;
    }

    function BaseFeeLMAMint(address _account, uint _amount) external {
        BaseFeeLMA.mint(_account, _amount);
    }

    function BaseFeeLMABurn(address _account, uint _amount) external {
        BaseFeeLMA.burn(_account, _amount);
    }

    function BaseFeeLMASendToPool(
        address _sender,
        address _poolAddress,
        uint256 _amount
    ) external {
        BaseFeeLMA.sendToPool(_sender, _poolAddress, _amount);
    }

    function BaseFeeLMAReturnFromPool(
        address _poolAddress,
        address _receiver,
        uint256 _amount
    ) external {
        BaseFeeLMA.returnFromPool(_poolAddress, _receiver, _amount);
    }
}
