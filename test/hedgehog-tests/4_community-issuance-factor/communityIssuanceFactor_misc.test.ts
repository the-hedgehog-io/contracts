import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  BaseFeeLMATokenTester,
  CommunityIssuance,
  StabilityPoolTester,
  TERC20,
} from "../../../typechain-types";

const { increase: increaseTime } = time;

// Array([aliceGain, bobGain, carolGain, ericGain])
const hogGainSchedule: bigint[][] = [
  [ethers.parseEther("1")],
  [ethers.parseEther("1")],
  [ethers.parseEther("1"), ethers.parseEther("1")],
];

const factorSteps: string[] = ["999998681227695000"];

const timeSteps: number[] = [0];

const suppCapSteps: string[] = ["1000000000000000000000000"];

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control", () => {
    let alice: SignerWithAddress, //ultimate admin
      bob: SignerWithAddress,
      carol: SignerWithAddress,
      eric: SignerWithAddress;
    let communityIssuance: CommunityIssuance;
    let stabilityPool: StabilityPoolTester;
    let bfeToken: BaseFeeLMATokenTester;
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
          await ethers.getContractFactory("BaseFeeLMATokenTester")
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

      await hogToken.transfer(bob.address, ethers.parseEther("2500000000000"));
      await hogToken.transfer(
        carol.address,
        ethers.parseEther("2500000000000")
      );
      await hogToken.transfer(eric.address, ethers.parseEther("2500000000000"));

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
      await bfeToken.transfer(
        carol.address,
        ethers.parseEther("2500000000000")
      );
      await bfeToken.transfer(eric.address, ethers.parseEther("2500000000000"));
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
      await expect(stabilityPool.connect(alice).withdrawFromSP(0)).not.to.be
        .reverted;

      await expect(stabilityPool.connect(bob).withdrawFromSP(0)).not.to.be
        .reverted;
      await expect(stabilityPool.connect(carol).withdrawFromSP(0)).not.to.be
        .reverted;
      await expect(stabilityPool.connect(eric).withdrawFromSP(0)).not.to.be
        .reverted;
    };

    const getAllHogBalances = async () => {
      const aliceBalance = await hogToken.balanceOf(alice.address);
      // const bobBalance = await hogToken.balanceOf(bob.address);
      // const carolBalance = await hogToken.balanceOf(carol.address);
      // const ericBalance = await hogToken.balanceOf(eric.address);

      return [aliceBalance];
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
      console.log("balanceBefore", balancesBefore);
      await claimGainWithAllAccounts();
      console.log("claim");
      const balancesAfter = await getAllHogBalances();
      console.log("balanceafter", balancesAfter);

      await compareBalanceUpdateCorrectness({
        balancesBefore,
        balancesAfter,
      });
      currentStep++;
    };

    it("should not let non-admin account set community issuance factor", async () => {
      await expect(communityIssuance.connect(bob).setISSUANCE_FACTOR(1)).to.be
        .reverted;
    });

    it("should let admin decrease community issuance factor", async () => {
      await expect(communityIssuance.setISSUANCE_FACTOR(1)).not.to.be.reverted;
    });
  });
});
