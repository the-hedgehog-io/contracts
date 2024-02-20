// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./IHedgehogBase.sol";
import "./IStabilityPool.sol";
import "./IBaseFeeLMAToken.sol";
import "./IHOGToken.sol";

// Common interface for the Trove Manager.
interface ITroveManager is IHedgehogBase {
    // --- Events ---

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event BaseFeeLMATokenAddressChanged(address _newBaseFeeLMATokenAddress);
    event ActivePoolAddressChanged(address _activePoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);
    event GasPoolAddressChanged(address _gasPoolAddress);
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event HOGTokenAddressChanged(address _hogTokenAddress);

    event Liquidation(
        uint _liquidatedDebt,
        uint _liquidatedColl,
        uint _collGasCompensation,
        uint _BaseFeeLMAGasCompensation
    );
    event Redemption(
        uint _attemptedBaseFeeLMAAmount,
        uint _actualBaseFeeLMAAmount,
        uint _StETHSent,
        uint _StETHFee
    );
    event TroveUpdated(
        address indexed _borrower,
        uint _debt,
        uint _coll,
        uint stake,
        uint8 operation
    );
    event TroveLiquidated(
        address indexed _borrower,
        uint _debt,
        uint _coll,
        uint8 operation
    );
    event BaseRateUpdated(uint _baseRate);
    event LastFeeOpTimeUpdated(uint _lastFeeOpTime);
    event TotalStakesUpdated(uint _newTotalStakes);
    event SystemSnapshotsUpdated(
        uint _totalStakesSnapshot,
        uint _totalCollateralSnapshot
    );
    event LTermsUpdated(uint _L_StETH, uint _L_BaseFeeLMADebt);
    event TroveSnapshotsUpdated(uint _L_StETH, uint _L_BaseFeeLMADebt);
    event TroveIndexUpdated(address _borrower, uint _newIndex);

    // --- Functions ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _baseFeeLMATokenAddress,
        address _sortedTrovesAddress,
        address _hogTokenAddress
    ) external;

    function stabilityPool() external view returns (IStabilityPool);

    function baseFeeLMAToken() external view returns (IBaseFeeLMAToken);

    function hogToken() external view returns (IHOGToken);

    function getTroveOwnersCount() external view returns (uint);

    function getTroveFromTroveOwnersArray(
        uint _index
    ) external view returns (address);

    function getNominalICR(address _borrower) external view returns (uint);

    function getCurrentICR(
        address _borrower,
        uint _price
    ) external view returns (uint);

    function liquidate(address _borrower) external;

    function liquidateTroves(uint _n) external;

    function batchLiquidateTroves(address[] calldata _troveArray) external;

    function redeemCollateral(
        uint _BaseFeeLMAAmount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint _partialRedemptionHintNICR,
        uint _maxIterations,
        uint _maxFee
    ) external;

    function updateStakeAndTotalStakes(
        address _borrower
    ) external returns (uint);

    function updateTroveRewardSnapshots(address _borrower) external;

    function addTroveOwnerToArray(
        address _borrower
    ) external returns (uint index);

    function applyPendingRewards(address _borrower) external;

    function getPendingStETHReward(
        address _borrower
    ) external view returns (uint);

    function getPendingBaseFeeLMADebtReward(
        address _borrower
    ) external view returns (uint);

    function hasPendingRewards(address _borrower) external view returns (bool);

    function getEntireDebtAndColl(
        address _borrower
    )
        external
        view
        returns (
            uint debt,
            uint coll,
            uint pendingBaseFeeLMADebtReward,
            uint pendingStETHReward
        );

    function closeTrove(address _borrower) external;

    function removeStake(address _borrower) external;

    function getRedemptionRate(
        uint _redemptionColl
    ) external view returns (uint);

    function getRedemptionRateWithDecay(
        uint _redemptionColl
    ) external view returns (uint);

    function getRedemptionFeeWithDecay(
        uint _StETHDrawn
    ) external view returns (uint);

    function getBorrowingRate(
        uint _issuedBaseFeeLMA
    ) external view returns (uint);

    function getBorrowingRateWithDecay(
        uint _issuedBaseFeeLMA
    ) external view returns (uint);

    function getBorrowingFee(
        uint BaseFeeLMADebt
    ) external view returns (uint, uint);

    function getBorrowingFeeWithDecay(
        uint _BaseFeeLMADebt
    ) external view returns (uint);

    function updateBaseRateFromBorrowing(uint _baseRate) external;

    function decayBaseRateFromBorrowing() external;

    function getTroveStatus(address _borrower) external view returns (uint);

    function getTroveStake(address _borrower) external view returns (uint);

    function getTroveDebt(address _borrower) external view returns (uint);

    function getTroveColl(address _borrower) external view returns (uint);

    function setTroveStatus(address _borrower, uint num) external;

    function increaseTroveColl(
        address _borrower,
        uint _collIncrease
    ) external returns (uint);

    function decreaseTroveColl(
        address _borrower,
        uint _collDecrease
    ) external returns (uint);

    function increaseTroveDebt(
        address _borrower,
        uint _debtIncrease
    ) external returns (uint);

    function decreaseTroveDebt(
        address _borrower,
        uint _collDecrease
    ) external returns (uint);

    function getTCR(uint _price) external view returns (uint);

    function checkRecoveryMode(uint _price) external view returns (bool);
}
