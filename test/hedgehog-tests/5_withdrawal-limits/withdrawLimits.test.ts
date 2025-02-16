import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import {
  ActivePool,
  BorrowerOperations,
  TERC20,
} from "../../../typechain-types";
import { getSigners, setupContracts } from "../../utils";
import { expect } from "chai";
import timestring from "timestring";
import { getOpenTrove, OpenTrove } from "../../utils/shared";

const { increase } = time;

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Withdrawal functionality. Flow #1", () => {
    let alice: SignerWithAddress;

    let borrowerOperations: BorrowerOperations;
    let payToken: TERC20;

    let openTrove: OpenTrove;

    const firstDeposit = BigInt("1000000000000000000000");
    const secondDeposit = BigInt("10000000000000000000");
    const thirdDeposit = BigInt("80000000000000000000");
    const fourthDeposit = BigInt("1000000000000000000000");

    const firstWithdraw = BigInt("100000000000000000000");
    const secondWithdraw = BigInt("322000000000000000000");
    const thirdWithdraw = BigInt("322000000000000000000");
    const fourthWithdraw = BigInt("110000000000000000000");
    const fifthWithdraw = BigInt("152000000000000000000");
    const sixthWithdraw = BigInt("144960000000000000000");
    const seventhWithdraw = BigInt("74832000000000000000");
    const eighthWithdraw = BigInt("600000000000000000000");
    const ninthWithdraw = BigInt("518000000000000000000");
    const tenthWithdraw = BigInt("50000000000000000000");
    const eleventhWithdraw = BigInt("138926014327856650000");

    before(async () => {
      [alice] = await getSigners({
        fork: false,
      });
      ({ borrowerOperations, payToken } = await setupContracts());

      ({ openTrove } = await getOpenTrove({ payToken, borrowerOperations }));
    });

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

    const decreaseColl = async ({ amount }: { amount: bigint }) => {
      await borrowerOperations.withdrawColl(
        amount,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
    };

    it("should let open the trove (1000): step 1", async () => {
      await openTrove({
        collAmount: firstDeposit,
        baseFeeLMAAmount: debtAmountAlice,
      });
    });

    it("should let withdraw (100): step2", async () => {
      await expect(await decreaseColl({ amount: firstWithdraw })).not.to.be
        .reverted;
    });

    it("should revert if user tries to withdraw more than 80% withdrawable (322): step3", async () => {
      await increase(timestring("1 minutes"));
      await expect(decreaseColl({ amount: secondWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more than 80% of withdrawble in one tx"
      );
    });

    it("should not revert after enough time has passed (322): step4", async () => {
      await increase(timestring("60 minutes"));

      await decreaseColl({ amount: thirdWithdraw }); //521000000000000000000
    });

    it("should revert  if user tries to withdraw more than 80% withdrawable (110): step 5", async () => {
      await increase(timestring("10 minutes"));
      await expect(decreaseColl({ amount: fourthWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more than 80% of withdrawble in one tx"
      );
    });

    it("should not revert after increasing the time by 12 hours(152): step 6", async () => {
      await increase(timestring("12 hours"));
      await expect(decreaseColl({ amount: fifthWithdraw })).not.to.be.reverted;
    });

    it("should not be reverted when the deposit is increased (10): step 7", async () => {
      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: secondDeposit })).not.to.be.reverted;
    });

    it("should not be reverted when the deposit is increased again(80): step 8", async () => {
      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: thirdDeposit })).not.to.be.reverted;
    });

    it("should not revert after increasing the deposit (144,96): step 9", async () => {
      await increase(timestring("1 minute"));
      await expect(decreaseColl({ amount: sixthWithdraw })).not.to.be.reverted;
    });

    it("should not revert (74,8): step 10", async () => {
      await increase(timestring("1 minute"));
      await decreaseColl({ amount: seventhWithdraw });
    });

    it("should not be reverted when the deposit is increased (1000): step 11", async () => {
      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: fourthDeposit })).not.to.be.reverted;
    });

    it("should revert (600): step 12", async () => {
      await increase(timestring("1 minute"));
      await expect(decreaseColl({ amount: eighthWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more than 80% of withdrawble in one tx"
      );
    });

    it("should not revert (518):  step 13", async () => {
      await decreaseColl({ amount: ninthWithdraw });
    });

    it("should not revert (50): step 14", async () => {
      await decreaseColl({ amount: tenthWithdraw });
    });

    it("should revert (138,9):  step 15", async () => {
      await expect(
        decreaseColl({ amount: eleventhWithdraw })
      ).to.be.revertedWith(
        "BO: Cannot withdraw more than 80% of withdrawble in one tx"
      );
    });
  });
});
