import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  ActivePool,
  ActivePoolTestSetter,
  FeesRouter,
  FeesRouterTester,
  TERC20,
} from "../../../typechain-types";

const activePoolBalance = ethers.parseEther("1000000000");

type SingleAmountConfig = {
  range: string;
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

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Fees Router Unis Tests", () => {
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

    /**
     * Write complete documentation on how ALL functions work
     * Fees Router contract intends to route fees according to TxDebt / Fee ratio. Fee Router has a config for each 5% range: 0-5, 5-10 and so on. Config stores routes that lead certain percentage of FEE to a consecutive address.
     * Example: Config has a setup to transfer 90% of Fees to Alice and 10% to transfer to bob. If incoming TxDebt is 1000 and fee is 10 - then it is expect that alice receives 9 and bob receives 1 of the token (might be collateral, might be debt depending on the route)
     *
     * SOLIDITY:
     * 1) FIX THE SOLIDITY FORMULA IN CONTRACT THAT LEADS TO INCORRECT OUTCOME YOURSELF
     
     * 2) WRITE A REVERTING CHECK, THAT WOULD REVERT WHOLE TX IF THERE IS A CONFIG MISSING FOR A CERTAIN RANGE (if mapping returns range address 0 - revert  )
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

      await feesRouter.setCollFeeConfig(
        5,
        90,
        10,
        0,
        alice.address,
        bob.address,
        carol.address
      );
    });

    type AmountConfigs = FixedSizeArray<SingleAmountConfig, 20>;
    // TODO: perhaps requires 19 instead of 20 arrays
    const collAmountConfigs: AmountConfigs = [
      {
        range: "0-5",
        amountA: 90,
        amountB: 4,
        amountC: 6,
      },
    ];

    it("should allow to distribute fees to BO addressed account case: 5%", async () => {
      // fails on 5, but works well on 1
      await feesRouterTester.triggerCollFee(
        ethers.parseEther("100"),
        ethers.parseEther("1")
      );

      const receiverConfig: ReceiverConfig = {
        addressA: alice.address,
        addressB: bob.address,
        addressC: carol.address,
      };

      const foo = async (_percentage, _amountA, _amountB, _amountC) => {};

      collAmountConfigs.map(async (config, index) => {
        // TODO: only accept numbers and internally call required function on the contract level
        await foo(index * 5, config.amountA, config.amountB, config.amountC);
      });
    });
  });
});
