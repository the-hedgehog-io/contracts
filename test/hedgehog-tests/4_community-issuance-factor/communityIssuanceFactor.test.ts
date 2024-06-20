import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import timestring from "timestring";
import {
  BaseFeeLMATokenTester,
  CommunityIssuance,
  StabilityPoolTester,
  TERC20,
} from "../../../typechain-types";

const { increase: increaseTime } = time;

// Array([aliceGain, bobGain, carolGain, ericGain])
const hogGainSchedule: string[] = [
  "0", //  Step0-1
  "1317903975372452000000", //  Step1: 1317903975396110000000
  "1316167104484152000000", //  Step2: 1316167104510990000000
  "13066645242242832000000", // Step3: 13066645242491600000000
  "1297211938915362000000", //  Step4: 1297211938939940000000
  "0", //  Step5-6
  "323768804931714500000", //   Step6: 323768804937785000000
  "646897495231310500000", //   Step7: 646897495243494000000
  "646044946450686500000", //   Step8: 646044946462864000000
  "0", //  Step9-10
  "109475863570035000000", //   Step10: 109475863524222000000
  "109451803908871500000", //   Step11: 109451803863070000000
  "109427749535333000000", //   Step12: 109427749489577000000
  "1420374199722784000000", //  Step13: 1420374199129440000000
  "109091542856110000000", //   Step14: 109091542810635000000
  "116546149676417000000", //   Step15: 116436660046349000000
  "109469836420618000000", //   Step16: 109469848014854000000
  "101223819996069500000", //   Step17: 101224290254997000000
];

const factorSteps: string[] = [
  "999998681227695000",
  "999998681227695000",
  "999998681227695000",
  "999998681227695000",
  "999998681227695000",
  "999998681227695000",
  "999998681227695000",
  "999998681227695000",
  "999998681227695000",
  "999999780204495000",
  "999999780204495000",
  "999999780204495000",
  "999999780204495000",
  "999999780204495000",
  "999999780204495000",
  "999999890102241000",
  "999999890102241000",
  "999999780204495000",
];

const timeSteps: number[] = [
  0, 1000, 1000, 10000, 1000, 500, 500, 1000, 1000, 1000, 1000, 1000, 1000,
  13000, 1000, 1000, 1000, 1000,
];

const suppCapSteps: string[] = [
  "1000000000000000000000000",
  "1000000000000000000000000",
  "1000000000000000000000000",
  "1000000000000000000000000",
  "1000000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "500000000000000000000000",
  "1000000000000000000000000",
  "1000000000000000000000000",
  "500000000000000000000000",
];

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control", () => {
    let alice: SignerWithAddress, //ultimate admin
      bob: SignerWithAddress,
      carol: SignerWithAddress,
      dave: SignerWithAddress;
    let communityIssuance: CommunityIssuance;
    let stabilityPool: StabilityPoolTester;
    let bfeToken: BaseFeeLMATokenTester;
    let collToken: TERC20;
    let hogToken: TERC20;

    let currentStep = 0;

    before(async () => {
      [alice, bob, carol, dave] = await ethers.getSigners();

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

      await hogToken.transfer(
        communityIssuance.target,
        ethers.parseEther("10000000000000")
      );

      await bfeToken.transfer(bob.address, ethers.parseEther("2500000000000"));
      await bfeToken.transfer(
        carol.address,
        ethers.parseEther("2500000000000")
      );
      await bfeToken.transfer(dave.address, ethers.parseEther("2500000000000"));
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
    });

    const depositWithAllAccounts = async (
      amount = ethers.parseEther("2500")
    ) => {
      await expect(stabilityPool.provideToSP(amount)).not.to.be.reverted;

      expect(
        await stabilityPool.getCompoundedBaseFeeLMADeposit(alice.address)
      ).to.be.eq(amount);
      // expect(
      //   await stabilityPool.getCompoundedBaseFeeLMADeposit(bob.address)
      // ).to.be.eq(amount);
      // expect(
      //   await stabilityPool.getCompoundedBaseFeeLMADeposit(carol.address)
      // ).to.be.eq(amount);
      // expect(
      //   await stabilityPool.getCompoundedBaseFeeLMADeposit(dave.address)
      // ).to.be.eq(amount);
    };

    const claimGainWithAllAccounts = async () => {
      await expect(stabilityPool.withdrawFromSP(0)).not.to.be.reverted;
      // await expect(stabilityPool.connect(bob).withdrawFromSP(0)).not.to.be
      //   .reverted;
      // await expect(stabilityPool.connect(carol).withdrawFromSP(0)).not.to.be
      //   .reverted;
      // await expect(stabilityPool.connect(dave).withdrawFromSP(0)).not.to.be
      //   .reverted;
    };

    const getAllHogBalances = async () => {
      const aliceBalance = await hogToken.balanceOf(alice.address);
      // const bobBalance = await hogToken.balanceOf(bob.address);
      // const carolBalance = await hogToken.balanceOf(carol.address);
      // const ericBalance = await hogToken.balanceOf(dave.address);

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
      const expectedDiff = hogGainSchedule[currentStep];
      if (balancesBefore.length !== balancesAfter.length) {
        throw "Error: Trying to compare different length arrays";
      }
      for (let i = 0; i < balancesBefore.length; i++) {
        const actualDiff = isIncrease
          ? balancesAfter[i] - balancesBefore[i]
          : balancesBefore[i] - balancesAfter[i];
        expect(actualDiff).to.be.equal(BigInt(expectedDiff));
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

    const setStepValues = async () => {
      await communityIssuance.setISSUANCE_FACTOR(factorSteps[currentStep]);

      await communityIssuance.setHOGSupplyCap(suppCapSteps[currentStep]);

      if (timeSteps[currentStep] != 0) {
        await increaseTime(timestring(`${timeSteps[currentStep]} minutes`));
      }
    };

    it("should let provide debt tokens to stability pool with a default issuance factor", async () => {
      await depositWithAllAccounts();
    });

    it("should let execute 0 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });

    it("should let execute 1 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });

    it("should let execute 2 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });

    it("should let execute 3 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });

    it("should let execute 4 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });

    it("should let execute 5 step correctly", async () => {
      await setStepValues();
      await communityIssuance.setTotalHogIssued("8822946494815800000000");
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 6 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 7 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 8 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 9 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 10 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 11 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 12 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 13 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 14 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 15 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 16 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
    it("should let execute 17 step correctly", async () => {
      await setStepValues();
      await executeCurrentStepTxsAndChecks();
    });
  });
});
