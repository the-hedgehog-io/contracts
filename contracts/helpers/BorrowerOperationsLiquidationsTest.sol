// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../helpers/TroveManagerTest.sol";
import "../interfaces/IBaseFeeLMAToken.sol";
import "../interfaces/ICollSurplusPool.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/IFeesRouter.sol";
import "../dependencies/HedgehogBase.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../dependencies/CheckContract.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

error TroveAdjustedThisBlock();

contract BorrowerOperationsLiquidationsTest is
    HedgehogBase,
    Ownable,
    CheckContract
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // --- Connected contract declarations ---

    TroveManagerTest public troveManager;

    address stabilityPoolAddress;

    address gasPoolAddress;

    IERC20 public WStETHToken;

    ICollSurplusPool collSurplusPool;

    IFeesRouter public feesRouter;

    IBaseFeeLMAToken baseFeeLMAToken;

    ISortedTroves public sortedTroves;
    ArbSys constant arbsys = ArbSys(address(100));

    uint256 public lastWithdrawalTimestamp;
    uint256 public unusedWithdrawalLimit;
    IERC20 collToken;
    uint public withdrawalLimitThreshould = 100000000000000000000;

    constructor(address _activePool, IERC20 _collToken) {
        activePool = IActivePool(_activePool);
        collToken = _collToken;

        lastWithdrawalTimestamp = block.timestamp - (EXPAND_DURATION);
    }

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
        TroveManagerTest troveManager;
        IActivePool activePool;
        IBaseFeeLMAToken baseFeeLMAToken;
    }

    enum BorrowerOperation {
        openTrove,
        closeTrove,
        adjustTrove
    }

    function setUnusedWithdrawalLimit(uint256 _newLimit) external {
        unusedWithdrawalLimit = _newLimit;
    }

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

        troveManager = TroveManagerTest(_troveManagerAddress);
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

        renounceOwnership();
    }

    function openTrove(
        uint _maxFeePercentage,
        uint _BaseFeeLMAAmount,
        uint _collAmount,
        address _upperHint,
        address _lowerHint
    ) external {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            baseFeeLMAToken
        );
        LocalVariables_openTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        vars.BaseFeeLMAFee;
        vars.netDebt = _BaseFeeLMAAmount;

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

        uint newTCR = _getNewTCRFromTroveChange(
            _collAmount,
            true,
            vars.compositeDebt,
            true,
            vars.price
        ); // bools: coll increase, debt increase

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

        _activePoolAddColl(contractsCache.activePool, _collAmount);

        _withdrawBaseFeeLMA(
            contractsCache.activePool,
            contractsCache.baseFeeLMAToken,
            msg.sender,
            _BaseFeeLMAAmount - vars.BaseFeeLMAFee,
            vars.netDebt
        );

        _withdrawBaseFeeLMA(
            contractsCache.activePool,
            contractsCache.baseFeeLMAToken,
            gasPoolAddress,
            BaseFeeLMA_GAS_COMPENSATION,
            BaseFeeLMA_GAS_COMPENSATION
        );
    }

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

    function moveWStETHGainToTrove(
        address _borrower,
        address _upperHint,
        address _lowerHint,
        uint _amount
    ) external {
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

    function closeTrove() external {
        TroveManagerTest troveManagerCached = troveManager;
        IActivePool activePoolCached = activePool;
        IBaseFeeLMAToken baseFeeLMATokenCached = baseFeeLMAToken;

        uint price = priceFeed.fetchPrice();

        troveManagerCached.applyPendingRewards(msg.sender);

        uint coll = troveManagerCached.getTroveColl(msg.sender);
        uint debt = troveManagerCached.getTroveDebt(msg.sender);

        uint newTCR = _getNewTCRFromTroveChange(
            coll,
            false,
            debt,
            false,
            price
        );

        troveManagerCached.removeStake(msg.sender);
        troveManagerCached.closeTrove(msg.sender);

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

        activePoolCached.sendWStETH(msg.sender, coll);
    }

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
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            baseFeeLMAToken
        );
        LocalVariables_adjustTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        contractsCache.troveManager.applyPendingRewards(_borrower);

        (vars.collChange, vars.isCollIncrease) = _getCollChange(
            _collIncrease,
            _collWithdrawal
        );

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

        // When the adjustment is a debt repayment, check it's a valid amount and that the caller has enough BaseFeeLMA
        if (!_isDebtIncrease && _BaseFeeLMAChange > 0) {}

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

    function _triggerBorrowingFee(
        TroveManagerTest _troveManager,
        uint _BaseFeeLMAAmount,
        uint _maxFeePercentage
    ) internal returns (uint) {
        _troveManager.decayBaseRateFromBorrowing(); // decay the baseRate state variable
        (uint BaseFeeLMAFee, uint baseRate) = _troveManager.getBorrowingFee(
            _BaseFeeLMAAmount
        );

        troveManager.updateBaseRateFromBorrowing(baseRate);

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

    function _updateTroveFromAdjustment(
        TroveManagerTest _troveManager,
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

        if (!_isCollIncrease && _collChange > _coll) {
            revert("Error: Collateral decrease exceeds available collateral");
        }

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

    function computeUnreliableCR(
        uint _coll,
        uint _debt
    ) external view returns (uint) {
        uint price = priceFeed.lastGoodPrice();

        return LiquityMath._computeCR(_coll, _debt, price);
    }

    function setWithDrawalLimitThreshold(uint256 _newLimit) external {
        withdrawalLimitThreshould = _newLimit;
    }

    function _handleWithdrawlLimit(uint256 _collWithdrawal) public {
        if (activePool.getWStETH() > withdrawalLimitThreshould) {
            (uint256 fullLimit, uint256 singleTxWithdrawable) = LiquityMath
                ._checkWithdrawlLimit(
                    lastWithdrawalTimestamp,
                    EXPAND_DURATION,
                    unusedWithdrawalLimit,
                    activePool.getWStETH()
                );

            // Update current unusedWithdrawlLimit
            unusedWithdrawalLimit = fullLimit - _collWithdrawal;

            if (singleTxWithdrawable < _collWithdrawal) {
                revert(
                    "BO: Cannot withdraw more then 80% of withdrawble in one tx"
                );
            }
        } else {
            unusedWithdrawalLimit = activePool.getWStETH();
        }
        // Update the withdrawl recorded timestamp
        lastWithdrawalTimestamp = block.timestamp;
    }

    function _updateWithdrawlLimitFromCollIncrease(
        uint256 _previousColl,
        uint256 _collIncrease
    ) internal {
        uint256 newColl = _previousColl + _collIncrease;

        uint256 newLimit = (_previousColl / 2) + (_collIncrease / 2);
        if (newLimit >= _previousColl) {
            newLimit = (newColl / 2);
            lastWithdrawalTimestamp = block.timestamp - 720 minutes;
        }

        unusedWithdrawalLimit = newLimit;
    }
}
