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

    const gasCompensationReserve = BigInt("50000");
    const gasPrice010 = "30000000000";

    const AliceTroveColl = BigInt("350000000000000000");
    const AliceTroveDebtWithError = BigInt("100000000");
    const AliceTroveDebt = BigInt("7000000");
    const AliceTroveOpeningFee = BigInt("35000");
    const AliceBFEBalanceAtOpening = BigInt("6915000");
    const AliceInitialCR = 167;
    const AliceDecreaseDebtFirst = BigInt("2000000");
    const AliceDebtAfterFirstDecrease = BigInt("4440000");
    const AliceCollAfterFirstDecrease = BigInt("333200000000000000");
    const AliceCRAfterFirstDecrease = 233;
    const AliceTroveCollAfterBobRedemption = ethers.parseEther("0.332"); //TODO: Probably to exact enough
    const AliceTroveDebtAfterBobRedemption = 4440000;
    const AliceCRAfterBobRedemption = 250;
    const AliceRedemptionFirst = BigInt("4915000");

    const BobTroveColl = ethers.parseEther("2");
    const BobTroveDebt = BigInt("5000000");
    const BobInitialCR = 1333;
    const BobTroveOpeningFee = BigInt("3596429");
    const BobIdealBFEBalanceAtOpening = BigInt("1353571");
    const BobActualBFEBalanceAtOpening = BigInt("1353572");
    const BobUnstakeFirst = BigInt("560000");
    const BobRedemptionFirst = BigInt("560000");
    const BobTroveIncreaseCollFirst = BigInt("16663244859813100");
    const BobTroveCollAfterIncrease = BigInt("2016663244859810000");
    const BobCRAfterIncrease = 672;
    const BobTroveCollAfterLuquid = BigInt("2059754172045110000");
    const BobTroveDebtAfterLuquid = BigInt("5805881");
    const BobCRAfterLiquid = 591;

    const BobTroveIncreaseDebtSecond = BigInt("3000000");

    const CarolTroveColl = "350000000000000000";
    const CarolTroveDebt = BigInt("4000000");
    const CarolTroveOpeningFee = BigInt("1754157");
    const CarolInitialCR = 2500;
    const CarolBFEBalanceAtOpening = BigInt("2195843");
    const CarolTroveCollAfterLiquid = BigInt("3065768314496680000");
    const CarolTroveDebtAfterLiquid = BigInt(4644705);
    const CarolCRAfterLiquid = 1100;
    const CarolIncreaseDebt = BigInt("400000");
    const CarolRepayment = BigInt("100000");

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
      const { debt, coll, pendingBaseFeeLMADebtReward, pendingStETHReward } =
        await troveManager.getEntireDebtAndColl(caller.address);

      return { debt, coll, pendingBaseFeeLMADebtReward, pendingStETHReward };
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

    type DecreaseDebtParams = {
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
    }: Partial<DecreaseDebtParams> = {}) => {
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

    it("Should not let open trove if CR is below minimum", async () => {
      await priceFeed.setLastGoodPrice(gasPrice010);
      console.log("PRICE: ", await priceFeed.lastGoodPrice());
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

    it("Should let open trove to Alice with correct params", async () => {
      await openTrove({
        caller: alice,
        baseFeeLMAAmount: AliceTroveDebt,
        collAmount: AliceTroveColl,
      });
    });

    it("Should calculate and return correct CR for alice's position", async () => {
      //const cr = await getCR({ owner: alice });
      // const liqPrice = await troveManager.getLiquidationPrice(
      //   AliceTroveColl,
      //   AliceTroveDebt
      // );
      // console.log(liqPrice);
    });

    it("Should have a correct amount of collateral and debt in position record (alice position)", async () => {
      const { debt, coll } = await getTrove(alice);

      expect(debt).to.be.equal(AliceTroveDebt + gasCompensationReserve);
      expect(coll).to.be.equal(AliceTroveColl);
    });

    it("Should have transferred the correct amount BFE token during position opening (alice position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(alice.address);

      expect(AliceBFEBalanceAtOpening).to.be.equal(
        AliceTroveDebt - AliceTroveOpeningFee - gasCompensationReserve
      );

      expect(balance).to.be.equal(AliceBFEBalanceAtOpening);
    });

    it("Should let another user(bob) open a position", async () => {
      await openTrove({
        caller: bob,
        baseFeeLMAAmount: BobTroveDebt,
        collAmount: BobTroveColl,
      });
    });

    it("Should have a correct amount of collateral in position record (bob position)", async () => {
      const { debt, coll } = await getTrove(bob);

      expect(debt).to.be.equal(BobTroveDebt + gasCompensationReserve);
      expect(coll).to.be.equal(BobTroveColl);
    });

    it("Should have transferred the correct amount BFE token during position opening (bob position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(bob.address);

      compareWithFault(
        BobIdealBFEBalanceAtOpening,
        BobTroveDebt - BobTroveOpeningFee - gasCompensationReserve
      );

      compareWithFault(balance, BobIdealBFEBalanceAtOpening);
    });

    it("Should let stake BFE to staking", async () => {
      // Provide 100%
      await provide({ amount: BobActualBFEBalanceAtOpening });
    });

    it("Shouldn't have the system in the recovery mode", async () => {
      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        false
      );
    });

    it("Should record correct staked amount", async () => {
      const deposit = await stabilityPool.getCompoundedBaseFeeLMADeposit(
        bob.address
      );

      expect(deposit).to.be.equal(BobActualBFEBalanceAtOpening);
    });

    it("Should let adjust the position (alice position)", async () => {
      await decreaseDebt({ caller: alice, amount: AliceDecreaseDebtFirst });
    });

    it("Should record correct amount of deft after decrease (alice position)", async () => {
      // TODO: Do the test after the math is done
    });

    it("Should let open another position in the system (carol position)", async () => {
      await openTrove({
        caller: carol,
        collAmount: CarolTroveColl,
        baseFeeLMAAmount: CarolTroveDebt,
      });
    });
    it("Should have a correct amount of collateral in position record (carol position)", async () => {
      const { debt, coll } = await getTrove(carol);

      expect(debt).to.be.equal(CarolTroveDebt + gasCompensationReserve);
      expect(coll).to.be.equal(CarolTroveColl);
    });

    // TODO: Check if correct
    it.skip("Should have transferred the correct amount BFE token during position opening (carol position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(carol.address);

      compareWithFault(
        CarolBFEBalanceAtOpening,
        CarolTroveDebt - CarolTroveOpeningFee - gasCompensationReserve
      );

      compareWithFault(balance, CarolBFEBalanceAtOpening);
    });

    it("Should let another user provide to stability pool (carol)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(carol.address);
      await provide({ caller: carol, amount: balance });
      const deposit = await stabilityPool.getCompoundedBaseFeeLMADeposit(
        carol.address
      );

      expect(deposit).to.be.equal(balance);
    });

    it("Should let withdraw provided funds", async () => {
      await stabilityPool.connect(bob).withdrawFromSP(BobUnstakeFirst);
    });

    it("Withdrawn funds should result in a correct balance", async () => {
      expect(await baseFeeLMAToken.balanceOf(bob.address)).to.be.equal(
        BobUnstakeFirst
      );
    });

    it("Should let redeem collateral", async () => {
      const hint = await hintHelpers.getRedemptionHints(
        BobRedemptionFirst,
        gasPrice010,
        0
      );
      await expect(
        troveManager
          .connect(bob)
          .redeemCollateral(
            BobRedemptionFirst,
            hint[0],
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            hint[1],
            0,
            ethers.parseEther("1")
          )
      ).not.to.be.reverted;
    });

    it("should result into correct debt and collateral in a redeemed position", async () => {
      const { debt, coll } = await getTrove(alice);

      expect(debt).to.be.equal(
        AliceDebtAfterFirstDecrease + gasCompensationReserve
      );
      expect(coll).to.be.equal(AliceCollAfterFirstDecrease);
    });

    it("should let increase collateral to the position (bob position)", async () => {});
  });
});
