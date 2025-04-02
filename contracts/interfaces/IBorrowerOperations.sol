// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

enum BorrowerOperation {
    openTrove,
    closeTrove,
    adjustTrove
}

// Common interface for the Trove Manager.
interface IBorrowerOperations {
    // --- Events ---

    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _activePoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);
    event GasPoolAddressChanged(address _gasPoolAddress);
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event BaseFeeLMATokenAddressChanged(address _baseFeeLMATokenAddress);
    event WStETHTokenAddressChanged(address _WStEthAddress);
    event FeesRouterAddressChanged(address _feesRouter);

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
    event WithdrawalLimitUpdated(uint256 _limit);

    // --- Functions ---

    function openTrove(
        uint _maxFee,
        uint _BaseFeeLMAAmount,
        uint _collAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    function addColl(
        address _upperHint,
        address _lowerHint,
        uint _amount
    ) external;

    function moveWStETHGainToTrove(
        address _user,
        address _upperHint,
        address _lowerHint,
        uint _amount
    ) external;

    function withdrawColl(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function withdrawBaseFeeLMA(
        uint _maxFee,
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function repayBaseFeeLMA(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function closeTrove() external;

    function adjustTrove(
        uint _maxFee,
        uint _collWithdrawal,
        uint _collIncrease,
        uint _debtChange,
        bool isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external;

    function claimCollateral() external;

    function getCompositeDebt(uint _debt) external pure returns (uint);

    function handleWithdrawalLimit(
        uint256 _collWithdrawal,
        bool _isLiquidation
    ) external;
}
