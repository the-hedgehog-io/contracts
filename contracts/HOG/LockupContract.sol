// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IHOGToken.sol";

/*
* The lockup contract architecture utilizes a single LockupContract, with an unlockTime. The unlockTime is passed as an argument 
* to the LockupContract's constructor. The contract's balance can be withdrawn by the beneficiary when block.timestamp > unlockTime. 
* At construction, the contract checks that unlockTime is at least one year later than the Hedgehog system's deployment time. 

* Within the first year from deployment, the deployer of the HOGToken (Hedgehog AG's address) may transfer HOG only to valid 
* LockupContracts, and no other addresses (this is enforced in HOGToken.sol's transfer() function).
* 
* The above two restrictions ensure that until one year after system deployment, HOG tokens originating from Hedgehog AG cannot 
* enter circulating supply and cannot be staked to earn system revenue.
*/

/**
    @notice Not used in Hedgehog Protocol
*/
contract LockupContract {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "LockupContract";

    uint public constant SECONDS_IN_ONE_YEAR = 31536000;

    address public immutable beneficiary;

    IHOGToken public hogToken;

    // Unlock time is the Unix point in time at which the beneficiary can withdraw.
    uint public unlockTime;

    // --- Events ---

    event LockupContractCreated(address _beneficiary, uint _unlockTime);
    event LockupContractEmptied(uint _HOGwithdrawal);

    // --- Functions ---

    constructor(
        address _hogTokenAddress,
        address _beneficiary,
        uint _unlockTime
    ) public {
        hogToken = IHOGToken(_hogTokenAddress);

        /*
         * Set the unlock time to a chosen instant in the future, as long as it is at least 1 year after
         * the system was deployed
         */
        _requireUnlockTimeIsAtLeastOneYearAfterSystemDeployment(_unlockTime);
        unlockTime = _unlockTime;

        beneficiary = _beneficiary;
        emit LockupContractCreated(_beneficiary, _unlockTime);
    }

    function withdrawHOG() external {
        _requireCallerIsBeneficiary();
        _requireLockupDurationHasPassed();

        IHOGToken hogTokenCached = hogToken;
        uint HOGBalance = hogTokenCached.balanceOf(address(this));
        hogTokenCached.transfer(beneficiary, HOGBalance);
        emit LockupContractEmptied(HOGBalance);
    }

    // --- 'require' functions ---

    function _requireCallerIsBeneficiary() internal view {
        require(
            msg.sender == beneficiary,
            "LockupContract: caller is not the beneficiary"
        );
    }

    function _requireLockupDurationHasPassed() internal view {
        require(
            block.timestamp >= unlockTime,
            "LockupContract: The lockup duration must have passed"
        );
    }

    function _requireUnlockTimeIsAtLeastOneYearAfterSystemDeployment(
        uint _unlockTime
    ) internal view {
        uint systemDeploymentTime = hogToken.getDeploymentStartTime();
        require(
            _unlockTime >= systemDeploymentTime.add(SECONDS_IN_ONE_YEAR),
            "LockupContract: unlock time must be at least one year after system deployment"
        );
    }
}
