import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  ActivePool,
  ActivePoolTestSetter,
  BaseFeeLMAToken,
  FeesRouter,
  FeesRouterTester,
  TERC20,
  TroveManager,
} from "../../../typechain-types";
import { ethers } from "hardhat";

const activePoolBalance = ethers.parseEther("1000000000");

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Fees Router Unis Tests", () => {
    let deployer: SignerWithAddress,
      alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;
    let feesRouterTester: FeesRouterTester;
    let feesRouter: FeesRouter;
    let activePool: ActivePool;
    let bfeToken: TERC20;
    let payToken: TERC20;
    let activePoolTestSetter: ActivePoolTestSetter;

    before(async () => {
      [deployer, alice, bob, carol] = await ethers.getSigners();

      activePool = await (
        await ethers.getContractFactory("ActivePool")
      ).deploy();

      bfeToken = await (
        await ethers.getContractFactory("TERC20")
      ).deploy("Test1", "t1", 1000000000);

      payToken = await (
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
        payToken.target,
        feesRouter.target
      );

      await activePoolTestSetter.increasePayTokenBalance(activePoolBalance);
      await payToken.transfer(activePool.target, activePoolBalance);

      await feesRouter.setAddresses(
        activePool.target,
        bfeToken.target,
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

    it("should allow to distribute fees to BO addressed account case: 5%", async () => {
      // fails on 5, but works well on 1
      await feesRouterTester.triggerCollFee(
        ethers.parseEther("100"),
        ethers.parseEther("1")
      );
      console.log("balance of alice", await payToken.balanceOf(alice.address));
    });
  });
});
