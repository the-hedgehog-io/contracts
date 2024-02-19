// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dependencies/CheckContract.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ILockupContractFactory.sol";
import "./LockupContract.sol";

/*
 * The LockupContractFactory deploys LockupContracts - its main purpose is to keep a registry of valid deployed
 * LockupContracts.
 *
 * This registry is checked by HOGToken when the Hedgehog deployer attempts to transfer HOG tokens. During the first year
 * since system deployment, the Hedgehog deployer is only allowed to transfer HOG to valid LockupContracts that have been
 * deployed by and recorded in the LockupContractFactory. This ensures the deployer's HOG can't be traded or staked in the
 * first year, and can only be sent to a verified LockupContract which unlocks at least one year after system deployment.
 *
 * LockupContracts can of course be deployed directly, but only those deployed through and recorded in the LockupContractFactory
 * will be considered "valid" by HOGToken. This is a convenient way to verify that the target address is a genuine
 * LockupContract.
 */

/**
    @notice Not used in Hedgehog Protocol
*/
contract LockupContractFactory is Ownable, CheckContract {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "LockupContractFactory";

    uint public constant SECONDS_IN_ONE_YEAR = 31536000;

    address public hogTokenAddress;

    mapping(address => address) public lockupContractToDeployer;

    // --- Events ---

    event HOGTokenAddressSet(address _hogTokenAddress);
    event LockupContractDeployedThroughFactory(
        address _lockupContractAddress,
        address _beneficiary,
        uint _unlockTime,
        address _deployer
    );

    // --- Functions ---

    function setHOGTokenAddress(address _hogTokenAddress) external onlyOwner {
        checkContract(_hogTokenAddress);

        hogTokenAddress = _hogTokenAddress;
        emit HOGTokenAddressSet(_hogTokenAddress);

        renounceOwnership();
    }

    function deployLockupContract(
        address _beneficiary,
        uint _unlockTime
    ) external {
        address hogTokenAddressCached = hogTokenAddress;
        _requireHOGAddressIsSet(hogTokenAddressCached);
        LockupContract lockupContract = new LockupContract(
            hogTokenAddressCached,
            _beneficiary,
            _unlockTime
        );

        lockupContractToDeployer[address(lockupContract)] = msg.sender;
        emit LockupContractDeployedThroughFactory(
            address(lockupContract),
            _beneficiary,
            _unlockTime,
            msg.sender
        );
    }

    function isRegisteredLockup(
        address _contractAddress
    ) public view returns (bool) {
        return lockupContractToDeployer[_contractAddress] != address(0);
    }

    // --- 'require'  functions ---
    function _requireHOGAddressIsSet(address _hogTokenAddress) internal pure {
        require(_hogTokenAddress != address(0), "LCF: HOG Address is not set");
    }
}
