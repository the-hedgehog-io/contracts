// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IHOGToken.sol";
import "../interfaces/ICommunityIssuance.sol";
import "../dependencies/BaseMath.sol";
import "../dependencies/LiquityMath.sol";
import "../dependencies/CheckContract.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract CommunityIssuance is AccessControl, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // HEDGEHOG UPDATES: Add Access control to the contract for the setting of dynamic variables
    bytes32 internal constant DISTRIBUTION_SETTER =
        keccak256("DISTRIBUTION_SETTER");
    bytes32 internal constant DISTRIBUTION_SETTER_ADMIN =
        keccak256("DISTRIBUTION_SETTER_ADMIN");

    // --- Data ---
    string public constant NAME = "CommunityIssuance";

    uint public constant SECONDS_IN_ONE_MINUTE = 60;

    /*
     * HEDGEHOG UPDATES: Not a constant variable anymore.
     * May now be updated by a DISTRIBUTION_SETTER
     * The issuance factor F determines the curvature of the issuance curve.
     *
     * Minutes in one year: 60*24*365 = 525600
     *
     * For 50% of remaining tokens issued each year, with minutes as time units, we have:
     *
     * F ** 525600 = 0.5
     *
     * Re-arranging:
     *
     * 525600 * ln(F) = ln(0.5)
     * F = 0.5 ** (1/525600)
     * F = 0.999998681227695000
     */
    uint256 public ISSUANCE_FACTOR = 999998681227695000;

    /*
     * HEDGEHOG UPDATES: Not a constant variable anymore.
     * May now be updated by a DISTRIBUTION_SETTER
     * The community HOG supply cap is the starting balance of the Community Issuance contract.
     * It should be minted to this contract by HOGToken, when the token is deployed.
     *
     * Set to 32M (slightly less than 1/3) of total HOG supply.
     */
    uint256 public HOGSupplyCap; // 32 million

    event HOGSupplyCapUpdated(uint256 _newCap);
    event ISSUANCE_FACTORUpdated(uint256 _newFactor);

    IHOGToken public hogToken;

    address public stabilityPoolAddress;

    uint public totalHOGIssued;
    uint public immutable deploymentTime;

    // --- Events ---

    event HOGTokenAddressSet(address _hogTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalHOGIssuedUpdated(uint _totalHOGIssued);

    // --- Functions ---

    constructor() {
        deploymentTime = block.timestamp;
    }

    function setAddresses(
        address _hogTokenAddress,
        address _stabilityPoolAddress
    ) external onlyOwner {
        checkContract(_hogTokenAddress);
        checkContract(_stabilityPoolAddress);

        /* HEDGEHOG UPDATES: Setting two variables that used to be constant in constructor now.
         * May now be updated by a DISTRIBUTION_SETTER and DISTRIBUTION_SETTER address is admined by DISTRIBUTION_SETTER_ADMIN
         * At deployment both admin roles set to the deployer. May be updated later
         */
        _grantRole(DISTRIBUTION_SETTER, msg.sender);
        _setRoleAdmin(DISTRIBUTION_SETTER, DISTRIBUTION_SETTER_ADMIN);
        _grantRole(DISTRIBUTION_SETTER_ADMIN, msg.sender);

        hogToken = IHOGToken(_hogTokenAddress);
        stabilityPoolAddress = _stabilityPoolAddress;

        ISSUANCE_FACTOR = 999998681227695000; // default issuance factor value;
        HOGSupplyCap = 500 * 10e16; // default supply cap value

        // When HOGToken deployed, it should have transferred CommunityIssuance's HOG entitlement
        uint HOGBalance = hogToken.balanceOf(address(this));
        require(HOGBalance >= HOGSupplyCap, "CI: Ballance is not enough");

        emit HOGTokenAddressSet(_hogTokenAddress);
        emit StabilityPoolAddressSet(_stabilityPoolAddress);

        renounceOwnership();
    }

    function issueHOG() external returns (uint) {
        _requireCallerIsStabilityPool();

        uint latestTotalHOGIssued = HOGSupplyCap
            .mul(_getCumulativeIssuanceFraction())
            .div(DECIMAL_PRECISION);
        uint issuance = latestTotalHOGIssued.sub(totalHOGIssued);

        totalHOGIssued = latestTotalHOGIssued;
        emit TotalHOGIssuedUpdated(latestTotalHOGIssued);

        return issuance;
    }

    /* Gets 1-f^t    where: f < 1

    f: issuance factor that determines the shape of the curve
    t:  time passed since last HOG issuance event  */
    function _getCumulativeIssuanceFraction() internal view returns (uint) {
        // Get the time passed since deployment
        uint timePassedInMinutes = block.timestamp.sub(deploymentTime).div(
            SECONDS_IN_ONE_MINUTE
        );

        // f^t
        uint power = LiquityMath._decPow(ISSUANCE_FACTOR, timePassedInMinutes);

        //  (1 - f^t)
        uint cumulativeIssuanceFraction = (uint(DECIMAL_PRECISION).sub(power));
        assert(cumulativeIssuanceFraction <= DECIMAL_PRECISION); // must be in range [0,1]

        return cumulativeIssuanceFraction;
    }

    function sendHOG(address _account, uint _HOGamount) external {
        _requireCallerIsStabilityPool();

        hogToken.transfer(_account, _HOGamount);
    }

    // --- 'admin' function ---
    /*
     * HEDGEHOG UPDATES: HOGSupplyCap is not a constant variable anymore.
     * May now be updated by a DISTRIBUTION_SETTER
     * */
    function setHOGSupplyCap(
        uint _newCap
    ) external onlyRole(DISTRIBUTION_SETTER) {
        HOGSupplyCap = _newCap;
        emit HOGSupplyCapUpdated(_newCap);
    }

    /*
     * HEDGEHOG UPDATES: ISSUANCE_FACTOR is not a constant variable anymore.
     * May now be updated by a DISTRIBUTION_SETTER
     * */
    function setISSUANCE_FACTOR(
        uint _newIssFactor
    ) external onlyRole(DISTRIBUTION_SETTER) {
        ISSUANCE_FACTOR = _newIssFactor;
        emit ISSUANCE_FACTORUpdated(_newIssFactor);
    }

    // --- 'require' functions ---

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "CommunityIssuance: caller is not SP"
        );
    }
}
