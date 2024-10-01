import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import {
  BorrowerOperationsLiquidationsTest,
  StabilityPoolTester__factory,
  TERC20,
  TroveManagerTest,
} from "../../../typechain-types";
import { expect } from "chai";
import {
  getSigners,
  setupContracts,
} from "../../utils/shared/helpers-liquidations-utils/index";

import {
  ActivePool,
  BaseFeeLMAToken,
  DefaultPool,
  HintHelpers,
  StabilityPool,
} from "../../../typechain-types/contracts";

import {
  AdjustTroveParamsToBorrowerOperations,
  OpenTrove,
  RedeemCollateral,
  getOpenTrove,
  redeem,
} from "../../utils/shared";
import { baseFeeLmaTokenTestSol } from "../../../typechain-types/contracts/helpers";

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Base functionality and Access Control. Flow #1", () => {
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let dave: SignerWithAddress;
    let activePool: ActivePool;
    let stabilityPool: StabilityPool;
    let troveManager: TroveManagerTest;
    let hintHelpers: HintHelpers;
    let borrowerOperations: BorrowerOperationsLiquidationsTest;
    let baseFeeLMAToken: BaseFeeLMAToken;
    let payToken: TERC20;
    let defaultPool: DefaultPool;
    let openTrove: OpenTrove;
    let redeemCollateral: RedeemCollateral;
    let troveCollIncrease: AdjustTroveParamsToBorrowerOperations;

    before(async () => {
      [alice, , , dave, bob, carol] = await getSigners({
        fork: false,
      });
      ({
        troveManager,
        activePool,
        baseFeeLMAToken,
        borrowerOperations,
        hintHelpers,
        payToken,
        stabilityPool,
        defaultPool,
      } = await setupContracts());

      ({ openTrove } = await getOpenTrove({
        payToken,
        borrowerOperations,
      }));

      ({ redeemCollateral } = await redeem({ hintHelpers, troveManager }));
    });

    context("5.1 Liquidations Are Blocked From Withdrawal Limit", async () => {
      it("should let open the trove for Alice", async () => {
        const collAmount = BigInt("400000000000000000000");

        expect(await openTrove({ caller: alice, collAmount: collAmount })).not
          .to.be.reverted;
      });

      it("the test should allow the unused withdrawal limit to be set correctly", async () => {
        const newUnusedLimit = BigInt("350000000000000000000");
        await borrowerOperations.setUnusedWithdrawalLimit(newUnusedLimit);
        expect(await borrowerOperations.unusedWithdrawalLimit()).to.be.equal(
          newUnusedLimit
        );
      });

      it("should prevent the withdrawal of more tokens than FullLimit", async () => {
        const amountWithdrawal = BigInt("400000000000000000000");

        await borrowerOperations.withdrawColl(
          amountWithdrawal,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );
      });
    });

    context(
      "5.2 Closing a Trove Does Not Update the Withdrawal Limit",
      async () => {
        it("should let another user(bob) open a position", async () => {
          const collAmount = BigInt("300000000000000000000");

          expect(await openTrove({ caller: bob, collAmount: collAmount })).not
            .to.be.reverted;
        });

        it("should update the withdrawal limit after closing a position for Bob", async () => {
          const withdrawalLimitBeforeCloseTrove =
            await borrowerOperations.unusedWithdrawalLimit();

          await borrowerOperations.connect(bob).closeTrove();

          const withdrawalLimitAfterCloseTrove =
            await borrowerOperations.unusedWithdrawalLimit();

          expect(withdrawalLimitBeforeCloseTrove).not.to.be.equal(
            withdrawalLimitAfterCloseTrove
          );
        });
      }
    );

    context(
      "5.3 Double Counting of Full Redemptions in Withdrawal Limit Calculation",
      async () => {
        it("should allow you to open a trove for Dave", async () => {
          const baseFeeLMAAmountForDave = BigInt("10000000000000000000");
          const collAmountForDave = BigInt("15000000000000000000");
          expect(
            await openTrove({
              caller: dave,
              baseFeeLMAAmount: baseFeeLMAAmountForDave,
              collAmount: collAmountForDave,
            })
          ).not.to.be.reverted;
        });

        it("should allow dave to redeem collateral", async () => {
          console.log("actPool", await activePool.getWStETH());
          console.log("fee", await baseFeeLMAToken.balanceOf(dave));
          console.log("unus", await borrowerOperations.unusedWithdrawalLimit());
          await redeemCollateral({ caller: dave });
          console.log("actPool", await activePool.getWStETH());
          console.log("fee", await baseFeeLMAToken.balanceOf(dave));
          console.log("unus", await borrowerOperations.unusedWithdrawalLimit());
        });
      }
    );

    context("5.4 Limit Can Exceed Active Collateral", async () => {
      it("should allow to reopen the position for Bob", async () => {
        const collAmount = BigInt("100000000000000000000");

        expect(await openTrove({ caller: bob, collAmount: collAmount })).not.to
          .be.reverted;
        const unusedLimit = await borrowerOperations.unusedWithdrawalLimit();
      });

      it("should correctly update unused withdrawal limit after collateral withdrawal", async () => {
        const unusedLimitBeforeWithdrawColl =
          await borrowerOperations.unusedWithdrawalLimit();

        await borrowerOperations.setWithDrawalLimitThreshold(
          BigInt("800000000000000000000")
        );

        await borrowerOperations
          .connect(alice)
          .withdrawColl(
            BigInt("350000000000000000000"),
            ethers.ZeroAddress,
            ethers.ZeroAddress
          );
        const unusedLimitAfterWithdrawColl =
          await borrowerOperations.unusedWithdrawalLimit();

        expect(unusedLimitBeforeWithdrawColl).to.be.greaterThan(
          unusedLimitAfterWithdrawColl
        );
      });
    });

    context(
      "5.5 Liquidations Update Withdrawal Limit in an Inconsistent Way",
      async () => {
        it("should update the limit correctly", async () => {
          console.log(await borrowerOperations.unusedWithdrawalLimit());
          console.log(await payToken.balanceOf(alice));
          const amount = BigInt("1000000000000000000");
          const troveArray = [alice];

          await payToken.connect(dave).approve(borrowerOperations, amount);
          await borrowerOperations
            .connect(dave)
            .moveWStETHGainToTrove(
              alice,
              ethers.ZeroAddress,
              ethers.ZeroAddress,
              amount
            );
          console.log(await borrowerOperations.unusedWithdrawalLimit());
          console.log(await payToken.balanceOf(alice));
        });
      }
    );

    context("5.6 Withdrawal Limit Does Not Track Collateral", async () => {
      it("should allow you to reduce the number of activePools", async () => {
        const activePoolBeforeWithdraw = await activePool.getWStETH();
        console.log(activePoolBeforeWithdraw);
        const decreaseActivePool = BigInt("67000000000000000000");
        await borrowerOperations
          .connect(bob)
          .withdrawColl(
            decreaseActivePool,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          );
        const activePoolAfterWithdraw = await activePool.getWStETH();
        expect(activePoolAfterWithdraw).to.be.equal(
          activePoolBeforeWithdraw - decreaseActivePool
        );
      });

      it("should correctly set the withdrawal limit when adding collateral", async () => {
        const amountActivePool = await activePool.getWStETH();

        await borrowerOperations.setUnusedWithdrawalLimit(amountActivePool);
        await borrowerOperations.setWithDrawalLimitThreshold(amountActivePool);

        const collIncrease = BigInt("2000000000000000000");

        await payToken
          .connect(alice)
          .approve(await borrowerOperations.getAddress(), collIncrease);

        await borrowerOperations
          .connect(alice)
          .addColl(ethers.ZeroAddress, ethers.ZeroAddress, collIncrease);

        const unusedLimitAfterIncrease =
          await borrowerOperations.unusedWithdrawalLimit(); // (99)*75% + (2)*75% = 75.75
        expect(unusedLimitAfterIncrease).to.be.equal(
          BigInt("50500000000000000000")
        );
      });

      it("should reset the withdrawal limit correctly when withdrawing collateral", async () => {
        const newLimitThreshold = await activePool.getWStETH();
        await borrowerOperations.setWithDrawalLimitThreshold(newLimitThreshold);

        const newUnusedLimit = BigInt("50000000000000000000");
        await borrowerOperations.setUnusedWithdrawalLimit(newUnusedLimit);

        const amountWithdrawal = BigInt("30000000000000000000");
        await borrowerOperations.withdrawColl(
          amountWithdrawal,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );

        const unusedLimitAfterWithdraw =
          await borrowerOperations.unusedWithdrawalLimit();
        expect(unusedLimitAfterWithdraw).not.to.be.equal(newLimitThreshold);
      });

      it("should correctly distribute rewards", async () => {
        const newLimitThreshold = await activePool.getWStETH();

        await borrowerOperations.setWithDrawalLimitThreshold(newLimitThreshold);

        const newUnusedLimit = BigInt("50000000000000000000");
        await borrowerOperations.setUnusedWithdrawalLimit(newUnusedLimit);

        await troveManager.applyPendingRewards(alice.address);

        const unusedLimitAfterRewards =
          await borrowerOperations.unusedWithdrawalLimit();

        expect(unusedLimitAfterRewards).not.to.be.equal(newUnusedLimit);
      });

      it("should update collateral when moving WStETH gain to trove", async () => {
        const newLimitThreshold = await activePool.getWStETH();
        await borrowerOperations.setWithDrawalLimitThreshold(newLimitThreshold);

        const newUnusedLimit = BigInt("50000000000000000000");
        await borrowerOperations.setUnusedWithdrawalLimit(newUnusedLimit);

        const amountToSP = BigInt("10000000000000000000");

        await payToken
          .connect(alice)
          .approve(borrowerOperations.target, amountToSP);
        await borrowerOperations
          .connect(alice)
          .moveWStETHGainToTrove(
            alice.address,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            amountToSP
          );
        const unusedLimitAfterMoveToSP =
          await borrowerOperations.unusedWithdrawalLimit();

        expect(unusedLimitAfterMoveToSP).to.be.equal(
          newUnusedLimit + amountToSP
        );
      });
    });
    context("5.7 Withdrawal Limit Reset on Collateral Deposits", async () => {
      it("should increase the withdrawal limit after the deposit has been made", async () => {
        await borrowerOperations.setUnusedWithdrawalLimit(0);

        const addCollateral = BigInt("10000000000000000000");

        await payToken
          .connect(alice)
          .approve(borrowerOperations.target, addCollateral);
        await borrowerOperations.addColl(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          addCollateral
        );
        const unusedLimitAfter =
          await borrowerOperations.unusedWithdrawalLimit();
        const activePoolBeforeAfter = await activePool.getWStETH();

        expect(unusedLimitAfter).to.be.equal(
          (activePoolBeforeAfter * BigInt(3)) / BigInt(4)
        );

        await payToken
          .connect(alice)
          .approve(borrowerOperations.target, addCollateral);
        await borrowerOperations.addColl(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          addCollateral
        );
        const unusedLimitAfterSecondAdd =
          await borrowerOperations.unusedWithdrawalLimit();
        const activePoolBeforeAfterSecondAdd = await activePool.getWStETH();
      });
    });

    context("5.8 Reducing Fees by Splitting Transactions", async () => {
      it("should allow to split redeemCollateral into small parts with the correct rate", async () => {
        const checkFirstPartRate =
          await troveManager.checkUpdateRedemptionBaseRateFromRedemption(
            BigInt("30000000000000000000")
          );
        const checkSecondPartRate =
          await troveManager.checkUpdateRedemptionBaseRateFromRedemption(
            BigInt("50000000000000000000")
          );
        const checkThirdPartRate =
          await troveManager.checkUpdateRedemptionBaseRateFromRedemption(
            BigInt("20000000000000000000")
          );
        const allRate =
          await troveManager.checkUpdateRedemptionBaseRateFromRedemption(
            BigInt("100000000000000000000")
          );
        expect(allRate).to.be.equal(
          checkFirstPartRate + checkSecondPartRate + checkThirdPartRate
        );
      });
    });
    context(
      "5.12 Withdrawal Threshold Can Be Circumvented by Splitting Transactions",
      async () => {
        it("should not allow to withdraw more than 80% of the limit at a time", async () => {
          const activePoolNow = await activePool.getWStETH();
          await borrowerOperations.setWithDrawalLimitThreshold(
            activePoolNow - BigInt("10000000")
          );
          const singleTxWithdrawable = BigInt("100000000000000000000");
          const withdrawableAmount =
            (singleTxWithdrawable * BigInt(4)) / BigInt(5) + BigInt("1");
          await borrowerOperations.setUnusedWithdrawalLimit(
            singleTxWithdrawable
          );

          await expect(
            borrowerOperations.withdrawColl(
              withdrawableAmount,
              ethers.ZeroAddress,
              ethers.ZeroAddress
            )
          ).to.be.revertedWith(
            "BO: Cannot withdraw more then 80% of withdrawble in one tx"
          );
        });
        it("allows you to withdraw the amount in two small installments ", async () => {
          const singleTxWithdrawable = BigInt("100000000000000000000");
          const quarterWithdrawableAmount =
            ((singleTxWithdrawable * BigInt(4)) / BigInt(5) + BigInt("1")) /
            BigInt(4);

          await expect(
            borrowerOperations.withdrawColl(
              quarterWithdrawableAmount,
              ethers.ZeroAddress,
              ethers.ZeroAddress
            )
          ).not.to.be.reverted;

          await expect(
            borrowerOperations.withdrawColl(
              quarterWithdrawableAmount,
              ethers.ZeroAddress,
              ethers.ZeroAddress
            )
          ).not.to.be.reverted;
        });
      }
    );
  });
});
