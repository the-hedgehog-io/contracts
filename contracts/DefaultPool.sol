// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/IPool.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./interfaces/IActivePool.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Based on Liquity's Default Pool. Overall logic remains unchanged, but ERC20 token is used instsead of a native token
 * Changes to the contract:
 * - Raised pragma version
 * - Removed an import of Default Interface and updated with IPool
 *
 * Even though SafeMath is no longer required, the decision was made to keep it to avoid human factor errors
 *
 * The Default Pool holds the StETH and BaseFeeLMA debt (but not BaseFeeLMA tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending StETH and BaseFeeLMA debt, its pending StETH and BaseFeeLMA debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, IPool {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string public constant NAME = "DefaultPool";

    address public troveManagerAddress;
    address public activePoolAddress;
    uint256 internal StETH; // deposited StETH tracker
    uint256 internal BaseFeeLMADebt; // debt
    IERC20 public StETHToken;

    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolBaseFeeLMADebtUpdated(uint _BaseFeeLMADebt);
    event DefaultPoolStETHBalanceUpdated(uint _StETH);
    event StETHTokenAddressUpdated(IERC20 _StEthAddress);

    // --- Dependency setters ---

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral instead of native token.
     * Setting erc20 address in the initialisation
     */
    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        IERC20 _StETHTokenAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(address(_StETHTokenAddress));

        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;
        StETHToken = _StETHTokenAddress;

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit StETHTokenAddressUpdated(_StETHTokenAddress);

        renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Returns the StETH state variable.
     *
     * Not necessarily equal to the the contract's raw StETH balance - stETH can be forcibly sent to contracts.
     */
    function getStETH() external view returns (uint) {
        return StETH;
    }

    function getBaseFeeLMADebt() external view override returns (uint) {
        return BaseFeeLMADebt;
    }

    // --- Pool functionality ---

    /**
     * HEDGEHOG UPDATES: use SafeERC20 safe transfer instead of native token transfer
     */
    function sendStETHToActivePool(uint _amount) external {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        StETH = StETH.sub(_amount);
        emit DefaultPoolStETHBalanceUpdated(StETH);
        emit StETHSent(activePool, _amount);

        IActivePool(activePool).increaseBalance(_amount);
        StETHToken.safeTransfer(activePool, _amount);
    }

    function increaseBaseFeeLMADebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        BaseFeeLMADebt = BaseFeeLMADebt.add(_amount);
        emit DefaultPoolBaseFeeLMADebtUpdated(BaseFeeLMADebt);
    }

    function decreaseBaseFeeLMADebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        BaseFeeLMADebt = BaseFeeLMADebt.sub(_amount);
        emit DefaultPoolBaseFeeLMADebtUpdated(BaseFeeLMADebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "DefaultPool: Caller is not the ActivePool"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "DefaultPool: Caller is not the TroveManager"
        );
    }

    /**
     * Hedgehog Updates:
     * New function that can be called only by active pool instead of a native token fallback
     *  */
    function increaseBalance(uint256 _amount) external {
        _requireCallerIsTroveManager();
        StETH = StETH.add(_amount);
        emit DefaultPoolStETHBalanceUpdated(StETH);
    }
}
