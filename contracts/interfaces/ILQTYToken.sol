// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

interface ILQTYToken is IERC20, ERC20Permit {
    // --- Events ---

    event CommunityIssuanceAddressSet(address _communityIssuanceAddress);
    event LQTYStakingAddressSet(address _lqtyStakingAddress);
    event LockupContractFactoryAddressSet(
        address _lockupContractFactoryAddress
    );

    // --- Functions ---

    function sendToLQTYStaking(address _sender, uint256 _amount) external;

    function getDeploymentStartTime() external view returns (uint256);

    function getLpRewardsEntitlement() external view returns (uint256);
}
