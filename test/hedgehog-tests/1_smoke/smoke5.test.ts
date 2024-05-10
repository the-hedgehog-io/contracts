import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import {
  CommunityIssuance,
  ERC20Mock,
  HOGToken,
  TestPriceFeed,
} from "../../../typechain-types";
import {
  ActivePool,
  BaseFeeLMAToken,
  BaseFeeOracle,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  HintHelpers,
  SortedTroves,
  StabilityPool,
  TroveManager,
} from "../../../typechain-types/contracts";
import { getSigners, setupContracts } from "../../utils";

const { latestBlock, increase, advanceBlock } = time;

const compareWithFault = (
  arg1: bigint | number,
  arg2: bigint | number,
  faultScale = 100000
) => {
  expect(arg1).to.be.lessThanOrEqual(
    BigInt(arg2) / BigInt(faultScale) + BigInt(arg2)
  );

  expect(arg1).to.be.greaterThanOrEqual(
    BigInt(arg2) / BigInt(faultScale) - BigInt(arg2)
  );
};

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Flash Loan attack simulation", () => {
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

    const gasCompensationReserve = BigInt("50000");
    const gasPrice010 = "30000000000";
    const gasPrice1114 = "60000000000";

    const AliceTroveColl = BigInt("301000000000000000");
    const AliceTroveDebtWithError = BigInt("100000000");
    const AliceTroveDebt = BigInt("2000000");
    const AliceTroveOpeningFee = BigInt("10000");
    const AliceBFEBalanceAtOpening = BigInt("1940000");
    const AliceInitialCR = BigInt("5016666666666666666");
    const AliceTroveIncreaseDebt = BigInt("1800000");
    const AliceDebtAfterFirstIncrease = BigInt("3800000");
    const AliceCollAfterFirstIncrease = BigInt("301000000000000000");
    const AliceCRAfterFirstIncrease = BigInt("2640350877192982456");
    const AliceTroveCollAfterBobRedemption = BigInt("287650000000000000");
    const AliceTroveDebtAfterBobRedemption = BigInt("3355000");
    const AliceCRAfterBobRedemption = BigInt("2857923497267759562");
    const AliceRedemptionFirst = BigInt("39751");
    const AliceReceivedWStEthForRedemption = BigInt("2363479375669996");
    const AliceCRAtLiquidation = BigInt("1428961748633879781");

    const BobTroveColl = BigInt("1500000000000000000");
    const BobTroveDebt = BigInt("1000000");
    const BobInitialCR = BigInt("50000000000000000000");
    const BobTroveOpeningFee = BigInt("505000");
    const BobIdealBFEBalanceAtOpening = BigInt("445000");
    const BobActualBFEBalanceAtOpening = BigInt("445000");
    const BobUnstakeFirst = BigInt("445000");
    const BobRedemptionFirst = BigInt("445000");
    const BobCollBalanceAfterRedemption = BigInt("13236361681136544");
    const BobTroveIncreaseCollFirst = BigInt("900000000000000000");
    const BobTroveCollAfterIncrease = BigInt("2400000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("1000000");
    const BobCRAfterIncrease = BigInt("40000000000000000000");
    const BobTroveCollAfterLiquid = BigInt("2426046952164232488");
    const BobTroveDebtAfterLiquid = BigInt("1305323");
    const BobCRAfterLiquid = BigInt("30976329896434732859");

    const BobTroveCollAfterRedemption = BigInt("2019320733470193740");
    const BobTroveDebtAfterRedemption = BigInt("3214685");
    const BobTroveIncreaseDebtSecond = BigInt("10000000");
    const BobTroveCollAfterSecondIncrease = BigInt("2426046952164232488");
    const BobTroveDebtAfterSecondIncrease = BigInt("1305323");
    const BobCRAfterSecondIncrease = BigInt("3576555563198315943");

    const CarolTroveColl = BigInt("2000000000000000000");
    const CarolTroveDebt = BigInt("3000000");
    const CarolTroveOpeningFee = BigInt("2094762");
    const CarolInitialCR = BigInt("22222222222222222222");
    const CarolBFEBalanceAtOpening = BigInt("855238");
    const CarolTroveCollAfterLiquid = BigInt("2021705793470193740");
    const CarolTroveDebtAfterLiquid = BigInt("3254436");
    const CarolCRAfterLiquid = BigInt("10353590163652492270");
    const CarolIncreaseDebt = BigInt("50000");
    const CarolIncreaseColl = BigInt("40000000000000000");

    const totalCollateralAliceOpening = BigInt("301000000000000000");
    const totalDebtAliceOpening = BigInt("2000000");
    const totalCollateralBobOpening = BigInt("1801000000000000000");
    const totalDebtBobOpening = BigInt("3000000");
    const totalDebtAliceIncrease = BigInt("4800000");
    const totalCollAliceIncrease = BigInt("1801000000000000000");
    const totalCollCarolOpening = BigInt("3801000000000000000");
    const totalDebtCarolOpening = BigInt("7800000");
    const totalCollBobFirstRedemption = BigInt("3787650000000000000");
    const totalDebtBobFirstRedemption = BigInt("7355000");
    const totalCollBobIncrease = BigInt("4687650000000000000");
    const totalDebtBobIncrease = BigInt("7355000");
    const totalCollJustBeforeAliceLiquidated = BigInt("4687650000000000000");
    const totalDebtJustBeforeAliceLiquidated = BigInt("7355000");
    const totalCollAliceLiquidated = BigInt("4447752745634426230");
    const totalDebtAliceLiquidated = BigInt("4559762");
    const totalCollAliceRedeemsBob = BigInt("4445367685634426230");
    const totalDebtAliceRedeemsBob = BigInt("4520011");

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
      ] = await setupContracts();
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
    const getCR = async ({ owner = bob }: Partial<GetCRParams> = {}) => {
      return await troveManager.getUnreliableTroveICR(owner.address);
    };

    const getTrove = async (caller = bob) => {
      const { debt, coll, pendingBaseFeeLMADebtReward, pendingWStETHReward } =
        await troveManager.getEntireDebtAndColl(caller.address);

      return { debt, coll, pendingBaseFeeLMADebtReward, pendingWStETHReward };
    };

    const logAllDebtColl = async () => {
      const coll = await troveManager.getEntireSystemColl();
      const debt = await troveManager.getEntireSystemDebt();

      const { debt: aliceDebt, coll: aliceColl } = await getTrove(alice);
      const { debt: bobDebt, coll: bobColl } = await getTrove(bob);
      const { debt: carolDebt, coll: carolColl } = await getTrove(carol);

      console.log("total debt: ", debt);
      console.log("total coll: ", coll);
      console.log("aliceColl: ", aliceColl);
      console.log("aliceDebt: ", aliceDebt);
      console.log("bobColl: ", bobColl);
      console.log("bobDebt: ", bobDebt);
      console.log("carolColl: ", carolColl);
      console.log("carolDebt: ", carolDebt);
    };

    type ProvideParams = {
      caller: SignerWithAddress;
      amount: string | BigNumberish;
    };
    const provide = async ({
      caller = bob,
      amount = BigInt(0),
    }: Partial<ProvideParams> = {}) => {
      await baseFeeLMAToken.approve(await stabilityPool.getAddress(), amount);

      await stabilityPool.connect(caller).provideToSP(amount);
    };

    type AdjustTroveParams = {
      caller: SignerWithAddress;
      amount: string | BigNumberish;
      maxFeePercentage: string | BigNumberish;
      upperHint: string;
      lowerHint: string;
    };

    const decreaseDebt = async ({
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
          false,
          ethers.ZeroAddress,
          ethers.ZeroAddress
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

    const setNewBaseFeePrice = async (_amount: number) => {
      const amount = ethers.parseUnits(_amount.toString(), "gwei");
      const block = await latestBlock();
      await mainOracle.feedBaseFeeValue(amount, block);
      await secondaryOracle.feedBaseFeeValue(amount, block);
      await priceFeed.fetchPrice();
    };

    const checkCollDebtCorrectness = async (
      expectedColl: bigint,
      expectedDebt: bigint
    ) => {
      const coll = await troveManager.getEntireSystemColl();
      const debt = await troveManager.getEntireSystemDebt();

      expect(coll).to.be.equal(expectedColl);
      expect(debt).to.be.equal(expectedDebt);
    };

    it("should let open trove to Alice with correct params", async () => {
      await openTrove({
        caller: alice,
        baseFeeLMAAmount: AliceTroveDebt,
        collAmount: AliceTroveColl,
      });
    });

    it("should let alice stake into stability pool", async () => {
      await expect(provide({ caller: alice, amount: AliceBFEBalanceAtOpening }))
        .not.to.be.reverted;
    });

    it("should let another user(bob) open a position", async () => {
      await increase(15);

      await openTrove({
        caller: bob,
        baseFeeLMAAmount: BobTroveDebt,
        collAmount: BobTroveColl,
      });
    });

    it("should let stake BFE to staking", async () => {
      // Provide 100%
      await provide({ amount: BobActualBFEBalanceAtOpening });
    });

    it("should let adjust the position (alice position)", async () => {
      await increase(2000);
      await expect(
        increaseDebt({ caller: alice, amount: AliceTroveIncreaseDebt })
      ).not.to.be.reverted;
    });

    // it("should let open another position in the system (carol position)", async () => {
    //   await increase(17970);

    //   await openTrove({
    //     caller: carol,
    //     collAmount: CarolTroveColl,
    //     baseFeeLMAAmount: CarolTroveDebt,
    //   });
    // });

    it("should let withdraw provided funds", async () => {
      await stabilityPool.connect(bob).withdrawFromSP(BobUnstakeFirst);
    });

    it("Should not let perform multiple trove adjustments in a single block, but should revert", async () => {
      await increase(90000);
      const balanceCollBefore = await payToken.balanceOf(bob.address);
      const hint = await hintHelpers.getRedemptionHints(
        BobRedemptionFirst,
        gasPrice010,
        0
      );
      await borrowerOperations
        .connect(bob)
        .withdrawColl(
          "225000000000000000",
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );

      await setNewBaseFeePrice(475);

      const singleTxCaller = await (
        await ethers.getContractFactory("SingleTxCaller")
      ).deploy();
      await payToken
        .connect(carol)
        .transfer(singleTxCaller.target, CarolTroveColl);

      await expect(
        singleTxCaller.singleTx(
          CarolTroveColl,
          borrowerOperations.target,
          troveManager.target,
          payToken.target,
          baseFeeLMAToken.target,
          hint[0],
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          hint[1]
        )
      ).to.be.revertedWithCustomError(
        borrowerOperations,
        "TroveAdjustedThisBlock"
      );
    });
  });
});
