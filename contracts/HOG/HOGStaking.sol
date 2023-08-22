// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dependencies/BaseMath.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../dependencies/CheckContract.sol";
import "../dependencies/console.sol";
import "../interfaces/IHOGToken.sol";
import "../interfaces/IHOGStaking.sol";
import "../dependencies/LiquityMath.sol";
import "../interfaces/IBaseFeeLMAToken.sol";

contract HOGStaking is Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "HOGStaking";

    mapping(address => uint) public stakes;
    uint public totalHOGStaked;

    uint public F_StETH; // Running sum of StETH fees per-HOG-staked
    uint public F_BaseFeeLMA; // Running sum of HOG fees per-HOG-staked

    // User snapshots of F_StETH and F_BaseFeeLMA, taken at the point at which their latest deposit was made
    mapping(address => Snapshot) public snapshots;

    struct Snapshot {
        uint F_StETH_Snapshot;
        uint F_BaseFeeLMA_Snapshot;
    }

    IHOGToken public hogToken;
    IBaseFeeLMAToken public baseFeeLMAToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Events ---

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
    ) external onlyOwner {
        checkContract(_hogTokenAddress);
        checkContract(_baseFeeLMATokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        hogToken = IHOGToken(_hogTokenAddress);
        baseFeeLMAToken = IBaseFeeLMAToken(_baseFeeLMATokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        emit HOGTokenAddressSet(_hogTokenAddress);
        emit HOGTokenAddressSet(_baseFeeLMATokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated StETH and BaseFeeLMA gains to them.
    function stake(uint _HOGamount) external {
        _requireNonZeroAmount(_HOGamount);

        uint currentStake = stakes[msg.sender];

        uint StETHGain;
        uint BaseFeeLMAGain;
        // Grab any accumulated StETH and BaseFeeLMA gains from the current stake
        if (currentStake != 0) {
            StETHGain = _getPendingStETHGain(msg.sender);
            BaseFeeLMAGain = _getPendingBaseFeeLMAGain(msg.sender);
        }

        _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_HOGamount);

        // Increase user’s stake and total HOG staked
        stakes[msg.sender] = newStake;
        totalHOGStaked = totalHOGStaked.add(_HOGamount);
        emit TotalHOGStakedUpdated(totalHOGStaked);

        // Transfer HOG from caller to this contract
        hogToken.sendToHOGStaking(msg.sender, _HOGamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, BaseFeeLMAGain, StETHGain);

        // Send accumulated BaseFeeLMA and StETH gains to the caller
        if (currentStake != 0) {
            baseFeeLMAToken.transfer(msg.sender, BaseFeeLMAGain);
            _sendStETHGainToUser(StETHGain);
        }
    }

    // Unstake the HOG and send the it back to the caller, along with their accumulated BaseFeeLMA & StETH gains.
    // If requested amount > stake, send their entire stake.
    function unstake(uint _HOGamount) external {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated StETH and BaseFeeLMA gains from the current stake
        uint StETHGain = _getPendingStETHGain(msg.sender);
        uint BaseFeeLMAGain = _getPendingBaseFeeLMAGain(msg.sender);

        _updateUserSnapshots(msg.sender);

        if (_HOGamount > 0) {
            uint HOGToWithdraw = LiquityMath._min(_HOGamount, currentStake);

            uint newStake = currentStake.sub(HOGToWithdraw);

            // Decrease user's stake and total HOG staked
            stakes[msg.sender] = newStake;
            totalHOGStaked = totalHOGStaked.sub(HOGToWithdraw);
            emit TotalHOGStakedUpdated(totalHOGStaked);

            // Transfer unstaked HOG to user
            hogToken.transfer(msg.sender, HOGToWithdraw);

            emit StakeChanged(msg.sender, newStake);
        }

        emit StakingGainsWithdrawn(msg.sender, BaseFeeLMAGain, StETHGain);

        // Send accumulated BaseFeeLMA and StETH gains to the caller
        baseFeeLMAToken.transfer(msg.sender, BaseFeeLMAGain);
        _sendStETHGainToUser(StETHGain);
    }

    // --- Reward-per-unit-staked increase functions. Called by Liquity core contracts ---

    function increaseF_StETH(uint _StETHFee) external {
        _requireCallerIsTroveManager();
        uint StETHFeePerHOGStaked;

        if (totalHOGStaked > 0) {
            StETHFeePerHOGStaked = _StETHFee.mul(DECIMAL_PRECISION).div(
                totalHOGStaked
            );
        }

        F_StETH = F_StETH.add(StETHFeePerHOGStaked);
        emit F_StETHUpdated(F_StETH);
    }

    function increaseF_BaseFeeLMA(uint _BaseFeeLMAFee) external {
        _requireCallerIsBorrowerOperations();
        uint BaseFeeLMAFeePerHOGStaked;

        if (totalHOGStaked > 0) {
            BaseFeeLMAFeePerHOGStaked = _BaseFeeLMAFee
                .mul(DECIMAL_PRECISION)
                .div(totalHOGStaked);
        }

        F_BaseFeeLMA = F_BaseFeeLMA.add(BaseFeeLMAFeePerHOGStaked);
        emit F_BaseFeeLMAUpdated(F_BaseFeeLMA);
    }

    // --- Pending reward functions ---

    function getPendingStETHGain(address _user) external view returns (uint) {
        return _getPendingStETHGain(_user);
    }

    function _getPendingStETHGain(address _user) internal view returns (uint) {
        uint F_StETH_Snapshot = snapshots[_user].F_StETH_Snapshot;
        uint StETHGain = stakes[_user].mul(F_StETH.sub(F_StETH_Snapshot)).div(
            DECIMAL_PRECISION
        );
        return StETHGain;
    }

    function getPendingBaseFeeLMAGain(
        address _user
    ) external view returns (uint) {
        return _getPendingBaseFeeLMAGain(_user);
    }

    function _getPendingBaseFeeLMAGain(
        address _user
    ) internal view returns (uint) {
        uint F_BaseFeeLMA_Snapshot = snapshots[_user].F_BaseFeeLMA_Snapshot;
        uint BaseFeeLMAGain = stakes[_user]
            .mul(F_BaseFeeLMA.sub(F_BaseFeeLMA_Snapshot))
            .div(DECIMAL_PRECISION);
        return BaseFeeLMAGain;
    }

    // --- Internal helper functions ---

    function _updateUserSnapshots(address _user) internal {
        snapshots[_user].F_StETH_Snapshot = F_StETH;
        snapshots[_user].F_BaseFeeLMA_Snapshot = F_BaseFeeLMA;
        emit StakerSnapshotsUpdated(_user, F_StETH, F_BaseFeeLMA);
    }

    function _sendStETHGainToUser(uint StETHGain) internal {
        emit StETHSent(msg.sender, StETHGain);
        (bool success, ) = msg.sender.call{value: StETHGain}("");
        require(success, "HOGStaking: Failed to send accumulated StETHGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "HOGStaking: caller is not TroveM"
        );
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "HOGStaking: caller is not BorrowerOps"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "HOGStaking: caller is not ActivePool"
        );
    }

    function _requireUserHasStake(uint currentStake) internal pure {
        require(
            currentStake > 0,
            "HOGStaking: User must have a non-zero stake"
        );
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, "HOGStaking: Amount must be non-zero");
    }

    receive() external payable {
        _requireCallerIsActivePool();
    }
}
