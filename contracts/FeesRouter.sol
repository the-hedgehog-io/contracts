//SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IBaseFeeLMAToken.sol";
import "./interfaces/IActivePool.sol";

error InvalidIndex();
error InvalidAddress();
error InvalidInput();
error CallerIsNotHDGProtocol();
error ConfigNotFound();

/**
 * HEDGEHOG UPDATES:
 * @notice Completely new contract in Hedgehog Protocol, that was never a part of Liquity Protocol
 *
 * Accepts fees and routes it to different places(or a single one) assigned by the account with "SETTER" rights
 * Contract overall is a config of addresses assigned for each 5% range from 0 to 100.
 */
contract FeesRouter is AccessControl {
    bytes32 internal constant SETTER = keccak256("SETTER");
    bytes32 internal constant ULTIMATE_ADMIN = keccak256("ULTIMATE_ADMIN");
    bytes32 internal constant DEPLOYER = keccak256("DEPLOYER");

    struct FeeConfig {
        uint256 amountA;
        uint256 amountB;
        uint256 amountC;
        address addressA;
        address addressB;
        address addressC;
    }

    mapping(uint256 => FeeConfig) public debtFeeConfigs;
    mapping(uint256 => FeeConfig) public collFeeConfigs;

    IBaseFeeLMAToken public baseFeeLMAToken;
    IActivePool public activePool;
    address public borrowersOp;
    address public troveManager;

    event DebtFeeConfigUpdated(
        address indexed setter,
        uint256 indexed percentage,
        uint256 amountA,
        uint256 amountB,
        uint256 amountC,
        address addressA,
        address addressB,
        address addressC
    );

    event CollFeeConfigUpdated(
        address indexed setter,
        uint256 indexed percentage,
        uint256 amountA,
        uint256 amountB,
        uint256 amountC,
        address addressA,
        address addressB,
        address addressC
    );

    // Checks if function caller address is either Borrowers Operations or Trove Manager set in the setAddresses function
    modifier onlyHDGProtocol() {
        if (msg.sender != borrowersOp) {
            if (msg.sender != troveManager) {
                revert CallerIsNotHDGProtocol();
            }
        }
        _;
    }

    constructor(address _defaultAdmin, address _ultimateAdmin) {
        if (address(_defaultAdmin) == address(0)) revert InvalidAddress();
        if (address(_ultimateAdmin) == address(0)) revert InvalidAddress();

        _grantRole(ULTIMATE_ADMIN, _ultimateAdmin);
        _setRoleAdmin(SETTER, ULTIMATE_ADMIN);
        _grantRole(SETTER, _defaultAdmin);
        _grantRole(DEPLOYER, msg.sender);
    }

    /**
     * An initialiser function where HDG protocol address are getting set
     */
    function setAddresses(
        IActivePool _activePool,
        IBaseFeeLMAToken _baseFeeLMAToken,
        address _borrowersOp,
        address _troveManager
    ) external onlyRole(DEPLOYER) {
        if (_borrowersOp == address(0)) revert InvalidAddress();
        if (_troveManager == address(0)) revert InvalidAddress();
        if (address(_activePool) == address(0)) revert InvalidAddress();
        if (address(_baseFeeLMAToken) == address(0)) revert InvalidAddress();

        activePool = _activePool;
        baseFeeLMAToken = _baseFeeLMAToken;
        borrowersOp = _borrowersOp;
        troveManager = _troveManager;

        _revokeRole(DEPLOYER, msg.sender);
    }

    /**
     * Sets both debt and coll fees configs. Should be used if routing logic is the same for both procesesses.
     * Only callable by an admin
     *
     * @param _percentage range at which new config is valid
     * @param _amountA amount of tokens that _addressA is going to receive in the event of tx fee appears in _percentage range. Must be > 0
     * @param _amountB amount of tokens that _addressB is going to receive in the event of tx fee appears in _percentage range. Set to 0 to skip
     * @param _amountC amount of tokens that _addressC is going to receive in the event of tx fee appears in _percentage range Set to 0 to skip
     * @param _addressA _addressA that receives tokens in the event of tx fee appears in _percentage range. Can't be an address(0)
     * @param _addressB _addressB that receives tokens in the event of tx fee appears in _percentage range. Set to address(0) to skip
     * @param _addressC _addressC that receives tokens in the event of tx fee appears in _percentage range. Set to address(0) to skip
     */
    function setFeeConfigs(
        uint256 _percentage,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _amountC,
        address _addressA,
        address _addressB,
        address _addressC
    ) external onlyRole(SETTER) {
        _checkConfigCorrectness(
            _percentage,
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );
        debtFeeConfigs[_percentage] = FeeConfig(
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );

        collFeeConfigs[_percentage] = FeeConfig(
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );

        emit DebtFeeConfigUpdated(
            msg.sender,
            _percentage,
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );

        emit CollFeeConfigUpdated(
            msg.sender,
            _percentage,
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );
    }

    /**
     * Sets debt fees configs. Should be used if routing logic is unique for BFE token fees.
     * Only callable by an admin
     *
     * @param _percentage range at which new config is valid
     * @param _amountA amount of tokens that _addressA is going to receive in the event of tx fee appears in _percentage range. Must be > 0
     * @param _amountB amount of tokens that _addressB is going to receive in the event of tx fee appears in _percentage range. Set to 0 to skip
     * @param _amountC amount of tokens that _addressC is going to receive in the event of tx fee appears in _percentage range Set to 0 to skip
     * @param _addressA _addressA that receives tokens in the event of tx fee appears in _percentage range. Can't be an address(0)
     * @param _addressB _addressB that receives tokens in the event of tx fee appears in _percentage range. Set to address(0) to skip
     * @param _addressC _addressC that receives tokens in the event of tx fee appears in _percentage range. Set to address(0) to skip
     */
    function setDebtFeeConfig(
        uint256 _percentage,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _amountC,
        address _addressA,
        address _addressB,
        address _addressC
    ) external onlyRole(SETTER) {
        _checkConfigCorrectness(
            _percentage,
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );
        debtFeeConfigs[_percentage] = FeeConfig(
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );

        emit DebtFeeConfigUpdated(
            msg.sender,
            _percentage,
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );
    }

    /**
     * Sets coll fees configs. Should be used if routing logic is unique for WStETH token fees.
     * Only callable by an admin
     *
     * @param _percentage range at which new config is valid
     * @param _amountA amount of tokens that _addressA is going to receive in the event of tx fee appears in _percentage range. Must be > 0
     * @param _amountB amount of tokens that _addressB is going to receive in the event of tx fee appears in _percentage range. Set to 0 to skip
     * @param _amountC amount of tokens that _addressC is going to receive in the event of tx fee appears in _percentage range Set to 0 to skip
     * @param _addressA _addressA that receives tokens in the event of tx fee appears in _percentage range. Can't be an address(0)
     * @param _addressB _addressB that receives tokens in the event of tx fee appears in _percentage range. Set to address(0) to skip
     * @param _addressC _addressC that receives tokens in the event of tx fee appears in _percentage range. Set to address(0) to skip
     */
    function setCollFeeConfig(
        uint256 _percentage,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _amountC,
        address _addressA,
        address _addressB,
        address _addressC
    ) external onlyRole(SETTER) {
        _checkConfigCorrectness(
            _percentage,
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );

        collFeeConfigs[_percentage] = FeeConfig(
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );

        emit CollFeeConfigUpdated(
            msg.sender,
            _percentage,
            _amountA,
            _amountB,
            _amountC,
            _addressA,
            _addressB,
            _addressC
        );
    }

    /**
     * @param _debt amount of BFE tokens that user receives in the event of succesful borrowing op
     * @param _fee amount of fee that user is getting cut with in the event of succseful borrowing op
     *
     * Distributes fees that are coming in BFEE according to the config set by an admin.
     * During the execution it is calculated the % that _fee is of _debt to find an appropriate config routing
     */
    function distributeDebtFee(
        uint256 _debt,
        uint256 _fee
    ) external onlyHDGProtocol {
        FeeConfig memory config = debtFeeConfigs[_getPctRange(_debt, _fee)];

        uint256 amountA = _calculateAmount(_fee, config.amountA);
        uint256 amountB = _calculateAmount(_fee, config.amountB);
        uint256 amountC = _calculateAmount(_fee, config.amountC);

        uint256 totalAmounts = amountA + amountB + amountC;
        if (totalAmounts != _fee) {
            amountA = amountA + _fee - totalAmounts;
        }

        if (
            config.addressA == address(0) &&
            config.addressB == address(0) &&
            config.addressC == address(0)
        ) revert ConfigNotFound();

        IBaseFeeLMAToken _baseFeeLMAToken = baseFeeLMAToken;
        if (amountA > 0 && config.addressA != address(0)) {
            _baseFeeLMAToken.mint(config.addressA, amountA);
        }
        if (amountB > 0 && config.addressB != address(0)) {
            _baseFeeLMAToken.mint(config.addressB, amountB);
        }
        if (amountC > 0 && config.addressC != address(0)) {
            _baseFeeLMAToken.mint(config.addressC, amountC);
        }
    }

    /**
     * @param _coll amount of BFE tokens that user receives in the event of succesful borrowing op
     * @param _fee amount of fee that user is getting cut with in the event of succseful borrowing op
     *
     * Distributes fees that are coming in WstETH according to the config set by an admin.
     * During the execution it is calculated the % that _fee is of _debt to find an appropriate config routing
     */
    function distributeCollFee(
        uint256 _coll,
        uint256 _fee
    ) external onlyHDGProtocol {
        FeeConfig memory config = collFeeConfigs[_getPctRange(_coll, _fee)];
        uint256 amountA = _calculateAmount(_fee, config.amountA);
        uint256 amountB = _calculateAmount(_fee, config.amountB);
        uint256 amountC = _calculateAmount(_fee, config.amountC);

        uint256 totalAmounts = amountA + amountB + amountC;
        if (totalAmounts != _fee) {
            amountA = amountA + _fee - totalAmounts;
        }

        if (
            config.addressA == address(0) &&
            config.addressB == address(0) &&
            config.addressC == address(0)
        ) revert ConfigNotFound();

        IActivePool _activePool = activePool;

        if (amountA > 0 && config.addressA != address(0)) {
            _activePool.sendWStETH(config.addressA, amountA);
        }
        if (amountB > 0 && config.addressB != address(0)) {
            _activePool.sendWStETH(config.addressB, amountB);
        }
        if (amountC > 0 && config.addressC != address(0)) {
            _activePool.sendWStETH(config.addressC, amountC);
        }
    }

    /**
     *  Finds range in config with rounding based on total tx value(can be BaseFeeLMA token or WstETH) and absolute fee amount
     *  In case the fee is less then 3% it's going to round to 5% anyway
     *
     * @param _debt total tx payment amount (BaseFee LMA Token or WstETH)
     * @param _fee total tx fee in an absolute number (BaseFee LMA Token or WstETH)
     */
    function _getPctRange(
        uint256 _debt,
        uint256 _fee
    ) internal pure returns (uint256) {
        if ((_fee * 100) / _debt < 3 && (_fee * 100) / _debt > 0) {
            return 5;
        } else {
            return
                (((_fee * 100) / _debt) /
                    5 +
                    ((((_fee * 100) / _debt) % 5)) /
                    3) * 5;
        }
    }

    // helper util that performs a simple calculation to find the _percentage of _fee
    function _calculateAmount(
        uint256 _fee,
        uint256 _percentage
    ) internal pure returns (uint256) {
        return ((_fee * _percentage) / 100);
    }

    /**
     * Checks if provided config is correct. In a single range config at least first receiver must get set. Second and third are optional.
     * @param _percentage range id. May only be divisible by 5
     * @param _amountA % of the fee that is going to get transferred to _addressA
     * @param _amountB % of the fee that is going to get transferred to _addressB
     * @param _amountC % of the fee that is going to get transferred to _addressC
     * @param _addressA address that's going to receive _amountA
     * @param _addressB address that's going to receive _amountB
     * @param _addressC address that's going to receive _amountC
     */
    function _checkConfigCorrectness(
        uint256 _percentage,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _amountC,
        address _addressA,
        address _addressB,
        address _addressC
    ) internal pure {
        if (_percentage % 5 != 0) revert InvalidIndex();
        if (_addressA == address(0)) revert InvalidAddress(); // At least A address should be initiated
        if (_amountA == 0) revert InvalidInput(); // At least A amount should be initiated
        if (_amountB > 0 && _addressB == address(0)) revert InvalidInput();
        if (_amountC > 0 && _addressC == address(0)) revert InvalidInput();
        if (_amountA + _amountB + _amountC != 100) revert InvalidInput();
    }
}
