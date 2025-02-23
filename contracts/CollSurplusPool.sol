// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./interfaces/ICollSurplusPool.sol";

contract CollSurplusPool is Ownable, CheckContract, ICollSurplusPool {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string public constant NAME = "CollSurplusPool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public activePoolAddress;
    IERC20 public WStETHToken;

    // deposited wStETH tracker
    uint256 internal WStETH;
    // Collateral surplus claimable by trove owners
    mapping(address => uint) internal balances;

    // --- Events ---

    event EtherSent(address _to, uint _amount);

    event WStETHTokenAddressUpdated(address _WStEthAddress);

    // --- Contract setters ---

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral instead of native token.
     * Setting erc20 address in the initialisation
     * Native Token Fallback function is removed
     */
    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _WStETHTokenAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_WStETHTokenAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;
        WStETHToken = IERC20(_WStETHTokenAddress);

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit WStETHTokenAddressUpdated(_WStETHTokenAddress);

        renounceOwnership();
    }

    /* Returns the WStETH state variable at ActivePool address.
       Not necessarily equal to the raw wStETH balance - wStETH can be forcibly sent to contracts. */
    function getWStETH() external view returns (uint) {
        return WStETH;
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

    /**
     * HEDGEHOG UPDATES: use SafeERC20 safe transfer instead of native token transfer
     */
    function claimColl(address _account) external {
        _requireCallerIsBorrowerOperations();
        uint claimableColl = balances[_account];

        require(
            claimableColl > 0,
            "CollSurplusPool: No collateral available to claim"
        );

        balances[_account] = 0;
        emit CollBalanceUpdated(_account, 0);

        WStETH = WStETH.sub(claimableColl);
        emit EtherSent(_account, claimableColl);

        WStETHToken.safeTransfer(_account, claimableColl);
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

    // Hedgehog Updates:
    // New function, that increases balance tracker instead of a native token fallback
    function increaseBalance(uint256 _amount) external {
        _requireCallerIsTroveManager();
        WStETH = WStETH.add(_amount);
    }

    // --- Fallback function ---
}
