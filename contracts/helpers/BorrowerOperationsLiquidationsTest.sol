// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../BorrowerOperations.sol";
import "../dependencies/CheckContract.sol";

contract BorrowerOperationsLiquidationsTest is BorrowerOperations {

    using SafeMath for uint256;

    IERC20 collToken;
    uint256 public unusedWithdrawalLimit;
    uint public withdrawalLimitThreshould = 100000000000000000000;

    constructor(address _activePool, IERC20 _collToken) {
        activePool = IActivePool(_activePool);
        collToken = _collToken;

        lastWithdrawalTimestamp = block.timestamp - (EXPAND_DURATION);
    }

    function setUnusedWithdrawalLimit(uint256 _newLimit) external {
        unusedWithdrawalLimit = _newLimit;
    }

    function setWithDrawalLimitThreshold(uint256 _newLimit) external {
        withdrawalLimitThreshould = _newLimit;
    }

    function openTrove(
        uint _maxFeePercentage,
        uint _BaseFeeLMAAmount,
        uint _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
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

    function moveWStETHGainToTrove(
        address _borrower,
        address _upperHint,
        address _lowerHint,
        uint _amount
    ) external override {
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

    function closeTrove() external override {
        ITroveManager troveManagerCached = troveManager;
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
    ) internal override {
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
            _handleWithdrawalLimit(_collWithdrawal, true);
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
}
