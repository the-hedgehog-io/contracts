// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

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

    event TroveCreated(address indexed _borrower, uint arrayIndex);
    event TroveUpdated(
        address indexed _borrower,
        uint _debt,
        uint _coll,
        uint stake,
        uint8 operation
    );
    event BaseFeeLMABorrowingFeePaid(
        address indexed _borrower,
        uint _BaseFeeLMAFee
    );

    // --- Functions ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _baseFeeLMATokenAddress
    ) external;

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

    function moveStETHGainToTrove(
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
}
