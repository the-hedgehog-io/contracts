// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../dependencies/IERC2612.sol";

interface IHOGToken is IERC20, IERC2612 {
    // --- Events ---

    event CommunityIssuanceAddressSet(address _communityIssuanceAddress);
    event HOGStakingAddressSet(address _hogStakingAddress);
    event LockupContractFactoryAddressSet(
        address _lockupContractFactoryAddress
    );

    // --- Functions ---

    function sendToHOGStaking(address _sender, uint256 _amount) external;

    function getDeploymentStartTime() external view returns (uint256);

    function getLpRewardsEntitlement() external view returns (uint256);

    function increaseAllowance(
        address _spender,
        uint256 _addedValues
    ) external returns (bool);

    function decreaseAllowance(
        address _spender,
        uint256 _decreasedValue
    ) external returns (bool);
}
