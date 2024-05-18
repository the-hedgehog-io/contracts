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

type ReceiverConfig = {
  addressA: string;
  addressB: string;
  addressC: string;
};

describe("Hedgehog Core Contracts Smoke tests", async () => {
  context("Fees Router Unis Tests", async () => {
    let deployer: SignerWithAddress,
      alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress,
      borrowersOp: SignerWithAddress;
    let feesRouterTester: FeesRouterTester;
    let feesRouter: FeesRouter;
    let activePool: ActivePool;
    let debtToken: TERC20;
    let collToken: TERC20;
    let activePoolTestSetter: ActivePoolTestSetter;

    /**
     * Write complete documentation on how ALL functions work
     * Fees Router contract intends to route fees according to TxDebt / Fee ratio. Fee Router has a config for each 5% range: 0-5, 5-10 and so on. Config stores routes that lead certain percentage of FEE to a consecutive address.
     * Example: Config has a setup to transfer 90% of Fees to Alice and 10% to transfer to bob. If incoming TxDebt is 1000 and fee is 10 - then it is expect that alice receives 9 and bob receives 1 of the token (might be collateral, might be debt depending on the route)
     *
     * SOLIDITY:
     * 1) FIX THE SOLIDITY FORMULA IN CONTRACT THAT LEADS TO INCORRECT OUTCOME YOURSELF

     * 2) WRITE A REVERTING CHECK, THAT WOULD REVERT WHOLE TX IF THERE IS A CONFIG MISSING FOR A CERTAIN RANGE (if range mapping returns address 0 - revert  )
     * How to fix 5.31?
     *
     * 0) Write a typescript Debt & Fee routings. They must be each unique for each range from 0 to 100 (step is 5).
     * 1) Write a function that conveniently sets up range configs for both Debt & Coll function
     * 1) Set up configs for each range from 0 to 100 (step is 5).
     * 2) Write a function that conveniently triggers fees for the given range and performs expects with comparing that balances received correct amounts according to their config. Check config programmatically
     * 3) Trigger all fees for al set ranges. Trigger 2 sets of each debt & coll of fees manually just to be sure
     * 4) Reach 100% coverage in the whole test. Write meaningful tests that would fail correctly for each revert functions
     *
     */

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
      { percentage: 100, amountA: 0, amountB: 50, amountC: 50 },
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
      [deployer, alice, bob, carol, borrowersOp] = await ethers.getSigners();

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
        console.log(config);
      }
      for (const config of collAmountConfigs) {
        await setDebtConfig(
          config.percentage,
          config.amountA,
          config.amountB,
          config.amountC
        );
        // expect(config.amountA).to.be.equal(
        //   (await feesRouter.debtFeeConfigs(config.percentage)).amountA
        // );
        console.log(config);
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
      console.log(await collToken.balanceOf(bob.address), "bobbb");
      await feesRouterTester.triggerDebtFee(debt, fee);
      const balanceAlice = await collToken.balanceOf(alice.address);
      const balanceBob = await collToken.balanceOf(bob.address);
      const balanceCarol = await collToken.balanceOf(carol.address);

      return { balanceAlice, balanceBob, balanceCarol };
    };

    it("should allow to distribute fees to BO addressed account case: 5%", async () => {
      const DEBT = 100000;
      const FEE = 5000;
      const [first, second] = collAmountConfigs;
      const checkingBalance = await triggerConfig(DEBT, FEE);
      expect(checkingBalance).to.not.be.reverted;

      console.log("Alic1", second.amountA);

      // expect(checkingBalance.balanceAlice).to.be.equal(
      //   (FEE * second.amountA) / 100
      // );
    });
    it("should allow the 1% and 2% debts and fees to be allocated to the 5% configuration correctly", async () => {
      const balanceAliceBefore = await collToken.balanceOf(alice.address);
      const configuration = await triggerConfig(10000, 200);
      console.log("Alic2", configuration.balanceAlice);
      expect(configuration.balanceAlice - balanceAliceBefore).to.be.equal(
        (200 * 95) / 100
      );
    });
    it("check Activ", async () => {
      await activePoolTestSetter.increasePayTokenBalance(1000);
      await collToken.balanceOf(alice);
      console.log(
        "123",
        await activePoolTestSetter.increasePayTokenBalance(1000)
      );
      console.log("1", await collToken.balanceOf(alice));
    });
    it("check Debt", async () => {
      const checkDebt = await triggerDebtConfig(100000, 34000);
      console.log("checkDebt", checkDebt);
    });

    it("check modifier", async () => {
      await expect(
        feesRouter.connect(borrowersOp).distributeDebtFee(100000, 34000)
      ).to.be.reverted;
    });
  });
});
