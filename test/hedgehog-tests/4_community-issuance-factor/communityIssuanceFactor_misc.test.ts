import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  BaseFeeLMATokenTester,
  CommunityIssuance,
  StabilityPoolTester,
  TERC20,
} from "../../../typechain-types";

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control", () => {
    let alice: SignerWithAddress, //ultimate admin
      bob: SignerWithAddress;

    let communityIssuance: CommunityIssuance;
    let stabilityPool: StabilityPoolTester;
    let bfeToken: BaseFeeLMATokenTester;
    let hogToken: TERC20;

    before(async () => {
      [alice, bob] = await ethers.getSigners();
      communityIssuance = await (
        await (await ethers.getContractFactory("CommunityIssuance")).deploy()
      ).waitForDeployment();
      stabilityPool = await (
        await (await ethers.getContractFactory("StabilityPoolTester")).deploy()
      ).waitForDeployment();

      bfeToken = await (
        await (
          await ethers.getContractFactory("BaseFeeLMATokenTester")
        ).deploy(
          communityIssuance.target,
          stabilityPool.target,
          communityIssuance.target,
          communityIssuance.target
        )
      ).waitForDeployment();

      hogToken = await (
        await (
          await ethers.getContractFactory("TERC20")
        ).deploy("HOG Token", "HOG", 10000000000000)
      ).waitForDeployment();

      await hogToken.transfer(bob.address, ethers.parseEther("2500000000000"));

      await stabilityPool.setAddresses(
        bfeToken.target,
        bfeToken.target,
        bfeToken.target,
        bfeToken.target,
        bfeToken.target,
        bfeToken.target,
        communityIssuance.target,
        bfeToken.target
      );

      await communityIssuance.setAddresses(
        hogToken.target,
        stabilityPool.target,
        alice.address,
        alice.address
      );
      await bfeToken.transfer(bob.address, ethers.parseEther("2500000000000"));
    });

    it("should not let non-admin account set community issuance factor", async () => {
      await expect(communityIssuance.connect(bob).setISSUANCE_FACTOR(1)).to.be
        .reverted;
    });

    it("should let admin decrease community issuance factor", async () => {
      await expect(communityIssuance.setISSUANCE_FACTOR(1)).not.to.be.reverted;
    });
  });
});
