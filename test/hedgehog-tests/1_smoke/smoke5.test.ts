import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import {
  CommunityIssuance,
  HOGToken,
  TERC20,
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
  context("Base functionality and Access Control. Flow #1", () => {
    let alice: SignerWithAddress,
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
    let payToken: TERC20;
    let mainOracle: BaseFeeOracle, secondaryOracle: BaseFeeOracle;

    const gasCompensationReserve = BigInt("100000000000000000000000");
    const gasPrice010 = "30000000000";
    const gasPrice1114 = "60000000000";

    // Alice:
    const AliceTroveColl = ethers.parseEther("20");
    const AliceTroveDebtWithError = BigInt("111000000000000000000000000");
    const AliceTroveDebt = BigInt("350000000000000000000000000");
    const AliceTroveOpeningFee = BigInt("20000000000000000000000000");
    const AliceBFEBalanceAtOpening = BigInt("3980000000000000000000000000");
    const AliceInitialCR = BigInt("5016541253133333333");

    const AliceTroveIncreaseDebt = BigInt("3600000000000000000000000000");
    const AliceDebtAfterFirstIncrease = BigInt("7600100000000000000000000000");
    const AliceCollAfterFirstIncrease = BigInt("602000000000000000000");
    const AliceCRAfterFirstIncrease = BigInt("2640316136166666666");
    const AliceTroveCollAfterBobRedemption = BigInt("572299250030000000000");
    const AliceTroveDebtAfterBobRedemption = BigInt(
      "6610075001000000000000000000"
    );
    const AliceCRAfterBobRedemption = BigInt("2885994737533333333");
    const AliceRedemptionFirst = BigInt("79607518");
    const AliceReceivedWStEthForRedemption = BigInt("4734997625630910052");
    const AliceCRAtLiquidation = BigInt("1442997368766666666");

    const BobTroveColl = BigInt("3000000000000000000000");
    const BobTroveDebt = BigInt("2000000000000000000000000000");
    const BobInitialCR = BigInt("49997500124966666666");
    const BobTroveOpeningFee = BigInt("1009975001000000000000000000");
    const BobIdealBFEBalanceAtOpening = BigInt("990024999000000000000000000");
    const BobActualBFEBalanceAtOpening = BigInt("990024999000000000000000000");
    const BobUnstakeFirst = BigInt("990024999000000000000000000");
    const BobRedemptionFirst = BigInt("990024999000000000000000000");
    const BobCollBalanceAfterRedemption = BigInt("29436206421573249806");
    const BobTroveIncreaseCollFirst = BigInt("2000000000000000000000");
    const BobTroveCollAfterIncrease = BigInt("5000000000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("2000100000000000000000000000");
    const BobCRAfterIncrease = BigInt("41664583437483333333");
    const BobTroveCollAfterLiquid = BigInt("5039221150980918215000");
    const BobTroveDebtAfterLiquid = BigInt("2455380000");
    const BobCRAfterLiquid = BigInt("34205303937889574560");

    const BobTroveIncreaseDebtSecond = BigInt("40000000000000000000000000000");
    const BobTroveCollAfterRedemption = BigInt("5039221150980918215000");
    const BobTroveDebtAfterRedemption = BigInt("2455380000");
    const BobTroveDebtAfterSecondIncrease = BigInt("42455380000");
    const BobTroveCollAfterSecondIncrease = BigInt("5039221150980918215000");
    const BobCRAfterSecondIncrease = BigInt("1978242078695687179");
    const BobCRAtLiquidation = BigInt("1483681559021765384");

    // Carol:
    const CarolTroveColl = BigInt("4000000000000000000000");
    const CarolTroveDebt = BigInt("6000000000000000000000000000");
    const CarolTroveOpeningFee = BigInt("4189432568251300000000000000");
    const CarolInitialCR = BigInt("22221851858000000000");
    const CarolBFEBalanceAtOpening = BigInt("1810567431748703568000000000");
    const CarolTroveCollAfterLiquid = BigInt("4031376920784734572000");
    const CarolTroveDebtAfterLiquid = BigInt("6364324000");
    const CarolCRAfterLiquid = BigInt("10557227342041706686");
    const CarolIncreaseDebt = BigInt("22000000000");
    const CarolIncreaseColl = BigInt("7040000000000000000000");

    const totalCollateralAliceOpening = BigInt("602000000000000000000");
    const totalDebtAliceOpening = BigInt("4000100000000000000000000000");
    const totalCollateralBobOpening = BigInt("3602000000000000000000");
    const totalDebtBobOpening = BigInt("6000200000000000000000000000");
    const totalDebtAliceIncrease = BigInt("9600200000000000000000000000");
    const totalCollAliceIncrease = BigInt("3602000000000000000000");
    const totalCollCarolOpening = BigInt("7602000000000000000000");
    const totalDebtCarolOpening = BigInt("15600300000000000000000000000");
    const totalCollBobFirstRedemption = BigInt("7572299250030000000000");
    const totalDebtBobFirstRedemption = BigInt("14610275001000000000000000000");
    const totalCollBobIncrease = BigInt("9572299250030000000000");
    const totalDebtBobIncrease = BigInt("14610275001000000000000000000");
    const totalCollJustBeforeAliceLiquidated = BigInt("9572299250030000000000");
    const totalDebtJustBeforeAliceLiquidated = BigInt(
      "14610275001000000000000000000"
    );
    const totalCollAliceLiquidated = BigInt("9070598071765652789556");
    const totalDebtAliceLiquidated = BigInt("8819707569");
    const totalCollAliceRedeemsBob = BigInt("9065821620685652789556");
    const totalDebtAliceRedeemsBob = BigInt("8740100051");

    before(async () => {
      [, , , alice, bob, carol] = await getSigners({
        fork: false,
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

      return {
        debt,
        coll,
        pendingBaseFeeLMADebtReward,
        pendingWStETHReward,
      };
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

    it("should let open trove to Alice with correct params", async () => {
      await setNewBaseFeePrice(27);
      await openTrove({
        caller: alice,
        baseFeeLMAAmount: AliceTroveDebt * BigInt(10),
        collAmount: AliceTroveColl * BigInt(100),
      });
      await increase(86400 * 1000);
      await openTrove({
        caller: bob,
        baseFeeLMAAmount: "350000000000000000000000000",
        collAmount: ethers.parseEther("35"),
      });
    });
  });
});
