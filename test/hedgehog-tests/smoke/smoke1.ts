import { time, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  ActivePool,
  BaseFeeLMAToken,
  BaseFeeOracle,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  HintHelpers,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManager,
} from "../../../typechain-types/contracts";
import { etheredValue, setupContracts } from "../../utils";
import { Contract } from "hardhat/internal/hardhat-network/stack-traces/model";
import { BigNumberish } from "ethers";
import {
  CommunityIssuance,
  ERC20Mock,
  HOGStaking,
  HOGToken,
  LockupContractFactory,
  TestPriceFeed,
} from "../../../typechain-types";
import { ABCConfig } from "./config";

const { latestBlock } = time;

describe("BaseFeeOracle Tests", () => {
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
    let hogStaking: HOGStaking;
    let lockupContractFactory: LockupContractFactory;
    let hogToken: HOGToken;
    let payToken: ERC20Mock;

    const gasPrice010 = 30;

    const AliceTroveColl = "350000000000000000";
    const AliceTroveDebtWithError = "100000000";
    const AliceTroveDebt = "7000000";
    const AliceInitialCR = 167;
    const AliceDecreaseDebtFirst = "2000000";
    const AliceDebtAfterFirstDecrease = "5000000";
    const AliceCRAfterFirstDecrease = 233;
    const AliceTroveCollAfterBobRedemption = ethers.parseEther("0.332"); //TODO: Probably to exact enough
    const AliceTroveDebtAfterBobRedemption = 4440000;
    const AliceCRAfterBobRedemption = 250;
    const AliceRedemptionFirst = "4915000";

    const BobTroveColl = ethers.parseEther("2");
    const BobTroveDebt = "5000000";
    const BobInitialCR = 1333;
    const BobUnstakeFirst = "560000";
    const BobRedemptionFirst = "560000";
    const BobTroveIncreaseCollFirst = "16663244859813100";
    const BobTroveCollAfterIncrease = "2016663244859810000";
    const BobCRAfterIncrease = 672;
    const BobTroveCollAfterLuquid = "2059754172045110000";
    const BobTroveDebtAfterLuquid = "5805881";
    const BobCRAfterLiquid = 591;

    const BobTroveIncreaseDebtSecond = "3000000";

    const CarolTroveColl = ethers.parseEther("3");
    const CarolTroveDebt = "4000000";
    const CarolInitialCR = 2500;
    const CarolTroveCollAfterLiquid = "3065768314496680000";
    const CarolTroveDebtAfterLiquid = 4644705;
    const CarolCRAfterLiquid = 1100;
    const CarolIncreaseDebt = "400000";
    const CarolRepayment = "100000";

    before(async () => {
      [deployer, setter, hacker, alice, bob, carol] = await ethers.getSigners();
      oracle = await (
        await (
          await ethers.getContractFactory("BaseFeeOracle")
        ).deploy(setter.address, deployer.address)
      ).waitForDeployment();

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
        hogStaking,
        lockupContractFactory,
        hogToken,
        payToken,
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

    it("Should not let open trove if CR is below minimum", async () => {
      await priceFeed.setLastGoodPrice(29);
      await priceFeed.setLastGoodPrice(30);

      await expect(
        openTrove({
          caller: alice,
          baseFeeLMAAmount: AliceTroveDebtWithError,
          collAmount: AliceTroveColl,
        })
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
      );
    });

    it("Should let open trove", async () => {
      await openTrove({
        caller: alice,
        baseFeeLMAAmount: AliceTroveDebt,
        collAmount: AliceTroveColl,
      });
    });
  });
});
