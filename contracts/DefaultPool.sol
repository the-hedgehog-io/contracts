// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/IPool.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/console.sol";

/**
 * @notice Fork of Liquity's Default Pool. Logic remains unchanged.
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

    string public constant NAME = "DefaultPool";

    address public troveManagerAddress;
    address public activePoolAddress;
    uint256 internal StETH; // deposited StETH tracker
    uint256 internal BaseFeeLMADebt; // debt

    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolBaseFeeLMADebtUpdated(uint _BaseFeeLMADebt);
    event DefaultPoolStETHBalanceUpdated(uint _StETH);

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

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

    function sendStETHToActivePool(uint _amount) external {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        StETH = StETH.sub(_amount);
        emit DefaultPoolStETHBalanceUpdated(StETH);
        emit StETHSent(activePool, _amount);

        (bool success, ) = activePool.call{value: _amount}("");
        require(success, "DefaultPool: sending StETH failed");
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

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        StETH = StETH.add(msg.value);
        emit DefaultPoolStETHBalanceUpdated(StETH);
    }
}
