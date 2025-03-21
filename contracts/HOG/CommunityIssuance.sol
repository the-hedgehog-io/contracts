// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IHOGToken.sol";
import "../interfaces/ICommunityIssuance.sol";
import "../dependencies/BaseMath.sol";
import "../dependencies/LiquityMath.sol";
import "../dependencies/CheckContract.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract CommunityIssuance is
    AccessControl,
    Ownable,
    CheckContract,
    BaseMath,
    ICommunityIssuance
{
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
    uint256 public proposedIssuanceFactor;
    uint256 public ISSUANCE_FACTOR = 999998681227695000;

    /*
     * HEDGEHOG UPDATES: Not a constant variable anymore.
     * May now be updated by a DISTRIBUTION_SETTER
     *
     * The community HOG supply cap is the starting balance of the Community Issuance contract.
     * It should be minted to this contract by HOGToken, when the token is deployed.
     */
    uint256 public proposedHOGSupplyCap;
    uint256 public HOGSupplyCap;

    event ProposedHOGSupplyCapUpdate(uint256 _oldCap, uint256 _newCap);
    event HOGSupplyCapUpdated(uint256 _newCap);
    event ProposedIssuanceFactorUpdate(uint256 _oldFactor, uint256 _newFactor);
    event IssuanceFactorUpdated(uint256 _newFactor);

    IHOGToken public hogToken;

    address public stabilityPoolAddress;

    uint public proposedTotalHOGIssued;
    uint public totalHOGIssued;
    uint public immutable deploymentTime;

    // --- Functions ---

    constructor() {
        deploymentTime = block.timestamp;
        proposedHOGSupplyCap = type(uint256).max;
        proposedIssuanceFactor = type(uint256).max;
        proposedTotalHOGIssued = type(uint256).max;
    }

    function setAddresses(
        address _hogTokenAddress,
        address _stabilityPoolAddress,
        address _setter,
        address _setterAdmin
    ) external onlyOwner {
        checkContract(_hogTokenAddress);
        checkContract(_stabilityPoolAddress);

        /* HEDGEHOG UPDATES: Setting two variables that used to be constant in constructor now.
         * May now be updated by a DISTRIBUTION_SETTER and DISTRIBUTION_SETTER address is admined by DISTRIBUTION_SETTER_ADMIN
         * At deployment both admin roles set to the deployer. May be updated later
         *
         * At the deployment moment hog supply cap is set to 0
         */
        _grantRole(DISTRIBUTION_SETTER, _setter);
        _setRoleAdmin(DISTRIBUTION_SETTER, DISTRIBUTION_SETTER_ADMIN);
        _grantRole(DISTRIBUTION_SETTER_ADMIN, _setterAdmin);

        hogToken = IHOGToken(_hogTokenAddress);
        stabilityPoolAddress = _stabilityPoolAddress;

        HOGSupplyCap = 0; // default supply cap value

        emit HOGTokenAddressSet(_hogTokenAddress);
        emit StabilityPoolAddressSet(_stabilityPoolAddress);

        renounceOwnership();
    }

    function issueHOG() external returns (uint) {
        _requireCallerIsStabilityPool();

        uint latestTotalHOGIssued = (HOGSupplyCap *
            _getCumulativeIssuanceFraction()) / DECIMAL_PRECISION;

        // Hedgehog Updates: Since now Issuance Factor is dynamic it is possible to block the whole system in case the factor reduction
        // Because of that we simply stop the issuance in such cases in case of letting it underflow
        uint issuance = latestTotalHOGIssued > totalHOGIssued
            ? latestTotalHOGIssued - totalHOGIssued
            : 0;

        totalHOGIssued = latestTotalHOGIssued;
        emit TotalHOGIssuedUpdated(latestTotalHOGIssued);

        return issuance;
    }

    /* Gets 1-f^t    where: f < 1

    f: issuance factor that determines the shape of the curve
    t:  time passed since last HOG issuance event  */
    function _getCumulativeIssuanceFraction() internal view returns (uint) {
        // Get the time passed since deployment
        uint timePassedInMinutes = (block.timestamp - deploymentTime) /
            SECONDS_IN_ONE_MINUTE;

        // f^t
        uint power = LiquityMath._decPow(ISSUANCE_FACTOR, timePassedInMinutes);

        //  (1 - f^t)
        uint cumulativeIssuanceFraction = (uint(DECIMAL_PRECISION) - power);
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
     * May now be updated by a DISTRIBUTION_SETTER, two step operation
     * */
    function proposeHOGSupplyCap(
        uint _newCap
    ) external onlyRole(DISTRIBUTION_SETTER) {
        proposedHOGSupplyCap = _newCap;
        emit ProposedHOGSupplyCapUpdate(HOGSupplyCap, _newCap);
    }

    function acceptNewHOGSupplyCap() external onlyRole(DISTRIBUTION_SETTER) {
        uint _newCap = proposedHOGSupplyCap;
        require(
            _newCap != type(uint256).max,
            "CommunityIssuance: incorrect proposed supply cap"
        );
        HOGSupplyCap = _newCap;
        proposedHOGSupplyCap = type(uint256).max;
        emit HOGSupplyCapUpdated(_newCap);
    }

    /*
     * HEDGEHOG UPDATES: ISSUANCE_FACTOR is not a constant variable anymore.
     * May now be updated by a DISTRIBUTION_SETTER, two step operation
     * */
    function proposeIssuanceFactor(
        uint _newIssuanceFactor
    ) external onlyRole(DISTRIBUTION_SETTER) {
        proposedIssuanceFactor = _newIssuanceFactor;
        emit ProposedIssuanceFactorUpdate(ISSUANCE_FACTOR, _newIssuanceFactor);
    }

    /*
     * HEDGEHOG UPDATES:
     * New function: second step operation that updates current ISSUANCE_FACTOR variable
     * */
    function acceptNewIssuanceFactor() external onlyRole(DISTRIBUTION_SETTER) {
        uint _newIssuanceFactor = proposedIssuanceFactor;
        require(
            _newIssuanceFactor != type(uint256).max,
            "CommunityIssuance: incorrect proposed issuance factor"
        );
        ISSUANCE_FACTOR = _newIssuanceFactor;
        proposedIssuanceFactor = type(uint256).max;
        emit IssuanceFactorUpdated(_newIssuanceFactor);
    }

    /*
     * HEDGEHOG UPDATES:
     * totalHOGIssued may now be updated by a DISTRIBUTION_SETTER, two step operation
     * */
    function proposeTotalHogIssued(
        uint _newHogIssued
    ) external onlyRole(DISTRIBUTION_SETTER) {
        proposedTotalHOGIssued = _newHogIssued;
        emit ProposedTotalHogIssuedManually(totalHOGIssued, _newHogIssued);
    }

    /*
     * HEDGEHOG UPDATES:
     * New function: second step operation that updates current totalHOGIssued variable
     * */
    function acceptNewTotalHogIssued() external onlyRole(DISTRIBUTION_SETTER) {
        uint _newHogIssued = proposedTotalHOGIssued;
        require(
            _newHogIssued != type(uint256).max,
            "CommunityIssuance: incorrect proposed new total hog issued"
        );
        totalHOGIssued = _newHogIssued;
        proposedTotalHOGIssued = type(uint256).max;
        emit TotalHogIssuedManuallyUpdated(_newHogIssued);
    }

    // --- 'require' functions ---

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "CommunityIssuance: caller is not SP"
        );
    }
}
