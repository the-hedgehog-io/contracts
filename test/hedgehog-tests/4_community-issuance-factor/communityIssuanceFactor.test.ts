import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  CommunityIssuance,
  StabilityPoolTester,
  TERC20,
} from "../../../typechain-types";
import { BaseFeeLMAToken } from "../../../typechain-types/contracts";

const { increase: increaseTime } = time;

// Array([aliceGain, bobGain, carolGain, ericGain])
const hogGainSchedule: bigint[][] = [
  [
    ethers.parseEther("1"),
    ethers.parseEther("1"),
    ethers.parseEther("1"),
    ethers.parseEther("1"),
  ],
];

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control", () => {
    let alice: SignerWithAddress, //ultimate admin
      bob: SignerWithAddress,
      carol: SignerWithAddress,
      eric: SignerWithAddress;
    let communityIssuance: CommunityIssuance;
    let stabilityPool: StabilityPoolTester;
    let bfeToken: BaseFeeLMAToken;
    let collToken: TERC20;
    let hogToken: TERC20;

    let currentStep = 0;

    before(async () => {
      [alice, bob, carol, eric] = await ethers.getSigners();
      communityIssuance = await (
        await (await ethers.getContractFactory("CommunityIssuance")).deploy()
      ).waitForDeployment();
      stabilityPool = await (
        await (await ethers.getContractFactory("StabilityPoolTester")).deploy()
      ).waitForDeployment();

      bfeToken = await (
        await (
          await ethers.getContractFactory("BaseFeeLMAToken")
        ).deploy(
          communityIssuance.target,
          stabilityPool.target,
          communityIssuance.target,
          communityIssuance.target
        )
      ).waitForDeployment();

      collToken = await (
        await (
          await ethers.getContractFactory("TERC20")
        ).deploy("CollToken", "COLL", 10000000000000)
      ).waitForDeployment();

      hogToken = await (
        await (
          await ethers.getContractFactory("TERC20")
        ).deploy("HOG Token", "HOG", 10000000000000)
      ).waitForDeployment();

      await collToken.transfer(bob.address, ethers.parseEther("2500000000000"));
      await collToken.transfer(
        carol.address,
        ethers.parseEther("2500000000000")
      );
      await collToken.transfer(
        eric.address,
        ethers.parseEther("2500000000000")
      );
    });

    const depositWithAllAccounts = async (
      amount = ethers.parseEther("2500")
    ) => {
      await expect(stabilityPool.provideToSP(amount)).not.to.be.reverted;
      await expect(stabilityPool.connect(bob).provideToSP(amount)).not.to.be
        .reverted;
      await expect(stabilityPool.connect(carol).provideToSP(amount)).not.to.be
        .reverted;
      await expect(stabilityPool.connect(eric).provideToSP(amount)).not.to.be
        .reverted;
    };

    const claimGainWithAllAccounts = async () => {
      await expect(stabilityPool.withdrawFromSP(0)).not.to.be.reverted;
      await expect(stabilityPool.connect(bob).withdrawFromSP(0)).not.to.be
        .reverted;
      await expect(stabilityPool.connect(carol).withdrawFromSP(0)).not.to.be
        .reverted;
      await expect(stabilityPool.connect(eric).withdrawFromSP(0)).not.to.be
        .reverted;
    };

    const getAllBFEBalances = async () => {
      const aliceBalance = await bfeToken.balanceOf(alice.address);
      const bobBalance = await bfeToken.balanceOf(bob.address);
      const carolBalance = await bfeToken.balanceOf(carol.address);
      const ericBalance = await bfeToken.balanceOf(eric.address);

      return [aliceBalance, bobBalance, carolBalance, ericBalance];
    };

    const getAllHogBalances = async () => {
      const aliceBalance = await hogToken.balanceOf(alice.address);
      const bobBalance = await hogToken.balanceOf(bob.address);
      const carolBalance = await hogToken.balanceOf(carol.address);
      const ericBalance = await hogToken.balanceOf(eric.address);

      return [aliceBalance, bobBalance, carolBalance, ericBalance];
    };

    const compareBalanceUpdateCorrectness = async ({
      balancesBefore,
      balancesAfter,
      isIncrease = true,
    }: {
      balancesBefore: bigint[];
      balancesAfter: bigint[];
      isIncrease?: boolean;
    }) => {
      const expectedDiffs = hogGainSchedule[currentStep];
      if (
        balancesBefore.length !== balancesAfter.length ||
        balancesBefore.length !== expectedDiffs.length
      ) {
        throw "Error: Trying to compare different length arrays";
      }
      for (let i = 0; i < balancesBefore.length; i++) {
        const actualDiff = isIncrease
          ? balancesAfter[i] - balancesBefore[i]
          : balancesBefore[i] - balancesAfter[i];
        expect(actualDiff).to.be.equal(expectedDiffs[i]);
      }
    };

    const executeCurrentStepTxsAndChecks = async () => {
      const balancesBefore = await getAllHogBalances();
      await claimGainWithAllAccounts();
      const balancesAfter = await getAllHogBalances();

      await compareBalanceUpdateCorrectness({
        balancesBefore,
        balancesAfter,
      });
      currentStep++;
    };

    it("should let provide debt tokens to stability pool with a default issuance factor", async () => {
      // Each of 4 users deposit 2.5k tokens

      await depositWithAllAccounts();
    });

    it("should let claim correct amount of HOG after N seconds passed correctly", async () => {
      await increaseTime(100);

      await executeCurrentStepTxsAndChecks();
    });

    it("should not let admin set community issuance factor", async () => {
      await expect(communityIssuance.connect(bob).setISSUANCE_FACTOR(1)).to.be
        .reverted;
    });

    it("should let admin decrease community issuance factor", async () => {
      await expect(communityIssuance.setISSUANCE_FACTOR(1)).not.to.be.reverted;
    });

    it("it should result into 0 hog gains after complete community issuance factor decrease", async () => {
      await increaseTime(100);

      await executeCurrentStepTxsAndChecks();
    });

    it("should let admin increase community issuance factor", async () => {
      // TODO: Update Issuance Factor to be in line with a test suite
      await expect(communityIssuance.setISSUANCE_FACTOR(1)).not.to.be.reverted;
    });

    it("should let claim hog gains instantaneously while taking new issuance factor into account correctly", async () => {
      await increaseTime(100);

      await executeCurrentStepTxsAndChecks();
    });

    it("should let withdraw bfe tokens back", async () => {});
  });
});
