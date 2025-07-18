// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";

import "./interfaces/IPool.sol";

/**
 * @notice Fork of Liquity's Active Pool. Most of the logic remains unchanged.
 * Changes to the contract:
 * - Raised pragma version
 * - SafeMath is removed & native math operators are used from this point
 * - Removed an import of ActivePool Interface
 * - Updated variable names and docs to refer to BaseFeeLMA token and WStETH as a collateral
 * - Collateral is now an ERC20 token instead of a native one
 *
 * The Active Pool holds the WStETH collateral and BaseFeeLMA debt (but not BaseFeeLMA tokens) for all active troves.
 *
 * When a trove is liquidated, it's WStETH and BaseFeeLMA debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is Ownable, CheckContract, IPool {
    using SafeERC20 for IERC20;

    string public constant NAME = "ActivePool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public stabilityPoolAddress;
    address public defaultPoolAddress;
    address public feesRouter;
    IERC20 public WStETHToken;
    uint256 internal WStETH; // deposited WStETH tracker
    uint256 internal BaseFeeLMADebt;

    // --- Events ---

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolBaseFeeLMADebtUpdated(uint _BaseFeeLMADebt);
    event ActivePoolWStETHBalanceUpdated(uint _WStETH);
    event WStETHTokenAddressUpdated(IERC20 _WStETHAddress);
    event FeesRouterAddressUpdated(address _feesRouter);

    // --- Contract setters ---

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral instead of native token.
     * Setting erc20 address in the initialisation
     */
    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _defaultPoolAddress,
        IERC20 _WStETHTokenAddress,
        address _feesRouter
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(address(_WStETHTokenAddress));
        checkContract(_feesRouter);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;
        WStETHToken = _WStETHTokenAddress;
        feesRouter = _feesRouter;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit WStETHTokenAddressUpdated(_WStETHTokenAddress);
        emit FeesRouterAddressUpdated(_feesRouter);

        renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Hedgehog Updates:
     * In case WStETH is 0 return 1 to avoid division by zero in base rate calculations
     * Returns the WStETH state variable.
     *
     * Not necessarily equal to the the contract's raw WStETH balance - WStETH can be forcibly sent to contracts.
     */
    function getWStETH() external view override returns (uint) {
        return WStETH > 0 ? WStETH : 1;
    }

    function getBaseFeeLMADebt() external view override returns (uint) {
        return BaseFeeLMADebt;
    }

    // --- Pool functionality ---

    /**
     * HEDGEHOG UPDATES: use SafeERC20 safe transfer instead of native token transfer
     *      Now also fees router may call sendWStETH function
     */
    function sendWStETH(address _account, uint _amount) external {
        _requireCallerIsBOorTroveMorSPorFRoute();
        WStETH = WStETH - _amount;
        emit ActivePoolWStETHBalanceUpdated(WStETH);
        emit WStETHSent(_account, _amount);
        WStETHToken.safeTransfer(_account, _amount);
    }

    function increaseBaseFeeLMADebt(uint _amount) external override {
        _requireCallerIsBOorTroveM();
        BaseFeeLMADebt = BaseFeeLMADebt + _amount;
        emit ActivePoolBaseFeeLMADebtUpdated(BaseFeeLMADebt);
    }

    function decreaseBaseFeeLMADebt(uint _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        BaseFeeLMADebt = BaseFeeLMADebt - _amount;
        emit ActivePoolBaseFeeLMADebtUpdated(BaseFeeLMADebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == defaultPoolAddress,
            "ActivePool: Caller is neither BO nor Default Pool"
        );
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
        );
    }

    // Hedgehog Updates: new access controll check, allowing FRouter to retrieve collateral
    function _requireCallerIsBOorTroveMorSPorFRoute() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress ||
                msg.sender == feesRouter,
            "ActivePool: Caller is neither BO nor TM nor FRouter"
        );
    }

    function _requireCallerIsBOorTroveM() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager"
        );
    }

    /**
     * Hedgehog Updates:
     * Using increaseBalance function to increase activePool balance instead of fallback function
     */
    function increaseBalance(uint256 _amount) external {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        WStETH = WStETH + _amount;
        emit ActivePoolWStETHBalanceUpdated(WStETH);
    }

    // --- Fallback function ---

    /**
     * Hedgehog Updates:
     * Remove native token fallback function
     */
}
