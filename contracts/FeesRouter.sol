//SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IBaseFeeLMAToken.sol";
import "./interfaces/IActivePool.sol";
import "./interfaces/IHOGStaking.sol";

error InvalidIndex();
error InvalidAddress();
error InvalidLength();
error InvalidInput();
error TooManyConfigValues();

/**
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

    uint256 public feeCount;
    IBaseFeeLMAToken baseFeeLMAToken;
    IActivePool activePool;
    IHOGStaking hogStaking;

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

    constructor(address _defaultAdmin, address _ultimateAdmin) {
        if (address(_defaultAdmin) == address(0)) revert InvalidAddress();
        if (address(_ultimateAdmin) == address(0)) revert InvalidAddress();

        _grantRole(ULTIMATE_ADMIN, _ultimateAdmin);
        _setRoleAdmin(SETTER, ULTIMATE_ADMIN);
        _grantRole(SETTER, _defaultAdmin);
        _grantRole(DEPLOYER, msg.sender);
    }

    function setAddresses(
        IActivePool _activePool,
        IBaseFeeLMAToken _baseFeeLMAToken,
        IHOGStaking _hogStaking
    ) external onlyRole(DEPLOYER) {
        if (address(_activePool) == address(0)) revert InvalidAddress();
        if (address(_baseFeeLMAToken) == address(0)) revert InvalidAddress();
        if (address(_hogStaking) == address(0)) revert InvalidAddress();

        activePool = _activePool;
        baseFeeLMAToken = _baseFeeLMAToken;
        hogStaking = _hogStaking;

        _revokeRole(DEPLOYER, msg.sender);
    }

    /**
     * Sets both debt and coll fees configs. Should be used if routing logic is the same for both procesesses.
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
        if (_percentage % 5 != 0) revert InvalidIndex();
        if (_addressA == address(0)) revert InvalidAddress(); // At least A address should be initiated
        if (_amountA == 0) revert InvalidInput(); // At least A amount should be initiated

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
        if (_percentage % 5 != 0) revert InvalidIndex();
        if (_addressA == address(0)) revert InvalidAddress(); // At least A address should be initiated
        if (_amountA == 0) revert InvalidInput(); // At least A amount should be initiated

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
        if (_percentage % 5 != 0) revert InvalidIndex();
        if (_addressA == address(0)) revert InvalidAddress(); // At least A address should be initiated
        if (_amountA == 0) revert InvalidInput(); // At least A amount should be initiated

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

    // TODO: Only protocol's contract should be able to call
    /**
     * @param _debt amount of BFE tokens that user receives in the event of succesful borrowing op
     * @param _fee amount of fee that user is getting cut with in the event of succseful borrowing op
     */
    function distributeDebtFee(uint256 _debt, uint256 _fee) external {
        FeeConfig memory config = debtFeeConfigs[
            (((_fee * 100) / _debt) % 5) * 5
        ];
        uint256 amountA = _calculateAmount(_fee, config.amountA);
        uint256 amountB = _calculateAmount(_fee, config.amountB);
        uint256 amountC = _calculateAmount(_fee, config.amountC);

        uint256 totalAmounts = amountA + amountB + amountC;
        if (totalAmounts > _fee) {
            // Usually, that means that DAO treasure gets the extra dust
            amountA = amountA + totalAmounts - _fee;
        }

        IBaseFeeLMAToken _baseFeeLMAToken = baseFeeLMAToken;
        IHOGStaking _hogStaking = hogStaking;
        if (amountA > 0 && config.addressA != address(0)) {
            _baseFeeLMAToken.mint(config.addressA, amountA);

            _possiblyIncreaseHogStakingDebtBalance(
                config.addressA,
                amountA,
                _hogStaking
            );
        }
        if (amountB > 0 && config.addressB != address(0)) {
            _baseFeeLMAToken.mint(config.addressB, amountB);

            _possiblyIncreaseHogStakingDebtBalance(
                config.addressB,
                amountB,
                _hogStaking
            );
        }
        if (amountC > 0 && config.addressC != address(0)) {
            _baseFeeLMAToken.mint(config.addressB, amountC);

            _possiblyIncreaseHogStakingDebtBalance(
                config.addressC,
                amountC,
                _hogStaking
            );
        }
    }

    // TODO: Only protocol's contract should be able to call
    /**
     * @param _debt amount of BFE tokens that user receives in the event of succesful borrowing op
     * @param _fee amount of fee that user is getting cut with in the event of succseful borrowing op
     */
    function distributeCollFee(uint256 _debt, uint256 _fee) external {
        FeeConfig memory config = collFeeConfigs[
            (((_fee * 100) / _debt) % 5) * 5
        ];
        uint256 amountA = _calculateAmount(_fee, config.amountA);
        uint256 amountB = _calculateAmount(_fee, config.amountB);
        uint256 amountC = _calculateAmount(_fee, config.amountC);

        uint256 totalAmounts = amountA + amountB + amountC;
        if (totalAmounts > _fee) {
            // Usually, that means that DAO treasure gets the extra dust
            amountA = amountA + totalAmounts - _fee;
        }

        IActivePool _activePool = activePool;
        IHOGStaking _hogStaking = hogStaking;

        if (amountA > 0 && config.addressA != address(0)) {
            _activePool.sendStETH(config.addressA, amountA);

            _possiblyIncreaseHogStakingCollBalance(
                config.addressA,
                amountA,
                _hogStaking
            );
        }
        if (amountB > 0 && config.addressB != address(0)) {
            _activePool.sendStETH(config.addressB, amountB);

            _possiblyIncreaseHogStakingCollBalance(
                config.addressA,
                amountA,
                _hogStaking
            );
        }
        if (amountC > 0 && config.addressC != address(0)) {
            _activePool.sendStETH(config.addressC, amountC);

            _possiblyIncreaseHogStakingCollBalance(
                config.addressA,
                amountA,
                _hogStaking
            );
        }
    }

    function _calculateAmount(
        uint256 _fee,
        uint256 _percentage
    ) internal pure returns (uint256) {
        return ((_fee * _percentage) / 100);
    }

    function _possiblyIncreaseHogStakingCollBalance(
        address _receiver,
        uint256 _amount,
        IHOGStaking _hogStaking
    ) internal {
        if (_receiver == address(_hogStaking)) {
            _hogStaking.increaseF_StETH(_amount);
        }
    }

    function _possiblyIncreaseHogStakingDebtBalance(
        address _receiver,
        uint256 _amount,
        IHOGStaking _hogStaking
    ) internal {
        if (_receiver == address(_hogStaking)) {
            hogStaking.increaseF_BaseFeeLMA(_amount);
        }
    }
}
