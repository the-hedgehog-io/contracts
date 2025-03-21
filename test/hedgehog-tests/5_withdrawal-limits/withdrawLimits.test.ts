import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { BorrowerOperations, TERC20 } from "../../../typechain-types";
import { getSigners, setupContracts } from "../../utils";
import { expect } from "chai";
import timestring from "timestring";
import { getOpenTrove, OpenTrove } from "../../utils/shared";

const { increase } = time;

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Withdrawal functionality. Flow #1", () => {
    let alice: SignerWithAddress, bob: SignerWithAddress;
    let borrowerOperations: BorrowerOperations;
    let payToken: TERC20;

    let openTrove: OpenTrove;

    // 1000
    const firstDeposit = BigInt("1000000000000000000000");
    // 10
    const secondDeposit = BigInt("10000000000000000000");
    // 80
    const thirdDeposit = BigInt("80000000000000000000");
    // 1000
    const fourthDeposit = BigInt("1000000000000000000000");

    // 100
    const firstWithdraw = BigInt("100000000000000000000");
    // 320
    const secondWithdraw = BigInt("320000000000000000001");
    // 320
    const thirdWithdraw = BigInt("320000000000000000000");
    // 110
    const fourthWithdraw = BigInt("110000000000000000000");
    // 152
    const fifthWithdraw = BigInt("152000000000000000000");
    // 89.9
    const sixthWithdraw = BigInt("89900000000000000000");
    // 18.25
    const seventhWithdraw = BigInt("18250000000000000000");
    // 600
    const eighthWithdraw = BigInt("600000000000000000000");
    // 403.6
    const ninthWithdraw = BigInt("403600000000000000000");
    // 50
    const tenthWithdraw = BigInt("50000000000000000000");
    // 138.92
    const eleventhWithdraw = BigInt("138926014327856650000");

    before(async () => {
      [alice, bob] = await getSigners({
        fork: false,
      });
      ({ borrowerOperations, payToken } = await setupContracts());

      ({ openTrove } = await getOpenTrove({ payToken, borrowerOperations }));
    });

    // 2.000.000.000
    const debtAmountAlice = BigInt("2000000000000000000000000000");

    type AdjustTroveParams = {
      caller: SignerWithAddress;
      amount: string | BigNumberish;
      maxFeePercentage: string | BigNumberish;
      upperHint: string;
      lowerHint: string;
    };

    const increaseColl = async ({
      caller = alice,
      amount = 0,
    }: Partial<AdjustTroveParams> = {}) => {
      await payToken
        .connect(caller)
        .approve(await borrowerOperations.getAddress(), amount);
      await borrowerOperations
        .connect(caller)
        .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amount);
    };

    const decreaseColl = async ({
      amount,
      caller = alice,
    }: {
      amount: bigint;
      caller?: SignerWithAddress;
    }) => {
      await borrowerOperations
        .connect(caller)
        .withdrawColl(amount, ethers.ZeroAddress, ethers.ZeroAddress);
    };

    it("should let open the trove (1000): step 1", async () => {
      const unusedLimitBeforeOpenTrove =
        await borrowerOperations.unusedWithdrawalLimit();
      await openTrove({
        collAmount: firstDeposit,
        baseFeeLMAAmount: debtAmountAlice,
      });

      const unusedLimitAfterOpenTrove =
        await borrowerOperations.unusedWithdrawalLimit();
      expect(
        unusedLimitAfterOpenTrove - unusedLimitBeforeOpenTrove
      ).to.be.equal(firstDeposit / BigInt("2"));
    });

    it("should let withdraw (100): step2", async () => {
      // User has to wait EXPAND_DURATION (720 mins) after the deposit to withdraw funds
      await increase(timestring("721 minutes"));

      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      await expect(await decreaseColl({ amount: firstWithdraw })).not.to.be
        .reverted;

      const unusedLimitAfterDecrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitBeforeWithdrawal - unusedLimitAfterDecrease
      ).to.be.equal(firstWithdraw);
    });

    it("should revert if user tries to withdraw more than 80% withdrawable (320): step3", async () => {
      await increase(timestring("1 minutes"));
      await expect(decreaseColl({ amount: secondWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more than 80% of withdrawable in one tx"
      );
    });

    // actually here nothing changes - waiting doesn't increase the limit
    it("should not revert after enough time has passed (320): step4", async () => {
      await increase(timestring("60 minutes"));

      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      await decreaseColl({ amount: thirdWithdraw });

      const unusedLimitAfterDecrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitBeforeWithdrawal - unusedLimitAfterDecrease
      ).to.be.equal(thirdWithdraw);
    });

    it("should revert  if user tries to withdraw more than 80% withdrawable (110): step 5", async () => {
      await increase(timestring("10 minutes"));
      await expect(decreaseColl({ amount: fourthWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more than 80% of withdrawable in one tx"
      );
    });

    it("should not revert after increasing the time by 12 hours(152): step 6", async () => {
      await increase(timestring("12 hours"));

      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      await expect(decreaseColl({ amount: fifthWithdraw })).not.to.be.reverted;

      const unusedLimitAfterDecrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitBeforeWithdrawal - unusedLimitAfterDecrease
      ).to.be.equal(BigInt("13000000000000000000"));
    });

    it("should not be reverted when the deposit is increased (10): step 7", async () => {
      const unusedLimitBeforeIncrease =
        await borrowerOperations.unusedWithdrawalLimit();

      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: secondDeposit })).not.to.be.reverted;

      const unusedLimitAfterIncrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitAfterIncrease - unusedLimitBeforeIncrease
      ).that.be.equal(secondDeposit / BigInt("2"));
    });

    it("should not be reverted when the deposit is increased again(80): step 8", async () => {
      const unusedLimitBeforeIncrease =
        await borrowerOperations.unusedWithdrawalLimit();

      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: thirdDeposit })).not.to.be.reverted;

      const unusedLimitAfterIncrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitAfterIncrease - unusedLimitBeforeIncrease
      ).that.be.equal(thirdDeposit / BigInt("2"));
    });

    it("should not revert after increasing the deposit (89,9): step 9", async () => {
      await increase(timestring("1 minute"));

      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      await expect(decreaseColl({ amount: sixthWithdraw })).not.to.be.reverted;

      const unusedLimitAfterDecrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitBeforeWithdrawal - unusedLimitAfterDecrease
      ).to.be.equal(BigInt("89441826000000000000"));
    });

    it("should not revert (18,25): step 10", async () => {
      await increase(timestring("1 minute"));

      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      await decreaseColl({ amount: seventhWithdraw });

      const unusedLimitAfterDecrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitBeforeWithdrawal - unusedLimitAfterDecrease
      ).to.be.equal(BigInt(BigInt("17985812775340000000")));
    });

    it("should not be reverted when the deposit is increased (1000): step 11", async () => {
      const unusedLimitBeforeIncrease =
        await borrowerOperations.unusedWithdrawalLimit();

      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: fourthDeposit })).not.to.be.reverted;

      const unusedLimitAfterIncrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitAfterIncrease - unusedLimitBeforeIncrease
      ).that.be.equal(fourthDeposit / BigInt("2"));
    });

    it("should revert (600): step 12", async () => {
      // User has to wait EXPAND_DURATION after the deposit to withdraw funds
      await increase(timestring("721 minutes"));
      await expect(decreaseColl({ amount: eighthWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more than 80% of withdrawable in one tx"
      );
    });

    it("should not revert (403,6):  step 13", async () => {
      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      await decreaseColl({ amount: ninthWithdraw });

      const unusedLimitAfterDecrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitBeforeWithdrawal - unusedLimitAfterDecrease
      ).to.be.equal(BigInt("400047361224660000000"));
    });

    it("should not revert (50): step 14", async () => {
      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      await decreaseColl({ amount: tenthWithdraw });

      const unusedLimitAfterDecrease =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitBeforeWithdrawal - unusedLimitAfterDecrease
      ).to.be.equal(BigInt(BigInt("49992428000000000000")));
    });

    it("should revert (138,92):  step 15", async () => {
      await expect(
        decreaseColl({ amount: eleventhWithdraw })
      ).to.be.revertedWith(
        "BO: Cannot withdraw more than 80% of withdrawable in one tx"
      );
    });

    it("should allow to open new trove for bob (1000), step 16", async () => {
      const unusedLimitBeforeOpenTrove =
        await borrowerOperations.unusedWithdrawalLimit();

      await openTrove({
        caller: bob,
        collAmount: firstDeposit,
        baseFeeLMAAmount: debtAmountAlice / BigInt(2),
      });

      const unusedLimitAfterOpenTrove =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitAfterOpenTrove - unusedLimitBeforeOpenTrove
      ).to.be.equal(firstDeposit / BigInt("2"));
    });

    it("should revert (if withdrawalAmount = 0):  step 17", async () => {
      await expect(
        decreaseColl({
          amount: BigInt("0"),
        })
      ).to.be.revertedWith(
        "BorrowerOps: There must be either a collateral change or a debt change"
      );
    });

    it("should revert (if timelock less 59):  step 18", async () => {
      await increase(timestring("59 minutes"));

      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();
      const limit =
        (unusedLimitBeforeWithdrawal * BigInt("80")) / BigInt("100");

      await expect(
        decreaseColl({
          caller: bob,
          amount: limit,
        })
      ).to.be.revertedWithCustomError(
        borrowerOperations,
        "WithdrawalRequestedTooSoonAfterDeposit"
      );
    });

    it("should not revert (if withdrawalAmount 80% unusedLimit):  step 19", async () => {
      await increase(timestring("720 minutes"));

      const unusedLimitBeforeWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      const limit =
        (unusedLimitBeforeWithdrawal * BigInt("80")) / BigInt("100");
      await expect(
        decreaseColl({
          caller: bob,
          amount: limit,
        })
      ).not.to.be.reverted;

      const unusedLimitAfterWithdrawal =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(
        unusedLimitBeforeWithdrawal - unusedLimitAfterWithdrawal
      ).to.be.equal(BigInt("236846658400000000000"));
    });
  });
});
