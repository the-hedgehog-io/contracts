import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  ActivePool,
  ActivePoolTestSetter,
  FeesRouter,
  FeesRouterTester,
  TERC20,
} from "../../../typechain-types";
import { expect } from "chai";

const activePoolBalance = ethers.parseEther("1000000000");

type SingleAmountConfig = {
  percentage: number;
  amountA: number;
  amountB: number;
  amountC: number;
};

type Shift<A extends Array<any>> = ((...args: A) => void) extends (
  ...args: [A[0], ...infer R]
) => void
  ? R
  : never;

type GrowExpRev<
  A extends Array<any>,
  N extends number,
  P extends Array<Array<any>>
> = A["length"] extends N
  ? A
  : {
      0: GrowExpRev<[...A, ...P[0]], N, P>;
      1: GrowExpRev<A, N, Shift<P>>;
    }[[...A, ...P[0]][N] extends undefined ? 0 : 1];

type GrowExp<
  A extends Array<any>,
  N extends number,
  P extends Array<Array<any>>
> = A["length"] extends N
  ? A
  : {
      0: GrowExp<[...A, ...A], N, [A, ...P]>;
      1: GrowExpRev<A, N, P>;
    }[[...A, ...A][N] extends undefined ? 0 : 1];

type MapItemType<T, I> = { [K in keyof T]: I };

export type FixedSizeArray<T, N extends number> = N extends 0
  ? []
  : MapItemType<GrowExp<[0], N, []>, T>;

