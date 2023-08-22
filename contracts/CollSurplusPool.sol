// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/console.sol";

contract CollSurplusPool is Ownable, CheckContract {
    using SafeMath for uint256;

    string public constant NAME = "CollSurplusPool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public activePoolAddress;

    // deposited stETH tracker
    uint256 internal StETH;
    // Collateral surplus claimable by trove owners
    mapping(address => uint) internal balances;

    // --- Events ---

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _newActivePoolAddress);

    event CollBalanceUpdated(address indexed _account, uint _newBalance);
    event EtherSent(address _to, uint _amount);

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        renounceOwnership();
    }

    /* Returns the StETH state variable at ActivePool address.
       Not necessarily equal to the raw stETH balance - stETH can be forcibly sent to contracts. */
    function getStETH() external view returns (uint) {
        return StETH;
    }

    function getCollateral(address _account) external view returns (uint) {
        return balances[_account];
    }

    // --- Pool functionality ---

    function accountSurplus(address _account, uint _amount) external {
        _requireCallerIsTroveManager();

        uint newAmount = balances[_account].add(_amount);
        balances[_account] = newAmount;

        emit CollBalanceUpdated(_account, newAmount);
    }

    function claimColl(address _account) external {
        _requireCallerIsBorrowerOperations();
        uint claimableColl = balances[_account];
        require(
            claimableColl > 0,
            "CollSurplusPool: No collateral available to claim"
        );

        balances[_account] = 0;
        emit CollBalanceUpdated(_account, 0);

        StETH = StETH.sub(claimableColl);
        emit EtherSent(_account, claimableColl);

        (bool success, ) = _account.call{value: claimableColl}("");
        require(success, "CollSurplusPool: sending StETH failed");
    }

    // --- 'require' functions ---

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "CollSurplusPool: Caller is not Borrower Operations"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "CollSurplusPool: Caller is not TroveManager"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "CollSurplusPool: Caller is not Active Pool"
        );
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        StETH = StETH.add(msg.value);
    }
}
