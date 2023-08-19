// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dependencies/CheckContract.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ILockupContractFactory.sol";
import "./LockupContract.sol";
import "../dependencies/console.sol";

/*
 * The LockupContractFactory deploys LockupContracts - its main purpose is to keep a registry of valid deployed
 * LockupContracts.
 *
 * This registry is checked by LQTYToken when the Liquity deployer attempts to transfer LQTY tokens. During the first year
 * since system deployment, the Liquity deployer is only allowed to transfer LQTY to valid LockupContracts that have been
 * deployed by and recorded in the LockupContractFactory. This ensures the deployer's LQTY can't be traded or staked in the
 * first year, and can only be sent to a verified LockupContract which unlocks at least one year after system deployment.
 *
 * LockupContracts can of course be deployed directly, but only those deployed through and recorded in the LockupContractFactory
 * will be considered "valid" by LQTYToken. This is a convenient way to verify that the target address is a genuine
 * LockupContract.
 */

contract LockupContractFactory is Ownable, CheckContract {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "LockupContractFactory";

    uint public constant SECONDS_IN_ONE_YEAR = 31536000;

    address public lqtyTokenAddress;

    mapping(address => address) public lockupContractToDeployer;

    // --- Events ---

    event LQTYTokenAddressSet(address _lqtyTokenAddress);
    event LockupContractDeployedThroughFactory(
        address _lockupContractAddress,
        address _beneficiary,
        uint _unlockTime,
        address _deployer
    );

    // --- Functions ---

    function setLQTYTokenAddress(address _lqtyTokenAddress) external onlyOwner {
        checkContract(_lqtyTokenAddress);

        lqtyTokenAddress = _lqtyTokenAddress;
        emit LQTYTokenAddressSet(_lqtyTokenAddress);

        renounceOwnership();
    }

    function deployLockupContract(
        address _beneficiary,
        uint _unlockTime
    ) external {
        address lqtyTokenAddressCached = lqtyTokenAddress;
        _requireLQTYAddressIsSet(lqtyTokenAddressCached);
        LockupContract lockupContract = new LockupContract(
            lqtyTokenAddressCached,
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
    function _requireLQTYAddressIsSet(address _lqtyTokenAddress) internal pure {
        require(
            _lqtyTokenAddress != address(0),
            "LCF: LQTY Address is not set"
        );
    }
}