describe("Hedgehog Core Contracts Smoke tests", async () => {
  context("Fees Router Unit Tests", async () => {
    let deployer: SignerWithAddress,
      alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;
    let feesRouterTester: FeesRouterTester;
    let feesRouter: FeesRouter;
    let activePool: ActivePool;
    let debtToken: TERC20;
    let collToken: TERC20;
    let activePoolTestSetter: ActivePoolTestSetter;

    type AmountConfigs = FixedSizeArray<SingleAmountConfig, 21>;
    const collAmountConfigs: AmountConfigs = [
      { percentage: 0, amountA: 100, amountB: 0, amountC: 0 },
      { percentage: 5, amountA: 95, amountB: 2, amountC: 3 },
      { percentage: 10, amountA: 90, amountB: 5, amountC: 5 },
      { percentage: 15, amountA: 85, amountB: 7, amountC: 8 },
      { percentage: 20, amountA: 80, amountB: 10, amountC: 10 },
      { percentage: 25, amountA: 75, amountB: 12, amountC: 13 },
      { percentage: 30, amountA: 70, amountB: 15, amountC: 15 },
      { percentage: 35, amountA: 65, amountB: 17, amountC: 18 },
      { percentage: 40, amountA: 60, amountB: 20, amountC: 20 },
      { percentage: 45, amountA: 55, amountB: 22, amountC: 23 },
      { percentage: 50, amountA: 50, amountB: 25, amountC: 25 },
      { percentage: 55, amountA: 45, amountB: 27, amountC: 28 },
      { percentage: 60, amountA: 40, amountB: 30, amountC: 30 },
      { percentage: 65, amountA: 35, amountB: 32, amountC: 33 },
      { percentage: 70, amountA: 30, amountB: 35, amountC: 35 },
      { percentage: 75, amountA: 25, amountB: 37, amountC: 38 },
      { percentage: 80, amountA: 20, amountB: 40, amountC: 40 },
      { percentage: 85, amountA: 15, amountB: 42, amountC: 43 },
      { percentage: 90, amountA: 10, amountB: 45, amountC: 45 },
      { percentage: 95, amountA: 5, amountB: 47, amountC: 48 },
      { percentage: 100, amountA: 83, amountB: 7, amountC: 10 },
    ];

    const setCollFeeConfig = async (newConfigs: SingleAmountConfig) => {
      await feesRouter.setCollFeeConfig(
        newConfigs.percentage,
        newConfigs.amountA,
        newConfigs.amountB,
        newConfigs.amountC,
        alice.address,
        bob.address,
        carol.address
      );
    };
    const setConfig = async (
      percentage = 0,
      amountA = 100,
      amountB = 0,
      amountC = 0,
      addressA = alice.address,
      addressB = bob.address,
      addressC = carol.address
    ) => {
      await setCollFeeConfig({
        percentage,
        amountA,
        amountB,
        amountC,
      });
    };
    const setDebtFeeConfig = async (newConfigs: SingleAmountConfig) => {
      await feesRouter.setDebtFeeConfig(
        newConfigs.percentage,
        newConfigs.amountA,
        newConfigs.amountB,
        newConfigs.amountC,
        alice.address,
        bob.address,
        carol.address
      );
    };
    const setDebtConfig = async (
      percentage = 0,
      amountA = 100,
      amountB = 0,
      amountC = 0,
      addressA = alice.address,
      addressB = bob.address,
      addressC = carol.address
    ) => {
      await setDebtFeeConfig({
        percentage,
        amountA,
        amountB,
        amountC,
      });
    };

    before(async () => {
      [deployer, alice, bob, carol] = await ethers.getSigners();

      activePool = await (
        await ethers.getContractFactory("ActivePool")
      ).deploy();

      debtToken = await (
        await ethers.getContractFactory("TERC20")
      ).deploy("Test1", "t1", 1000000000);

      collToken = await (
        await ethers.getContractFactory("TERC20")
      ).deploy("Test1", "t1", 1000000000);

      feesRouter = await (
        await ethers.getContractFactory("FeesRouter")
      ).deploy(deployer.address, deployer.address);

      feesRouterTester = await (
        await ethers.getContractFactory("FeesRouterTester")
      ).deploy(feesRouter.target);

      activePoolTestSetter = await (
        await ethers.getContractFactory("ActivePoolTestSetter")
      ).deploy(activePool.target);

      await activePool.setAddresses(
        activePoolTestSetter.target,
        activePoolTestSetter.target,
        activePoolTestSetter.target,
        activePoolTestSetter.target,
        collToken.target,
        feesRouter.target
      );

      await activePoolTestSetter.increasePayTokenBalance(activePoolBalance);
      await collToken.transfer(activePool.target, activePoolBalance);

      await feesRouter.setAddresses(
        activePool.target,
        debtToken.target,
        feesRouterTester.target,
        activePoolTestSetter.target
      );

      for (const config of collAmountConfigs) {
        await setConfig(
          config.percentage,
          config.amountA,
          config.amountB,
          config.amountC
        );
        expect(config.amountA).to.be.equal(
          (await feesRouter.collFeeConfigs(config.percentage)).amountA
        );
      }
      for (const config of collAmountConfigs) {
        await setDebtConfig(
          config.percentage,
          config.amountA,
          config.amountB,
          config.amountC
        );
        expect(config.amountA).to.be.equal(
          (await feesRouter.debtFeeConfigs(config.percentage)).amountA
        );
      }
    });

    const triggerConfig = async (debt: number, fee: number) => {
      await feesRouterTester.triggerCollFee(debt, fee);
      const balanceAlice = await collToken.balanceOf(alice.address);
      const balanceBob = await collToken.balanceOf(bob.address);
      const balanceCarol = await collToken.balanceOf(carol.address);

      return { balanceAlice, balanceBob, balanceCarol };
    };
    const triggerDebtConfig = async (debt: number, fee: number) => {
      await feesRouterTester.triggerDebtFee(debt, fee);
      const balanceAlice = await debtToken.balanceOf(alice.address);
      const balanceBob = await debtToken.balanceOf(bob.address);
      const balanceCarol = await debtToken.balanceOf(carol.address);

      return { balanceAlice, balanceBob, balanceCarol };
    };

    it("should allow to distribute fees to BO addressed account case: 5%", async () => {
      const DEBT = 100000;
      const FEE = 5000;
      const [, second] = collAmountConfigs;
      const checkingBalance = await triggerConfig(DEBT, FEE);
      expect(checkingBalance).to.not.be.reverted;

      expect(checkingBalance.balanceAlice).to.be.equal(
        (FEE * second.amountA) / 100
      );
    });
    it("should allow the 1% and 2% debts and fees to be allocated to the 5% configuration correctly", async () => {
      const DEBT = 100000;
      const FEE = 2000;
      const [, second] = collAmountConfigs;
      const balanceAliceBefore = await collToken.balanceOf(alice.address);

      const configuration = await triggerConfig(DEBT, FEE);

      expect(configuration.balanceAlice - balanceAliceBefore).to.be.equal(
        (FEE * second.amountA) / 100
      );
    });

    it("should allow the transaction to be carried out correctly", async () => {
      const tx = await activePoolTestSetter.increasePayTokenBalance(1000);
      expect(tx).to.not.be.reverted;
    });

    it("should allow to distribute fees to BO addressed account case: 5%", async () => {
      const balanceBobBefore = await debtToken.balanceOf(bob.address);

      const DEBT = 100000;
      const FEE = 34000;
      const checkDebt = await triggerDebtConfig(DEBT, FEE);

      expect(checkDebt.balanceBob - balanceBobBefore).to.be.equal(
        (FEE * 17) / 100
      );
    });

    it("Check: sanity check", async () => {
      await expect(feesRouter.connect(alice).distributeDebtFee(100000, 34000))
        .to.be.reverted;
    });

    it("should reject a call to setAddresses by a non-owner", async () => {
      await expect(
        feesRouter
          .connect(alice)
          .setAddresses(
            activePool.target,
            debtToken.target,
            feesRouterTester.target,
            activePoolTestSetter.target
          )
      ).to.be.reverted;
    });
    it("should reject a call to setConfigs by a non-owner", async () => {
      await expect(
        feesRouter
          .connect(alice)
          .setFeeConfigs(
            ethers.parseEther("95"),
            ethers.parseEther("70"),
            ethers.parseEther("20"),
            ethers.parseEther("10"),
            alice.address,
            bob.address,
            carol.address
          )
      ).to.be.reverted;

      await expect(
        feesRouter
          .connect(alice)
          .setCollFeeConfig(
            ethers.parseEther("95"),
            ethers.parseEther("70"),
            ethers.parseEther("20"),
            ethers.parseEther("10"),
            alice.address,
            bob.address,
            carol.address
          )
      ).to.be.reverted;

      await expect(
        feesRouter
          .connect(alice)
          .setDebtFeeConfig(
            ethers.parseEther("95"),
            ethers.parseEther("70"),
            ethers.parseEther("20"),
            ethers.parseEther("10"),
            alice.address,
            bob.address,
            carol.address
          )
      ).to.be.reverted;
    });

    it("should reject a call to setConfigs by a non-owner", async () => {
      await expect(feesRouter.distributeDebtFee(100000, 34000));
    });
  });
});
