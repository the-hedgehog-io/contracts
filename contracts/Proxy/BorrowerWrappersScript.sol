// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../dependencies/LiquityMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IBorrowerOperations.sol";
import "../interfaces/ITroveManager.sol";
import "../interfaces/IStabilityPool.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IHOGStaking.sol";
import "./BorrowerOperationsScript.sol";
import "./ETHTransferScript.sol";
import "./HOGStakingScript.sol";

contract BorrowerWrappersScript is
    BorrowerOperationsScript,
    ETHTransferScript,
    HOGStakingScript
{
    using SafeMath for uint;

    string public constant NAME = "BorrowerWrappersScript";

    ITroveManager immutable troveManager;
    IStabilityPool immutable stabilityPool;
    IPriceFeed immutable priceFeed;
    IERC20 immutable baseFeeLMAToken;
    IERC20 immutable hogToken;
    IHOGStaking immutable hogStaking;

    constructor(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _hogStakingAddress
    )
        BorrowerOperationsScript(
            IBorrowerOperations(_borrowerOperationsAddress)
        )
        HOGStakingScript(_hogStakingAddress)
    {
        checkContract(_troveManagerAddress);
        ITroveManager troveManagerCached = ITroveManager(_troveManagerAddress);
        troveManager = troveManagerCached;

        IStabilityPool stabilityPoolCached = troveManagerCached.stabilityPool();
        checkContract(address(stabilityPoolCached));
        stabilityPool = stabilityPoolCached;

        IPriceFeed priceFeedCached = troveManagerCached.priceFeed();
        checkContract(address(priceFeedCached));
        priceFeed = priceFeedCached;

        address baseFeeLMATokenCached = address(
            troveManagerCached.baseFeeLMAToken()
        );
        checkContract(baseFeeLMATokenCached);
        baseFeeLMAToken = IERC20(baseFeeLMATokenCached);

        address hogTokenCached = address(troveManagerCached.hogToken());
        checkContract(hogTokenCached);
        hogToken = IERC20(hogTokenCached);

        IHOGStaking hogStakingCached = troveManagerCached.hogStaking();
        require(
            _hogStakingAddress == address(hogStakingCached),
            "BorrowerWrappersScript: Wrong HOGStaking address"
        );
        hogStaking = hogStakingCached;
    }

    function claimCollateralAndOpenTrove(
        uint _maxFee,
        uint _BaseFeeLMAAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        uint balanceBefore = address(this).balance;

        // Claim collateral
        borrowerOperations.claimCollateral();

        uint balanceAfter = address(this).balance;

        // already checked in CollSurplusPool
        assert(balanceAfter > balanceBefore);

        uint totalCollateral = balanceAfter.sub(balanceBefore).add(msg.value);

        // Open trove with obtained collateral, plus collateral sent by user
        borrowerOperations.openTrove(
            _maxFee,
            _BaseFeeLMAAmount,
            totalCollateral,
            _upperHint,
            _lowerHint
        );
    }

    function claimSPRewardsAndRecycle(
        uint _maxFee,
        address _upperHint,
        address _lowerHint
    ) external {
        uint collBalanceBefore = address(this).balance;
        uint hogBalanceBefore = hogToken.balanceOf(address(this));

        // Claim rewards
        stabilityPool.withdrawFromSP(0);

        uint collBalanceAfter = address(this).balance;
        uint hogBalanceAfter = hogToken.balanceOf(address(this));
        uint claimedCollateral = collBalanceAfter.sub(collBalanceBefore);

        // Add claimed ETH to trove, get more BaseFeeLMA and stake it into the Stability Pool
        if (claimedCollateral > 0) {
            _requireUserHasTrove(address(this));
            uint BaseFeeLMAAmount = _getNetBaseFeeLMAAmount(claimedCollateral);
            borrowerOperations.adjustTrove(
                _maxFee,
                0,
                claimedCollateral,
                BaseFeeLMAAmount,
                true,
                _upperHint,
                _lowerHint
            );
            // Provide withdrawn BaseFeeLMA to Stability Pool
            if (BaseFeeLMAAmount > 0) {
                stabilityPool.provideToSP(BaseFeeLMAAmount);
            }
        }

        // Stake claimed HOG
        uint claimedHOG = hogBalanceAfter.sub(hogBalanceBefore);
        if (claimedHOG > 0) {
            hogStaking.stake(claimedHOG);
        }
    }

    function claimStakingGainsAndRecycle(
        uint _maxFee,
        address _upperHint,
        address _lowerHint
    ) external {
        uint collBalanceBefore = address(this).balance;
        uint baseFeeLMABalanceBefore = baseFeeLMAToken.balanceOf(address(this));
        uint hogBalanceBefore = hogToken.balanceOf(address(this));

        // Claim gains
        hogStaking.unstake(0);

        uint gainedCollateral = address(this).balance.sub(collBalanceBefore); // stack too deep issues :'(
        uint gainedBaseFeeLMA = baseFeeLMAToken.balanceOf(address(this)).sub(
            baseFeeLMABalanceBefore
        );

        uint netBaseFeeLMAAmount;
        // Top up trove and get more BaseFeeLMA, keeping ICR constant
        if (gainedCollateral > 0) {
            _requireUserHasTrove(address(this));
            netBaseFeeLMAAmount = _getNetBaseFeeLMAAmount(gainedCollateral);
            borrowerOperations.adjustTrove(
                _maxFee,
                0,
                gainedCollateral,
                netBaseFeeLMAAmount,
                true,
                _upperHint,
                _lowerHint
            );
        }

        uint totalBaseFeeLMA = gainedBaseFeeLMA.add(netBaseFeeLMAAmount);
        if (totalBaseFeeLMA > 0) {
            stabilityPool.provideToSP(totalBaseFeeLMA);

            // Providing to Stability Pool also triggers HOG claim, so stake it if any
            uint hogBalanceAfter = hogToken.balanceOf(address(this));
            uint claimedHOG = hogBalanceAfter.sub(hogBalanceBefore);
            if (claimedHOG > 0) {
                hogStaking.stake(claimedHOG);
            }
        }
    }

    function _getNetBaseFeeLMAAmount(uint _collateral) internal returns (uint) {
        uint price = priceFeed.fetchPrice();
        uint ICR = troveManager.getCurrentICR(address(this), price);

        uint BaseFeeLMAAmount = _collateral.mul(price).div(ICR);
        uint borrowingRate = troveManager.getBorrowingRateWithDecay(0); // TODO: Figure out how is that used // TODO: Passed 0 for now. Check
        uint netDebt = BaseFeeLMAAmount.mul(LiquityMath.DECIMAL_PRECISION).div(
            LiquityMath.DECIMAL_PRECISION.add(borrowingRate)
        );

        return netDebt;
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(
            troveManager.getTroveStatus(_depositor) == 1,
            "BorrowerWrappersScript: caller must have an active trove"
        );
    }
}
