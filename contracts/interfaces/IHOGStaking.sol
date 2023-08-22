// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

interface IHOGStaking {
    // --- Events --

    event HOGTokenAddressSet(address _hogTokenAddress);
    event BaseFeeLMATokenAddressSet(address _baseFeeLMATokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(
        address indexed staker,
        uint BaseFeeLMAGain,
        uint StETHGain
    );
    event F_StETHUpdated(uint _F_StETH);
    event F_BaseFeeLMAUpdated(uint _F_BaseFeeLMA);
    event TotalHOGStakedUpdated(uint _totalHOGStaked);
    event StETHSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(
        address _staker,
        uint _F_StETH,
        uint _F_BaseFeeLMA
    );

    // --- Functions ---

    function setAddresses(
        address _hogTokenAddress,
        address _baseFeeLMATokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external;

    function stake(uint _HOGamount) external;

    function unstake(uint _HOGamount) external;

    function increaseF_StETH(uint _StETHFee) external;

    function increaseF_BaseFeeLMA(uint _HOGFee) external;

    function getPendingStETHGain(address _user) external view returns (uint);

    function getPendingBaseFeeLMAGain(
        address _user
    ) external view returns (uint);
}
