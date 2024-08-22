// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/ITroveManager.sol";
import "./interfaces/IBaseFeeLMAToken.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/IFeesRouter.sol";
import "./dependencies/HedgehogBase.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

error TroveAdjustedThisBlock();

/**
 * @notice Fork of Liquity's BorrowerOperations. . Most of the Logic remains unchanged..
 * Changes to the contract:
 * - Raised pragma version
 * - Removed an import of IBorrowerOperations Interface
 * - Collateral is now an ERC20 token instead of a native one
 * - Updated variable names and docs to refer to BaseFeeLMA token and wwstETH as a collateral
 * - Logic updates with borrowing fees calculation and their distribution
 * - Removed Native Liquity Protocol Token Staking
 * - Remove _getUSDValue view method as it's not used anymore
 * Even though SafeMath is no longer required, the decision was made to keep it to avoid human factor errors
 */

contract BorrowerOperations is HedgehogBase, Ownable, CheckContract {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string public constant NAME = "BorrowerOperations";

    // --- Connected contract declarations ---

    ITroveManager public troveManager;

    address stabilityPoolAddress;

    address gasPoolAddress;

    IERC20 public WStETHToken;

    ICollSurplusPool collSurplusPool;

    IFeesRouter public feesRouter;

    IBaseFeeLMAToken baseFeeLMAToken;

    // A doubly linked list of Troves, sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    // HEDGEHOG UPDATES: Added two new public variables
    // Two variables that are used to track and calculate collateral withdrawl limits
    uint256 public lastWithdrawlTimestamp;
    uint256 public unusedWithdrawlLimit;

    /* --- Variable container structs  ---

    Used to hold, return and assign variables inside a function, in order to avoid the error:
    "CompilerError: Stack too deep". */

    struct LocalVariables_adjustTrove {
        uint price;
        uint collChange;
        uint netDebtChange;
        bool isCollIncrease;
        uint debt;
        uint coll;
        uint oldICR;
        uint newICR;
        uint newTCR;
        uint BaseFeeLMAFee;
        uint newDebt;
        uint newColl;
        uint stake;
    }

    struct LocalVariables_openTrove {
        uint price;
        uint BaseFeeLMAFee;
        uint netDebt;
        uint compositeDebt;
        uint ICR;
        uint NICR;
        uint stake;
        uint arrayIndex;
    }

    struct ContractsCache {
        ITroveManager troveManager;
        IActivePool activePool;
        IBaseFeeLMAToken baseFeeLMAToken;
    }

    enum BorrowerOperation {
        openTrove,
        closeTrove,
        adjustTrove
    }

    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _activePoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);
    event GasPoolAddressChanged(address _gasPoolAddress);
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event BaseFeeLMATokenAddressChanged(address _BaseFeeLMATokenAddress);
    event WStETHTokenAddressUpdated(IERC20 _WStEthAddress);
    event FeesRouterAddressUpdated(IFeesRouter _feesRouter);

    event TroveCreated(address indexed _borrower, uint arrayIndex);
    event TroveUpdated(
        address indexed _borrower,
        uint _debt,
        uint _coll,
        uint stake,
        BorrowerOperation operation
    );
    event BaseFeeLMABorrowingFeePaid(
        address indexed _borrower,
        uint _BaseFeeLMAFee
    );

    // --- Dependency setters ---

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral instead of native token.
     * Setting erc20 address in the initialisation
     * Setting initial value for newly added lastWithdrawTimestamp
     */
    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _baseFeeLMATokenAddress,
        IERC20 _wStETHTokenAddress,
        IFeesRouter _feesRouter
    ) external onlyOwner {
        // This makes impossible to open a trove with zero withdrawn BaseFeeLMA
        assert(MIN_NET_DEBT > 0);

        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_baseFeeLMATokenAddress);
        checkContract(address(_wStETHTokenAddress));
        checkContract(address(_feesRouter));

        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        stabilityPoolAddress = _stabilityPoolAddress;
        gasPoolAddress = _gasPoolAddress;
        collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        baseFeeLMAToken = IBaseFeeLMAToken(_baseFeeLMATokenAddress);
        WStETHToken = _wStETHTokenAddress;
        feesRouter = _feesRouter;

        // Setting a value of block.timestamp 720 minutes ago to make sure that in any case first withdrawl wouldn't get decreased unfairly
        lastWithdrawlTimestamp = block.timestamp - (720 minutes);

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit BaseFeeLMATokenAddressChanged(_baseFeeLMATokenAddress);
        emit WStETHTokenAddressUpdated(_wStETHTokenAddress);
        emit FeesRouterAddressUpdated(_feesRouter);

        renounceOwnership();
    }

    // --- Borrower Trove Operations ---

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral, therefore function may not rely on msg.value anymore
     * now passing a new param _collAmount
     * checking if _amount is greater then 0
     * Function is no longer payable
     */
    function openTrove(
        uint _maxFeePercentage,
        uint _BaseFeeLMAAmount,
        uint _collAmount,
        address _upperHint,
        address _lowerHint
    ) external {
        // Hedgehog Updates: Check that trove[msg.sender] did not perform adjustTrove transactions in the current block
        {
            _checkAndSetUpdateBlock(msg.sender);
        }
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            baseFeeLMAToken
        );
        LocalVariables_openTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        _requireValidMaxFeePercentage(_maxFeePercentage, isRecoveryMode);
        _requireTroveisNotActive(contractsCache.troveManager, msg.sender);

        vars.BaseFeeLMAFee;
        vars.netDebt = _BaseFeeLMAAmount;

        // HEDGEHOG UPDATES: Triggering borrowing fee in both recovery and normal modes
        vars.BaseFeeLMAFee = _triggerBorrowingFee(
            contractsCache.troveManager,
            _BaseFeeLMAAmount,
            _maxFeePercentage
        );
        _requireAtLeastMinNetDebt(vars.netDebt);
        if (_BaseFeeLMAAmount <= vars.BaseFeeLMAFee) {
            revert("BO: Fee exceeds gain");
        }

        vars.compositeDebt = _getCompositeDebt(vars.netDebt);
        assert(vars.compositeDebt > 0);

        vars.ICR = LiquityMath._computeCR(
            _collAmount,
            vars.compositeDebt,
            vars.price
        );
        vars.NICR = LiquityMath._computeNominalCR(
            _collAmount,
            vars.compositeDebt
        );

        if (isRecoveryMode) {
            _requireICRisAboveCCR(vars.ICR);
        } else {
            _requireICRisAboveMCR(vars.ICR);
            uint newTCR = _getNewTCRFromTroveChange(
                _collAmount,
                true,
                vars.compositeDebt,
                true,
                vars.price
            ); // bools: coll increase, debt increase
            _requireNewTCRisAboveCCR(newTCR);
        }

        // Set the trove struct's properties
        contractsCache.troveManager.setTroveStatus(msg.sender, 1);
        contractsCache.troveManager.increaseTroveColl(msg.sender, _collAmount);
        contractsCache.troveManager.increaseTroveDebt(
            msg.sender,
            vars.compositeDebt
        );

        contractsCache.troveManager.updateTroveRewardSnapshots(msg.sender);
        vars.stake = contractsCache.troveManager.updateStakeAndTotalStakes(
            msg.sender
        );

        sortedTroves.insert(msg.sender, vars.NICR, _upperHint, _lowerHint);
        vars.arrayIndex = contractsCache.troveManager.addTroveOwnerToArray(
            msg.sender
        );
        emit TroveCreated(msg.sender, vars.arrayIndex);
        // Move the wStETH to the Active Pool, and mint the BaseFeeLMAAmount to the borrower
        _activePoolAddColl(contractsCache.activePool, _collAmount);

        // Hedgehog Updates: Now amount transferred to the user is decreased by Fee
        _withdrawBaseFeeLMA(
            contractsCache.activePool,
            contractsCache.baseFeeLMAToken,
            msg.sender,
            _BaseFeeLMAAmount - vars.BaseFeeLMAFee,
            vars.netDebt
        );

        // HEDGEHOG UPDATES: Not increasing net debt anymore. only transferring the gas comp tokens
        // Move the BaseFeeLMA gas compensation to the Gas Pool
        _withdrawBaseFeeLMA(
            contractsCache.activePool,
            contractsCache.baseFeeLMAToken,
            gasPoolAddress,
            BaseFeeLMA_GAS_COMPENSATION,
            BaseFeeLMA_GAS_COMPENSATION
        );
        emit TroveUpdated(
            msg.sender,
            vars.compositeDebt,
            _collAmount,
            vars.stake,
            BorrowerOperation.openTrove
        );
        emit BaseFeeLMABorrowingFeePaid(msg.sender, vars.BaseFeeLMAFee);
    }

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral, therefore function may not rely on msg.value anymore
     * now passing a new param _collIncrease in _adjustTrove function - in this particular case it is a passed param _amount
     * checking if _amount is greater then 0
     * Function is no longer payable
     */
    // Send WStETH as collateral to a trove
    function addColl(
        address _upperHint,
        address _lowerHint,
        uint _amount
    ) external {
        require(_amount > 0, "Borrower Operations: Invalid amount");

        _adjustTrove(
            msg.sender,
            0,
            _amount,
            0,
            false,
            _upperHint,
            _lowerHint,
            0
        );
    }

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral, therefore function may not rely on msg.value anymore
     * now passing a new param _collIncrease in _adjustTrove function - in this particular case it is a passed param _amount
     * checking if _amount is greater then 0
     * Function is no longer payable
     */
    // Send WStETH as collateral to a trove. Called by only the Stability Pool.
    function moveWStETHGainToTrove(
        address _borrower,
        address _upperHint,
        address _lowerHint,
        uint _amount
    ) external {
        require(_amount > 0, "Borrower Operations: Invalid amount");
        _requireCallerIsStabilityPool();
        _adjustTrove(
            _borrower,
            0,
            _amount,
            0,
            false,
            _upperHint,
            _lowerHint,
            0
        );
    }

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral, therefore function may not rely on msg.value anymore
     * now passing a new param _collIncrease - in this particular case it is 0
     */
    // Withdraw WStETH collateral from a trove
    function withdrawColl(
        uint _collWithdrawal,
        address _upperHint,
        address _lowerHint
    ) external {
        _adjustTrove(
            msg.sender,
            _collWithdrawal,
            0,
            0,
            false,
            _upperHint,
            _lowerHint,
            0
        );
    }

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral, therefore function may not rely on msg.value anymore
     * now passing a new param _collIncrease - in this particular case it is 0
     */
    // Withdraw BaseFeeLMA tokens from a trove: mint new BaseFeeLMA tokens to the owner, and increase the trove's debt accordingly
    function withdrawBaseFeeLMA(
        uint _maxFeePercentage,
        uint _BaseFeeLMAAmount,
        address _upperHint,
        address _lowerHint
    ) external {
        _adjustTrove(
            msg.sender,
            0,
            0,
            _BaseFeeLMAAmount,
            true,
            _upperHint,
            _lowerHint,
            _maxFeePercentage
        );
    }

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral, therefore function may not rely on msg.value anymore
     * now passing a new param _collIncrease - in this particular case it is 0
     */
    // Repay BaseFeeLMA tokens to a Trove: Burn the repaid BaseFeeLMA tokens, and reduce the trove's debt accordingly
    function repayBaseFeeLMA(
        uint _BaseFeeLMAAmount,
        address _upperHint,
        address _lowerHint
    ) external {
        _adjustTrove(
            msg.sender,
            0,
            0,
            _BaseFeeLMAAmount,
            false,
            _upperHint,
            _lowerHint,
            0
        );
    }

    /**
     * HEDGEHOG UPDATES:
     * ERC20 is used as a collateral, therefore function may not rely on msg.value anymore
     * now passing a new param _collIncrease
     *
     * Function is no longer payable
     */
    function adjustTrove(
        uint _maxFeePercentage,
        uint _collWithdrawal,
        uint _collIncrease,
        uint _BaseFeeLMAChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external {
        _adjustTrove(
            msg.sender,
            _collWithdrawal,
            _collIncrease,
            _BaseFeeLMAChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint,
            _maxFeePercentage
        );
    }

    /*
     * _adjustTrove(): Alongside a debt change, this function can perform either a collateral top-up or a collateral withdrawal.
     *
     * It therefore expects either a positive _collIncrease, or a positive _collWithdrawal argument.
     *
     * If both are positive, it will revert.
     */
    function _adjustTrove(
        address _borrower,
        uint _collWithdrawal,
        uint _collIncrease,
        uint _BaseFeeLMAChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint,
        uint _maxFeePercentage
    ) internal {
        {
            // Hedgehog Updates: Check that trove[msg.sender] did not perform adjustTrove transactions in the current block
            _checkAndSetUpdateBlock(msg.sender);
        }
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            baseFeeLMAToken
        );
        LocalVariables_adjustTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        if (_isDebtIncrease) {
            _requireValidMaxFeePercentage(_maxFeePercentage, isRecoveryMode);
            _requireNonZeroDebtChange(_BaseFeeLMAChange);
        }
        _requireSingularCollChange(_collWithdrawal, _collIncrease);
        _requireNonZeroAdjustment(
            _collWithdrawal,
            _collIncrease,
            _BaseFeeLMAChange
        );
        _requireTroveisActive(contractsCache.troveManager, _borrower);

        // Confirm the operation is either a borrower adjusting their own trove, or a pure WStETH transfer from the Stability Pool to a trove
        assert(
            msg.sender == _borrower ||
                (msg.sender == stabilityPoolAddress &&
                    _collIncrease > 0 &&
                    _BaseFeeLMAChange == 0)
        );

        contractsCache.troveManager.applyPendingRewards(_borrower);

        // Get the collChange based on whether or not WStETH was sent in the transaction
        (vars.collChange, vars.isCollIncrease) = _getCollChange(
            _collIncrease,
            _collWithdrawal
        );
        /**
         * HEDGEHOG UPDATES: Perform withdrawl limit check if adjustTrove intent is coll withdraw
         */
        if (_collWithdrawal > 0) {
            _handleWithdrawlLimit(_collWithdrawal);
        }

        vars.netDebtChange = _BaseFeeLMAChange;

        // If the adjustment incorporates a debt increase then trigger a borrowing fee
        // HEDGEHOG UPDATES: Trigger borrowing fee in both recovery and normal modes
        if (_isDebtIncrease) {
            vars.BaseFeeLMAFee = _triggerBorrowingFee(
                contractsCache.troveManager,
                _BaseFeeLMAChange,
                _maxFeePercentage
            );

            // Hedgehog Updates: Not adding fee to the position debt anymore
            vars.netDebtChange = vars.netDebtChange;
        }

        vars.debt = contractsCache.troveManager.getTroveDebt(_borrower);
        vars.coll = contractsCache.troveManager.getTroveColl(_borrower);

        // Get the trove's old ICR before the adjustment, and what its new ICR will be after the adjustment
        vars.oldICR = LiquityMath._computeCR(vars.coll, vars.debt, vars.price);
        vars.newICR = _getNewICRFromTroveChange(
            vars.coll,
            vars.debt,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease,
            vars.price
        );
        assert(_collWithdrawal <= vars.coll);

        // Check the adjustment satisfies all conditions for the current system mode
        _requireValidAdjustmentInCurrentMode(
            isRecoveryMode,
            _collWithdrawal,
            _isDebtIncrease,
            vars
        );

        // When the adjustment is a debt repayment, check it's a valid amount and that the caller has enough BaseFeeLMA
        if (!_isDebtIncrease && _BaseFeeLMAChange > 0) {
            _requireAtLeastMinNetDebt(
                _getNetDebt(vars.debt).sub(vars.netDebtChange)
            );
            _requireValidBaseFeeLMARepayment(vars.debt, vars.netDebtChange);
            _requireSufficientBaseFeeLMABalance(
                contractsCache.baseFeeLMAToken,
                _borrower,
                vars.netDebtChange
            );
        }

        (vars.newColl, vars.newDebt) = _updateTroveFromAdjustment(
            contractsCache.troveManager,
            _borrower,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease
        );
        vars.stake = contractsCache.troveManager.updateStakeAndTotalStakes(
            _borrower
        );

        // Re-insert trove in to the sorted list
        uint newNICR = _getNewNominalICRFromTroveChange(
            vars.coll,
            vars.debt,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease
        );
        sortedTroves.reInsert(_borrower, newNICR, _upperHint, _lowerHint);

        emit TroveUpdated(
            _borrower,
            vars.newDebt,
            vars.newColl,
            vars.stake,
            BorrowerOperation.adjustTrove
        );
        emit BaseFeeLMABorrowingFeePaid(msg.sender, vars.BaseFeeLMAFee);

        _moveTokensAndWStETHfromAdjustment(
            contractsCache.activePool,
            contractsCache.baseFeeLMAToken,
            msg.sender,
            vars.collChange,
            vars.isCollIncrease,
            _BaseFeeLMAChange - vars.BaseFeeLMAFee,
            _isDebtIncrease,
            vars.netDebtChange
        );
    }

    // Hedgehog Updates: Do not deduct gas fee compensation from trove Debt as user just received less tokens during position opening
    function closeTrove() external {
        // Hedgehog Updates: Check that trove[msg.sender] did not perform adjustTrove transactions in the current block
        {
            _checkAndSetUpdateBlock(msg.sender);
        }
        ITroveManager troveManagerCached = troveManager;
        IActivePool activePoolCached = activePool;
        IBaseFeeLMAToken baseFeeLMATokenCached = baseFeeLMAToken;

        _requireTroveisActive(troveManagerCached, msg.sender);
        uint price = priceFeed.fetchPrice();
        _requireNotInRecoveryMode(price);

        troveManagerCached.applyPendingRewards(msg.sender);

        uint coll = troveManagerCached.getTroveColl(msg.sender);
        uint debt = troveManagerCached.getTroveDebt(msg.sender);

        _requireSufficientBaseFeeLMABalance(
            baseFeeLMATokenCached,
            msg.sender,
            debt.sub(BaseFeeLMA_GAS_COMPENSATION)
        );

        uint newTCR = _getNewTCRFromTroveChange(
            coll,
            false,
            debt,
            false,
            price
        );
        _requireNewTCRisAboveCCR(newTCR);

        troveManagerCached.removeStake(msg.sender);
        troveManagerCached.closeTrove(msg.sender);

        emit TroveUpdated(msg.sender, 0, 0, 0, BorrowerOperation.closeTrove);

        // Burn the repaid BaseFeeLMA from the user's balance and the gas compensation from the Gas Pool
        _repayBaseFeeLMA(
            activePoolCached,
            baseFeeLMATokenCached,
            msg.sender,
            debt.sub(BaseFeeLMA_GAS_COMPENSATION)
        );
        _repayBaseFeeLMA(
            activePoolCached,
            baseFeeLMATokenCached,
            gasPoolAddress,
            BaseFeeLMA_GAS_COMPENSATION
        );

        // Send the collateral back to the user
        activePoolCached.sendWStETH(msg.sender, coll);
    }

    /**
     * Claim remaining collateral from a redemption or from a liquidation with ICR > MCR in Recovery Mode
     */
    function claimCollateral() external {
        // send WStETH from CollSurplus Pool to owner
        collSurplusPool.claimColl(msg.sender);
    }

    // --- Helper functions ---

    // HedgehogUpdates: new private function, that checks if there was a transaction with a trove in the current block
    function _checkAndSetUpdateBlock(address _borrower) private {
        if (troveManager.getTroveUpdateBlock(_borrower) == block.number) {
            revert TroveAdjustedThisBlock();
        }
        troveManager.setTroveLastUpdatedBlock(_borrower);
    }

    // HEDGHEHOG UPDATES:
    // No longer passing token address param as it's not needed anymore
    function _triggerBorrowingFee(
        ITroveManager _troveManager,
        uint _BaseFeeLMAAmount,
        uint _maxFeePercentage
    ) internal returns (uint) {
        _troveManager.decayBaseRateFromBorrowing(); // decay the baseRate state variable
        (uint BaseFeeLMAFee, uint baseRate) = _troveManager.getBorrowingFee(
            _BaseFeeLMAAmount
        );

        troveManager.updateBaseRateFromBorrowing(baseRate);

        _requireUserAcceptsFee(
            BaseFeeLMAFee,
            _BaseFeeLMAAmount,
            _maxFeePercentage
        );

        // HEDGHEHOG UPDATES:
        // Fees are now distributed among different addresses based on how big they are
        feesRouter.distributeDebtFee(_BaseFeeLMAAmount, BaseFeeLMAFee);

        return BaseFeeLMAFee;
    }

    function _getCollChange(
        uint _collReceived,
        uint _requestedCollWithdrawal
    ) internal pure returns (uint collChange, bool isCollIncrease) {
        if (_collReceived != 0) {
            collChange = _collReceived;
            isCollIncrease = true;
        } else {
            collChange = _requestedCollWithdrawal;
        }
    }

    // Update trove's coll and debt based on whether they increase or decrease
    function _updateTroveFromAdjustment(
        ITroveManager _troveManager,
        address _borrower,
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease
    ) internal returns (uint, uint) {
        uint newColl = (_isCollIncrease)
            ? _troveManager.increaseTroveColl(_borrower, _collChange)
            : _troveManager.decreaseTroveColl(_borrower, _collChange);
        uint newDebt = (_isDebtIncrease)
            ? _troveManager.increaseTroveDebt(_borrower, _debtChange)
            : _troveManager.decreaseTroveDebt(_borrower, _debtChange);

        return (newColl, newDebt);
    }

    function _moveTokensAndWStETHfromAdjustment(
        IActivePool _activePool,
        IBaseFeeLMAToken _baseFeeLMAToken,
        address _borrower,
        uint _collChange,
        bool _isCollIncrease,
        uint _BaseFeeLMAChange,
        bool _isDebtIncrease,
        uint _netDebtChange
    ) internal {
        if (_isDebtIncrease) {
            _withdrawBaseFeeLMA(
                _activePool,
                _baseFeeLMAToken,
                _borrower,
                _BaseFeeLMAChange,
                _netDebtChange
            );
        } else {
            _repayBaseFeeLMA(
                _activePool,
                _baseFeeLMAToken,
                _borrower,
                _BaseFeeLMAChange
            );
        }

        if (_isCollIncrease) {
            _activePoolAddColl(_activePool, _collChange);
        } else {
            _activePool.sendWStETH(_borrower, _collChange);
        }
    }

    /**
     * HEDGEHOG UPDATES: use SafeERC20 safe transfer instead of native token transfer
     * Send funds from User's account instead of relaying native token through address(this)
     * Manualy increase balance in Active Pool, since it used to be done in the native token fallback
     *
     * Now also update the contract's withdrawl limit along with the changes to the coll balance in the active pool
     */
    // Send WStETH to Active Pool and increase its recorded WStETH balance
    function _activePoolAddColl(
        IActivePool _activePool,
        uint _amount
    ) internal {
        uint256 oldColl = _activePool.getWStETH();

        WStETHToken.safeTransferFrom(msg.sender, address(_activePool), _amount);
        activePool.increaseBalance(_amount);

        _updateWithdrawlLimitFromCollIncrease(oldColl, _amount);
    }

    // Issue the specified amount of BaseFeeLMA to _account and increases the total active debt (_netDebtIncrease potentially includes a BaseFeeLMAFee)
    function _withdrawBaseFeeLMA(
        IActivePool _activePool,
        IBaseFeeLMAToken _baseFeeLMAToken,
        address _account,
        uint _BaseFeeLMAAmount,
        uint _netDebtIncrease
    ) internal {
        _activePool.increaseBaseFeeLMADebt(_netDebtIncrease);
        _baseFeeLMAToken.mint(_account, _BaseFeeLMAAmount);
    }

    // Burn the specified amount of BaseFeeLMA from _account and decreases the total active debt
    function _repayBaseFeeLMA(
        IActivePool _activePool,
        IBaseFeeLMAToken _baseFeeLMAToken,
        address _account,
        uint BaseFeeLMA
    ) internal {
        _activePool.decreaseBaseFeeLMADebt(BaseFeeLMA);
        _baseFeeLMAToken.burn(_account, BaseFeeLMA);
    }

    // --- 'Require' wrapper functions ---

    /**
     * HEDGEHOG UPDATES: checking passed param instead of msg.value
     */
    function _requireSingularCollChange(
        uint _collWithdrawal,
        uint _collIncrease
    ) internal pure {
        require(
            _collIncrease == 0 || _collWithdrawal == 0,
            "BorrowerOperations: Cannot withdraw and add coll"
        );
    }

    function _requireCallerIsBorrower(address _borrower) internal view {
        require(
            msg.sender == _borrower,
            "BorrowerOps: Caller must be the borrower for a withdrawal"
        );
    }

    /**
     * HEDGEHOG UPDATES: checking passed param instead of msg.value
     */
    function _requireNonZeroAdjustment(
        uint _collWithdrawal,
        uint _collIncrease,
        uint _BaseFeeLMAChange
    ) internal pure {
        require(
            _collIncrease != 0 ||
                _collWithdrawal != 0 ||
                _BaseFeeLMAChange != 0,
            "BorrowerOps: There must be either a collateral change or a debt change"
        );
    }

    function _requireTroveisActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        uint status = _troveManager.getTroveStatus(_borrower);
        require(status == 1, "BorrowerOps: Trove does not exist or is closed");
    }

    function _requireTroveisNotActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        uint status = _troveManager.getTroveStatus(_borrower);
        require(status != 1, "BorrowerOps: Trove is active");
    }

    function _requireNonZeroDebtChange(uint _BaseFeeLMAChange) internal pure {
        require(
            _BaseFeeLMAChange > 0,
            "BorrowerOps: Debt increase requires non-zero debtChange"
        );
    }

    function _requireNotInRecoveryMode(uint _price) internal view {
        require(
            !_checkRecoveryMode(_price),
            "BorrowerOps: Operation not permitted during Recovery Mode"
        );
    }

    function _requireNoCollWithdrawal(uint _collWithdrawal) internal pure {
        require(
            _collWithdrawal == 0,
            "BorrowerOps: Collateral withdrawal not permitted Recovery Mode"
        );
    }

    function _requireValidAdjustmentInCurrentMode(
        bool _isRecoveryMode,
        uint _collWithdrawal,
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal view {
        /*
         *In Recovery Mode, only allow:
         *
         * - Pure collateral top-up
         * - Pure debt repayment
         * - Collateral top-up with debt repayment
         * - A debt increase combined with a collateral top-up which makes the ICR >= 150% and improves the ICR (and by extension improves the TCR).
         *
         * In Normal Mode, ensure:
         *
         * - The new ICR is above MCR
         * - The adjustment won't pull the TCR below CCR
         */
        if (_isRecoveryMode) {
            _requireNoCollWithdrawal(_collWithdrawal);
            if (_isDebtIncrease) {
                _requireICRisAboveCCR(_vars.newICR);
                _requireNewICRisAboveOldICR(_vars.newICR, _vars.oldICR);
            }
        } else {
            // if Normal Mode
            _requireICRisAboveMCR(_vars.newICR);
            _vars.newTCR = _getNewTCRFromTroveChange(
                _vars.collChange,
                _vars.isCollIncrease,
                _vars.netDebtChange,
                _isDebtIncrease,
                _vars.price
            );
            _requireNewTCRisAboveCCR(_vars.newTCR);
        }
    }

    function _requireICRisAboveMCR(uint _newICR) internal pure {
        require(
            _newICR >= MCR,
            "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
        );
    }

    function _requireICRisAboveCCR(uint _newICR) internal view {
        require(
            _newICR >= CCR,
            "BorrowerOps: Operation must leave trove with ICR >= CCR"
        );
    }

    function _requireNewICRisAboveOldICR(
        uint _newICR,
        uint _oldICR
    ) internal pure {
        require(
            _newICR >= _oldICR,
            "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode"
        );
    }

    function _requireNewTCRisAboveCCR(uint _newTCR) internal pure {
        require(
            _newTCR >= CCR,
            "BorrowerOps: An operation that would result in TCR < CCR is not permitted"
        );
    }

    function _requireAtLeastMinNetDebt(uint _netDebt) internal pure {
        require(
            _netDebt >= MIN_NET_DEBT,
            "BorrowerOps: Trove's net debt must be greater than minimum"
        );
    }

    function _requireValidBaseFeeLMARepayment(
        uint _currentDebt,
        uint _debtRepayment
    ) internal pure {
        require(
            _debtRepayment <= _currentDebt.sub(BaseFeeLMA_GAS_COMPENSATION),
            "BorrowerOps: Amount repaid must not be larger than the Trove's debt"
        );
    }

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "BorrowerOps: Caller is not Stability Pool"
        );
    }

    function _requireSufficientBaseFeeLMABalance(
        IBaseFeeLMAToken _baseFeeLMAToken,
        address _borrower,
        uint _debtRepayment
    ) internal view {
        require(
            _baseFeeLMAToken.balanceOf(_borrower) >= _debtRepayment,
            "BorrowerOps: Caller doesnt have enough BaseFeeLMA to make repayment"
        );
    }

    function _requireValidMaxFeePercentage(
        uint _maxFeePercentage,
        bool _isRecoveryMode
    ) internal pure {
        if (_isRecoveryMode) {
            require(
                _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must less than or equal to 100%"
            );
        } else {
            require(
                _maxFeePercentage >= BORROWING_FEE_FLOOR &&
                    _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must be between 0.5% and 100%"
            );
        }
    }

    // --- ICR and TCR getters ---

    // Compute the new collateral ratio, considering the change in coll and debt. Assumes 0 pending rewards.
    function _getNewNominalICRFromTroveChange(
        uint _coll,
        uint _debt,
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease
    ) internal pure returns (uint) {
        (uint newColl, uint newDebt) = _getNewTroveAmounts(
            _coll,
            _debt,
            _collChange,
            _isCollIncrease,
            _debtChange,
            _isDebtIncrease
        );

        uint newNICR = LiquityMath._computeNominalCR(newColl, newDebt);
        return newNICR;
    }

    // Compute the new collateral ratio, considering the change in coll and debt. Assumes 0 pending rewards.
    function _getNewICRFromTroveChange(
        uint _coll,
        uint _debt,
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease,
        uint _price
    ) internal pure returns (uint) {
        (uint newColl, uint newDebt) = _getNewTroveAmounts(
            _coll,
            _debt,
            _collChange,
            _isCollIncrease,
            _debtChange,
            _isDebtIncrease
        );

        uint newICR = LiquityMath._computeCR(newColl, newDebt, _price);
        return newICR;
    }

    function _getNewTroveAmounts(
        uint _coll,
        uint _debt,
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease
    ) internal pure returns (uint, uint) {
        uint newColl = _coll;
        uint newDebt = _debt;

        newColl = _isCollIncrease
            ? _coll.add(_collChange)
            : _coll.sub(_collChange);
        newDebt = _isDebtIncrease
            ? _debt.add(_debtChange)
            : _debt.sub(_debtChange);

        return (newColl, newDebt);
    }

    function _getNewTCRFromTroveChange(
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease,
        uint _price
    ) internal view returns (uint) {
        uint totalColl = getEntireSystemColl();
        uint totalDebt = getEntireSystemDebt();

        totalColl = _isCollIncrease
            ? totalColl.add(_collChange)
            : totalColl.sub(_collChange);
        totalDebt = _isDebtIncrease
            ? totalDebt.add(_debtChange)
            : totalDebt.sub(_debtChange);

        uint newTCR = LiquityMath._computeCR(totalColl, totalDebt, _price);
        return newTCR;
    }

    function getCompositeDebt(uint _debt) external pure returns (uint) {
        return _getCompositeDebt(_debt);
    }

    /**
     * HEDGEHOG UPDATES:
     * New view method to help with getting the data on frontends
     */
    function computeUnreliableCR(
        uint _coll,
        uint _debt
    ) external view returns (uint) {
        uint price = priceFeed.lastGoodPrice();

        return LiquityMath._computeCR(_coll, _debt, price);
    }

    /**
     * HEDGEHOG UPDATES:
     * New function to handle dynamic Withdrawl Limit.
     * the new dynamic collateral withdrawal limit in our smart contract, inspired by a similar mechanism in the Fluid InstaDApp protocol.
     * The purpose of this mechanism is to dynamically adjust the withdrawal limit based on the collateral added or removed from the system,
     * while considering the time elapsed since the last withdrawal.
     *
     * Basic Withdrawl Dynamic Limits overview:
     * When Collateral is Added to the System:
     * 1) When a user adds collateral, the new collateral amount is calculated by adding the deposit to the existing collateral.
     * 2) Calculate New Withdrawal Limit:
     * The system calculates the new withdrawal limit as the sum of the old limit plus 75% of the deposit.
     * Condition Check:
     * If this new limit is greater than or equal to 75% of the new total collateral, the withdrawal limit is immediately set to 75% of the new collateral,
     * and the time counter is reset until the next withdrawal.
     * If the new limit is less than 75% of the new total collateral, the withdrawal limit is set to the calculated value (old limit + 75% of the deposit).
     * The target limit is set to 75% of the new total collateral, and the time counter continues from the last withdrawal.
     *
     * When Collateral is Withdrawn from the System:
     * 1) Calculate the Current Withdrawal Limit: The system calculates the current withdrawal limit as:
     * Current Limit = Old Limit + (75% + Current Collateral - Old Limit) * ( Time Elapsed(minutes) / 720 )
     * This formula accounts for the time elapsed since the last withdrawal, with the withdrawal limit gradually increasing towards the target limit over a 12-hour period.
     *
     * 2) Determine User's Withdrawal Limit for the Transaction:
     * The user's withdrawal limit for the current transaction is calculated as 80% of the current limit.
     *
     * After the collateral is withdraw from the system:
     * 1) When collateral is withdrawn, the new collateral amount is calculated by subtracting the withdrawn amount from the current collateral.
     * 2) The system subtracts the withdrawn amount from the current withdrawal limit to determine the new limit. This new limit will be considered as the old limit for the next withdrawal.
     * 3) The system records the time of the withdrawal and starts a new 12-hour countdown for the dynamic adjustment of the withdrawal limit.
     */
    function _handleWithdrawlLimit(uint256 _collWithdrawal) internal {
        // If coll in the system is greater then threshold - we check if user may withdraw the desired amount. Otherwise they are free to withdraw whole amount
        if (activePool.getWStETH() > WITHDRAWL_LIMIT_THRESHOLD) {
            (uint256 fullLimit, uint256 singleTxWithdrawable) = LiquityMath
                ._checkWithdrawlLimit(
                    lastWithdrawlTimestamp,
                    EXPAND_DURATION,
                    unusedWithdrawlLimit,
                    activePool.getWStETH()
                );

            if (singleTxWithdrawable < _collWithdrawal) {
                revert(
                    "BO: Cannot withdraw more then 80% of withdrawble in one tx"
                );
            }

            // Update current unusedWithdrawlLimit
            unusedWithdrawlLimit = fullLimit - _collWithdrawal;
        } else {
            unusedWithdrawlLimit = activePool.getWStETH();
        }
        // Update the withdrawl recorded timestamp
        lastWithdrawlTimestamp = block.timestamp;
    }

    /**
     * HEDGEHOG UPDATES:
     * New function that updates dynamic withdrawl limit during the coll increase
     *
     * Accepts activePool.getWstETH() as _previousColl and _collIncrease as the amount of coll that is about to get added to activePool
     */
    function _updateWithdrawlLimitFromCollIncrease(
        uint256 _previousColl,
        uint256 _collIncrease
    ) internal {
        uint256 newColl = _previousColl + _collIncrease;

        uint256 newLimit = (_previousColl * 3) / 4 + ((_collIncrease * 3) / 4);
        if (newLimit >= _previousColl) {
            newLimit = (newColl * 3) / 4;
            lastWithdrawlTimestamp = block.timestamp - 720 minutes;
        }

        unusedWithdrawlLimit = newLimit;
    }
}
