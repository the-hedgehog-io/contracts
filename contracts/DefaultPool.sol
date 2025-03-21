// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/IPool.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./interfaces/IActivePool.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Based on Liquity's Default Pool. Overall logic remains unchanged, but ERC20 token is used instsead of a native token
 * Changes to the contract:
 * - Raised pragma version
 * - SafeMath is removed & native math operators are used from this point
 * - Removed an import of Default Interface and updated with IPool
 * - Removed _requireCallerIsActivePool modifier as it is not used anymore
 *
 * The Default Pool holds the WStETH and BaseFeeLMA debt (but not BaseFeeLMA tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending WStETH and BaseFeeLMA debt, its pending WStETH and BaseFeeLMA debt is moved
 * from the Default Pool to the Active Pool.
 *
 */
contract DefaultPool is Ownable, CheckContract, IPool {
    using SafeERC20 for IERC20;

    string public constant NAME = "DefaultPool";

    address public troveManagerAddress;
    address public activePoolAddress;
    uint256 internal WStETH; // deposited WStETH tracker
    uint256 internal BaseFeeLMADebt; // debt
    IERC20 public WStETHToken;

    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolBaseFeeLMADebtUpdated(uint _BaseFeeLMADebt);
    event DefaultPoolWStETHBalanceUpdated(uint _WStETH);
    event WStETHTokenAddressUpdated(IERC20 _WStEthAddress);

    // --- Dependency setters ---

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral instead of native token.
     * Setting erc20 address in the initialization
     */
    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        IERC20 _WStETHTokenAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(address(_WStETHTokenAddress));

        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;
        WStETHToken = _WStETHTokenAddress;

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit WStETHTokenAddressUpdated(_WStETHTokenAddress);

        renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Returns the WStETH state variable.
     *
     * Not necessarily equal to the the contract's raw WStETH balance - wStETH can be forcibly sent to contracts.
     */
    function getWStETH() external view returns (uint) {
        return WStETH;
    }

    function getBaseFeeLMADebt() external view override returns (uint) {
        return BaseFeeLMADebt;
    }

    // --- Pool functionality ---

    /**
     * HEDGEHOG UPDATES: use SafeERC20 safe transfer instead of native token transfer
     */
    function sendWStETHToActivePool(uint _amount) external {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        WStETH = WStETH - _amount;
        emit DefaultPoolWStETHBalanceUpdated(WStETH);
        emit WStETHSent(activePool, _amount);

        IActivePool(activePool).increaseBalance(_amount);
        WStETHToken.safeTransfer(activePool, _amount);
    }

    function increaseBaseFeeLMADebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        BaseFeeLMADebt = BaseFeeLMADebt + _amount;
        emit DefaultPoolBaseFeeLMADebtUpdated(BaseFeeLMADebt);
    }

    function decreaseBaseFeeLMADebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        BaseFeeLMADebt = BaseFeeLMADebt - _amount;
        emit DefaultPoolBaseFeeLMADebtUpdated(BaseFeeLMADebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "DefaultPool: Caller is not the TroveManager"
        );
    }

    /**
     * Hedgehog Updates:
     * New function that can be called only by trove manager instead of a native token fallback
     */
    function increaseBalance(uint256 _amount) external {
        _requireCallerIsTroveManager();
        WStETH = WStETH + _amount;
        emit DefaultPoolWStETHBalanceUpdated(WStETH);
    }
}
