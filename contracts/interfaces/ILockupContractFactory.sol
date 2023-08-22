// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

interface ILockupContractFactory {
    // --- Events ---

    event HOGTokenAddressSet(address _hogTokenAddress);
    event LockupContractDeployedThroughFactory(
        address _lockupContractAddress,
        address _beneficiary,
        uint _unlockTime,
        address _deployer
    );

    // --- Functions ---

    function setHOGTokenAddress(address _hogTokenAddress) external;

    function deployLockupContract(
        address _beneficiary,
        uint _unlockTime
    ) external;

    function isRegisteredLockup(address _addr) external view returns (bool);
}
