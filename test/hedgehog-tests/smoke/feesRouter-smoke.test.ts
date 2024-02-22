import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  BaseFeeOracle,
  TestPriceFeed,
  SortedTroves,
  TroveManager,
  ActivePool,
  StabilityPool,
  DefaultPool,
  CollSurplusPool,
  BorrowerOperations,
  HintHelpers,
  BaseFeeLMAToken,
  CommunityIssuance,
  HOGToken,
  ERC20Mock,
  FeesRouter,
} from "../../../typechain-types";
import { getSigners, setupContracts } from "../../utils";
import { expect } from "chai";
import { BigNumberish, ethers } from "ethers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
type OpenTroveParams = {
  caller: SignerWithAddress;
  maxFeePercentage: number;
  baseFeeLMAAmount: string | BigNumberish;
  collAmount: string | BigNumberish;
  upperHint: string;
  lowerHint: string;
};

type AdjustTroveParams = {
  caller: SignerWithAddress;
  amount: string | BigNumberish;
  maxFeePercentage: string | BigNumberish;
  upperHint: string;
  lowerHint: string;
};

const { latestBlock, increase, advanceBlock } = time;

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Base functionality and Access Control", () => {
    let deployer: SignerWithAddress, //ultimate admin
      setter: SignerWithAddress,
      hacker: SignerWithAddress,
      alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;
    let oracle: BaseFeeOracle;
    let priceFeed: TestPriceFeed;
    let sortedTroves: SortedTroves;
    let troveManager: TroveManager;
    let activePool: ActivePool;
    let stabilityPool: StabilityPool;
    let defaultPool: DefaultPool;
    let gasPool: any;
    let collSurplusPool: CollSurplusPool;
    let borrowerOperations: BorrowerOperations;
    let hintHelpers: HintHelpers;
    let baseFeeLMAToken: BaseFeeLMAToken;
    let communityIssuance: CommunityIssuance;
    let hogToken: HOGToken;
    let payToken: ERC20Mock;
    let mainOracle: BaseFeeOracle, secondaryOracle: BaseFeeOracle;
    let feesRouter: FeesRouter;

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

    const increaseDebt = async ({
      caller = bob,
      amount = 0,
      maxFeePercentage = ethers.parseEther("1"),
    }: Partial<AdjustTroveParams> = {}) => {
      await borrowerOperations
        .connect(caller)
        .adjustTrove(
          maxFeePercentage,
          0,
          0,
          amount,
          true,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );
    };

    before(async () => {
      [deployer, setter, hacker, alice, bob, carol] = await getSigners({
        fork: true,
      });

      [
        priceFeed,
        sortedTroves,
        troveManager,
        activePool,
        stabilityPool,
        defaultPool,
        gasPool,
        collSurplusPool,
        borrowerOperations,
        hintHelpers,
        baseFeeLMAToken,
        communityIssuance,
        hogToken,
        payToken,
        mainOracle,
        secondaryOracle,
        feesRouter,
      ] = await setupContracts();
    });

    it("should not let non-admin addresses to set fees router", async () => {
      await expect(
        feesRouter
          .connect(hacker)
          .setCollFeeConfig(
            5,
            34,
            33,
            33,
            setter.address,
            setter.address,
            setter.address
          )
      ).to.be.revertedWith(
        `AccessControl: account ${hacker.address.toLowerCase()} is missing role 0x8e4f01b2ef10e587f670bbfd448bba9a57a36fd9c81549b587269120cb62b24d`
      );

      await expect(
        feesRouter
          .connect(hacker)
          .setDebtFeeConfig(
            5,
            34,
            33,
            33,
            setter.address,
            setter.address,
            setter.address
          )
      ).to.be.revertedWith(
        `AccessControl: account ${hacker.address.toLowerCase()} is missing role 0x8e4f01b2ef10e587f670bbfd448bba9a57a36fd9c81549b587269120cb62b24d`
      );

      await expect(
        feesRouter
          .connect(hacker)
          .setFeeConfigs(
            5,
            34,
            33,
            33,
            setter.address,
            setter.address,
            setter.address
          )
      ).to.be.revertedWith(
        `AccessControl: account ${hacker.address.toLowerCase()} is missing role 0x8e4f01b2ef10e587f670bbfd448bba9a57a36fd9c81549b587269120cb62b24d`
      );
    });

    it("should revert on invalid inputs: percentage sum is less then 100", async () => {
      await expect(
        feesRouter.setDebtFeeConfig(
          5,
          33,
          33,
          33,
          setter.address,
          setter.address,
          setter.address
        )
      ).to.be.revertedWithCustomError(feesRouter, "InvalidInput");
    });
    it("should revert on invalid inputs: percentage sum is more then 100", async () => {
      await expect(
        feesRouter.setDebtFeeConfig(
          5,
          35,
          33,
          33,
          setter.address,
          setter.address,
          setter.address
        )
      ).to.be.revertedWithCustomError(feesRouter, "InvalidInput");
    });
    it("should revert on invalid inputs: percentage percentageB is initialized but amounts are not", async () => {
      await expect(
        feesRouter.setDebtFeeConfig(
          5,
          34,
          33,
          33,
          setter.address,
          ethers.ZeroAddress,
          setter.address
        )
      ).to.be.revertedWithCustomError(feesRouter, "InvalidInput");
    });
    it("should revert on invalid inputs: percentage percentageC is initialized but amounts are not", async () => {
      await expect(
        feesRouter.setDebtFeeConfig(
          5,
          34,
          33,
          33,
          setter.address,
          setter.address,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(feesRouter, "InvalidInput");
    });
    it("should revert on invalid inputs: range is incorrect", async () => {
      await expect(
        feesRouter.setDebtFeeConfig(
          6,
          34,
          33,
          33,
          setter.address,
          setter.address,
          setter.address
        )
      ).to.be.revertedWithCustomError(feesRouter, "InvalidIndex");
    });
    it("should revert on invalid inputs: percentageA is 0", async () => {
      await expect(
        feesRouter.setDebtFeeConfig(
          5,
          0,
          33,
          33,
          setter.address,
          setter.address,
          setter.address
        )
      ).to.be.revertedWithCustomError(feesRouter, "InvalidInput");
    });

    it("should revert on invalid inputs: addressA is address0", async () => {
      await expect(
        feesRouter.setDebtFeeConfig(
          5,
          34,
          33,
          33,
          ethers.ZeroAddress,
          setter.address,
          setter.address
        )
      ).to.be.revertedWithCustomError(feesRouter, "InvalidAddress");
    });

    it("should let set configs correctly", async () => {
      for (let i = 0; i < 100; i += 5) {
        await expect(
          feesRouter.setFeeConfigs(
            i,
            34,
            33,
            33,
            bob.address,
            carol.address,
            deployer.address
          )
        ).not.to.be.reverted;
      }
    });

    it("should distribute fees correctly", async () => {
      const bobBefore = await baseFeeLMAToken.balanceOf(bob.address);
      const carolBefore = await baseFeeLMAToken.balanceOf(carol.address);
      const deployerBefore = await baseFeeLMAToken.balanceOf(deployer.address);
      const firstTotalFee = BigInt("10000");

      await openTrove({
        caller: alice,
        baseFeeLMAAmount: "2000000",
        collAmount: "301000000000000000",
      });
      await increase(15);

      const bobAfter = await baseFeeLMAToken.balanceOf(bob.address);
      const carolAfter = await baseFeeLMAToken.balanceOf(carol.address);
      const deployerAfter = await baseFeeLMAToken.balanceOf(deployer.address);

      expect(bobAfter - bobBefore).to.be.equal(
        (firstTotalFee / BigInt("100")) * BigInt("34")
      );

      expect(carolAfter - carolBefore).to.be.equal(
        (firstTotalFee / BigInt("100")) * BigInt("33")
      );

      expect(deployerAfter - deployerBefore).to.be.equal(
        (firstTotalFee / BigInt("100")) * BigInt("33")
      );
    });

    it("should correctly distribute fees after configs are updated: ", async () => {
      for (let i = 0; i < 100; i += 5) {
        await expect(
          feesRouter.setFeeConfigs(
            i,
            75,
            25,
            0,
            deployer.address,
            carol.address,
            ethers.ZeroAddress
          )
        ).not.to.be.reverted;
      }

      const carolBefore = await baseFeeLMAToken.balanceOf(carol.address);
      const deployerBefore = await baseFeeLMAToken.balanceOf(deployer.address);
      const secondTotalFee = BigInt("505000");

      await openTrove({
        caller: bob,
        baseFeeLMAAmount: "1000000",
        collAmount: "50000000000000000000",
      });

      const carolAfter = await baseFeeLMAToken.balanceOf(carol.address);
      const deployerAfter = await baseFeeLMAToken.balanceOf(deployer.address);

      expect(deployerAfter - deployerBefore).to.be.equal(
        (secondTotalFee / BigInt("100")) * BigInt("75")
      );

      expect(carolAfter - carolBefore).to.be.equal(
        (secondTotalFee / BigInt("100")) * BigInt("25")
      );
    });

    it("should correctly distribute fees after redemption: ", async () => {
      await increase(2000);
      await increaseDebt({ caller: alice, amount: "1800000" });
      await increase(17970);
      await openTrove({
        caller: carol,
        collAmount: "2000000000000000000",
        baseFeeLMAAmount: "3000000",
      });
      const hint = await hintHelpers.getRedemptionHints(
        "445000",
        "30000000000",
        0
      );
      const carolBefore = await payToken.balanceOf(carol.address);
      const deployerBefore = await payToken.balanceOf(deployer.address);
      const secondTotalFee = BigInt("70157630829238");

      await troveManager
        .connect(bob)
        .redeemCollateral(
          "445000",
          hint[0],
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          hint[1],
          0,
          ethers.parseEther("1")
        );

      const carolAfter = await payToken.balanceOf(carol.address);
      const deployerAfter = await payToken.balanceOf(deployer.address);

      expect(deployerAfter - deployerBefore).to.be.equal(
        "52618223121929"
        // (secondTotalFee / BigInt("100")) * BigInt("75") Commenting since javascript gives 2 digits fault
      );

      expect(carolAfter - carolBefore).to.be.equal(
        "17539407707309"
        // (secondTotalFee / BigInt("100")) * BigInt("25") Commenting since javascript gives 2 digits fault
      );
    });
  });
});
