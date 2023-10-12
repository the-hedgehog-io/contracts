//SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IBaseFeeLMAToken.sol";
import "./interfaces/IActivePool.sol";
import "./interfaces/IHOGStaking.sol";
import "hardhat/console.sol";

error InvalidIndex();
error InvalidAddress();
error InvalidLength();
error TooManyConfigValues();

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
