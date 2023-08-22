// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../HOG/HOGToken.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract HOGTokenTester is HOGToken {
    constructor(
        address _communityIssuanceAddress,
        address _hogStakingAddress,
        address _lockupFactoryAddress,
        address _bountyAddress,
        address _lpRewardsAddress,
        address _multisigAddress
    )
        HOGToken(
            _communityIssuanceAddress,
            _hogStakingAddress,
            _lockupFactoryAddress,
            _bountyAddress,
            _lpRewardsAddress,
            _multisigAddress
        )
    {}

    function unprotectedMint(address account, uint256 amount) external {
        // No check for the caller here

        _mint(account, amount);
    }

    function unprotectedSendTohogStaking(
        address _sender,
        uint256 _amount
    ) external {
        // No check for the caller here

        if (_isFirstYear()) {
            _requireSenderIsNotMultisig(_sender);
        }
        _transfer(_sender, hogStakingAddress, _amount);
    }

    function callInternalApprove(
        address owner,
        address spender,
        uint256 amount
    ) external returns (bool) {
        _approve(owner, spender, amount);
    }

    function callInternalTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        _transfer(sender, recipient, amount);
    }

    function getChainId() external view returns (uint256 chainID) {
        //return _chainID(); // it’s private
        assembly {
            chainID := chainid()
        }
    }
}
