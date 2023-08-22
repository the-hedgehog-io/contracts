// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/console.sol";
import "./interfaces/IPool.sol";

/**
 * @notice Fork of Liquity's Active Pool. Logic remains unchanged.
 * Changes to the contract:
 * - Raised pragma version
 * - Removed an import of ActivePool Interface
 * - Updated variable names and docs to refer to BaseFeeLMA token and stEth as a collateral
 * Even though SafeMath is no longer required, the decision was made to keep it to avoid human factor errors
 *
 * The Active Pool holds the stStETH collateral and BaseFeeLMA debt (but not BaseFeeLMA tokens) for all active troves.
 *
 * When a trove is liquidated, it's stStETH and BaseFeeLMA debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is Ownable, CheckContract, IPool {
    using SafeMath for uint256;

    string public constant NAME = "ActivePool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public stabilityPoolAddress;
    address public defaultPoolAddress;
    uint256 internal StETH; // deposited stEth tracker
    uint256 internal BaseFeeLMADebt;

    // --- Events ---

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolBaseFeeLMADebtUpdated(uint _BaseFeeLMADebt);
    event ActivePoolStETHBalanceUpdated(uint _stStETH);

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _defaultPoolAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_defaultPoolAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);

        renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Returns the stStETH state variable.
     *
     *Not necessarily equal to the the contract's raw StETH balance - stETH can be forcibly sent to contracts.
     */
    function getStETH() external view override returns (uint) {
        return StETH;
    }

    function getBaseFeeLMADebt() external view override returns (uint) {
        return BaseFeeLMADebt;
    }

    // --- Pool functionality ---

    function sendStETH(address _account, uint _amount) external {
        _requireCallerIsBOorTroveMorSP();
        StETH = StETH.sub(_amount);
        emit ActivePoolStETHBalanceUpdated(StETH);
        emit StETHSent(_account, _amount);

        (bool success, ) = _account.call{value: _amount}("");
        require(success, "ActivePool: sending StETH failed");
    }

    function increaseBaseFeeLMADebt(uint _amount) external override {
        _requireCallerIsBOorTroveM();
        BaseFeeLMADebt = BaseFeeLMADebt.add(_amount);
        emit ActivePoolBaseFeeLMADebtUpdated(BaseFeeLMADebt);
    }

    function decreaseBaseFeeLMADebt(uint _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        BaseFeeLMADebt = BaseFeeLMADebt.sub(_amount);
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

    function _requireCallerIsBOorTroveM() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager"
        );
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        StETH = StETH.add(msg.value);
        emit ActivePoolStETHBalanceUpdated(StETH);
    }
}
