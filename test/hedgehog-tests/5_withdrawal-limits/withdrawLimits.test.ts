import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import {
  ActivePool,
  BorrowerOperationsWithdrawalTest,
  TERC20,
} from "../../../typechain-types";
import { getSigners } from "../../utils";
import { expect } from "chai";
import timestring from "timestring";

const { increase } = time;

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Base functionality and Access Control. Flow #1", () => {
    let alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress,
      bill: SignerWithAddress;

    let activePool: ActivePool;
    let borrowerOperations: BorrowerOperationsWithdrawalTest;
    let payToken: TERC20;

    const firstDeposit = BigInt("1000000000000000000000");
    const secondDeposit = BigInt("10000000000000000000");
    const thirdDeposit = BigInt("80000000000000000000");
    const fourthDeposit = BigInt("1000000000000000000000");

    const firstWithdraw = BigInt("100000000000000000000");
    const secondWithdraw = BigInt("521000000000000000000");
    const thirdWithdraw = BigInt("521000000000000000000");
    const fourthWithdraw = BigInt("110000000000000000000");
    const fifthWithdraw = BigInt("227400000000000000000");
    const sixthWithdraw = BigInt("144960000000000000000");
    const seventhWithdraw = BigInt("96640000000000000000");
    const eighthWithdraw = BigInt("650000000000000000000");
    const ninthWithdraw = BigInt("600000000000000000000");
    const tenthWithdraw = BigInt("50000000000000000000");
    const eleventhWithdraw = BigInt("90000000000000000000");

    before(async () => {
      [bob, , , alice, bill, carol] = await getSigners({
        fork: false,
      });

      payToken = await (
        await ethers.getContractFactory("TERC20")
      ).deploy("TesToken", "TST", ethers.parseEther("1500000000"));

      activePool = await (
        await ethers.getContractFactory("ActivePool")
      ).deploy();

      borrowerOperations = await (
        await ethers.getContractFactory("BorrowerOperationsWithdrawalTest")
      ).deploy(activePool.target, payToken.target);

      await activePool.setAddresses(
        borrowerOperations.target,
        borrowerOperations.target,
        borrowerOperations.target,
        borrowerOperations.target,
        payToken.target,
        borrowerOperations.target
      );
    });

    type OpenTroveParams = {
      caller: SignerWithAddress;
      maxFeePercentage: number;
      baseFeeLMAAmount: string | BigNumberish;
      collAmount: string | BigNumberish;
      upperHint: string;
      lowerHint: string;
    };
    const openTrove = async ({
      caller = bob,
      maxFeePercentage = 1,
      baseFeeLMAAmount = "0",
      collAmount = "0",
      upperHint = ethers.ZeroAddress,
      lowerHint = ethers.ZeroAddress,
    }: Partial<OpenTroveParams> = {}) => {
      await payToken
        .connect(caller)
        .approve(await borrowerOperations.getAddress(), collAmount);
      await borrowerOperations
        .connect(caller)
        .openTrove(
          ethers.parseEther(maxFeePercentage.toString()),
          baseFeeLMAAmount,
          collAmount,
          upperHint,
          lowerHint
        );
    };

    type GetCRParams = {
      owner: SignerWithAddress;
    };

    type AdjustTroveParams = {
      caller: SignerWithAddress;
      amount: string | BigNumberish;
      maxFeePercentage: string | BigNumberish;
      upperHint: string;
      lowerHint: string;
    };

    const increaseColl = async ({
      caller = bob,
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

    it("should let open the trove: step 1", async () => {
      await expect(openTrove({ collAmount: firstDeposit })).not.to.be.reverted;
    });

    it("should let withdraw: step2", async () => {
      await expect(await decreaseColl({ amount: firstWithdraw })).not.to.be
        .reverted;
    });

    it("should revert if user tries to withdraw more then 80% withdrawable: step3", async () => {
      await increase(timestring("1 minutes"));
      await expect(decreaseColl({ amount: secondWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more then 80% of withdrawble in one tx"
      );
    });

    it("should not revert after enough time has passed: step4", async () => {
      await increase(timestring("60 minutes"));

      await decreaseColl({ amount: thirdWithdraw });
    });

    it("should revert step 5", async () => {
      await increase(timestring("10 minutes"));
      await expect(decreaseColl({ amount: fourthWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more then 80% of withdrawble in one tx"
      );
    });

    it("should not revert after increasing the time by 12 hours: step 6", async () => {
      await increase(timestring("12 hours"));
      await expect(decreaseColl({ amount: fifthWithdraw })).not.to.be.reverted;
    });

    it("should not be reverted when the deposit is increased: step 7", async () => {
      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: secondDeposit })).not.to.be.reverted;
    });

    it("should not be reverted when the deposit is increased again: step 8", async () => {
      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: thirdDeposit })).not.to.be.reverted;
    });

    it("should not revert after increasing the deposit: step 9", async () => {
      await increase(timestring("1 minute"));
      await expect(decreaseColl({ amount: sixthWithdraw })).not.to.be.reverted;
    });

    it("should not revert: step 10", async () => {
      await increase(timestring("1 minute"));
      await decreaseColl({ amount: seventhWithdraw });
    });

    it("should not be reverted when the deposit is increased: step 11", async () => {
      await increase(timestring("1 minute"));
      await expect(increaseColl({ amount: fourthDeposit })).not.to.be.reverted;
    });

    it("should revert step 12", async () => {
      await increase(timestring("1 minute"));
      await expect(decreaseColl({ amount: eighthWithdraw })).to.be.revertedWith(
        "BO: Cannot withdraw more then 80% of withdrawble in one tx"
      );
    });

    it("should not revert step 13", async () => {
      await decreaseColl({ amount: ninthWithdraw });
    });

    it("should not revert step 14", async () => {
      await decreaseColl({ amount: tenthWithdraw });
    });

    it("should revert step 15", async () => {
      await expect(
        decreaseColl({ amount: eleventhWithdraw })
      ).to.be.revertedWith(
        "BO: Cannot withdraw more then 80% of withdrawble in one tx"
      );
    });
  });
});
