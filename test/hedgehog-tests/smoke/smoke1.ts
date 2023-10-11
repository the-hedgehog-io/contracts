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
    let mainOracle: BaseFeeOracle, secondaryOracle: BaseFeeOracle;

    const gasCompensationReserve = BigInt("50000");
    const gasPrice010 = "30000000000";
    const gasPrice1114 = "60000000000";

    const AliceTroveColl = BigInt("350000000000000000");
    const AliceTroveDebtWithError = BigInt("100000000");
    const AliceTroveDebt = BigInt("7000000");
    const AliceTroveOpeningFee = BigInt("35000");
    const AliceBFEBalanceAtOpening = BigInt("6915000");
    const AliceInitialCR = BigInt("1666666666666666666");
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
    const BobInitialCR = BigInt("13333333333333333333");
    const BobTroveOpeningFee = BigInt("3596429");
    const BobIdealBFEBalanceAtOpening = BigInt("1353571");
    const BobActualBFEBalanceAtOpening = BigInt("1353572");
    const BobUnstakeFirst = BigInt("560000");
    const BobRedemptionFirst = BigInt("560000");
    const BobCollBalanceAfterRedemption = BigInt("16663244859813085");
    const BobBfeBalanceAfterRedemption = BigInt("");
    const BobTroveIncreaseCollFirst = BigInt("16663244859813100");
    const BobTroveCollAfterIncrease = BigInt("2016663244859813100");
    const BobCRAfterIncrease = 672;
    const BobTroveCollAfterLuquid = BigInt("2059754172045110000");
    const BobTroveDebtAfterLuquid = BigInt("5805881");
    const BobCRAfterLiquid = 591;
    const BobTroveCollAfterRedemption = BigInt("1765316870103330000");
    const BobTroveDebtAfterRedemption = BigInt("899402");
    const BobTroveIncreaseDebtSecond = BigInt("3000000");
    const BobTroveCollAfterSecondIncrease = BigInt("1775365589023270000");
    const BobTroveDebtAfterSecondIncrease = BigInt("3590770");
    const BobCRAfterSecondIncrease = 824;

    const CarolTroveColl = "3000000000000000000";
    const CarolTroveDebt = BigInt("4000000");
    const CarolTroveOpeningFee = BigInt("1754157");
    const CarolInitialCR = BigInt("25000000000000000000");
    const CarolBFEBalanceAtOpening = BigInt("2180506");
    const CarolTroveCollAfterLiquid = BigInt("3065768314496680000");
    const CarolTroveDebtAfterLiquid = BigInt(4644705);
    const CarolCRAfterLiquid = 1100;
    const CarolIncreaseDebt = BigInt("400000");
    const CarolRepayment = BigInt("100000");

    const totalCollateralAliceOpening = BigInt("350000000000000000");
    const totalDebtAliceOpening = BigInt("7000000");
    const totalCollateralBobOpening = BigInt("2350000000000000000");
    const totalDebtBobOpening = BigInt("12000000");
    const totalDebtAliceDecrease = BigInt("10000000");
    const totalCollAliceDecrease = BigInt("2350000000000000000");
    const totalCollCarolOpening = BigInt("5350000000000000000");
    const totalDebtCarolOpening = BigInt("14000000");
    const totalCollBobFirstRedemption = BigInt("5333200000000000000");
    const totalDebtBobFirstRedemption = BigInt("13440000");
    const totalCollBobIncrease = BigInt("5349863244859813100");
    const totalDebtBobIncrease = BigInt("13440000");
    const totalCollAliceLiquidated = BigInt("5151670748697170000");
    const totalDebtAliceLiquidated = BigInt("10465923");

    before(async () => {
      [deployer, setter, hacker, alice, bob, carol] = await ethers.getSigners();

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

    it("Should not let open trove if CR is below minimum", async () => {
      await priceFeed.setLastGoodPrice(gasPrice010);

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

    it("Should correctly calculate estimated cr", async () => {
      expect(
        await borrowerOperations.computeUnreliableCR(
          AliceTroveColl,
          AliceTroveDebt
        )
      ).to.be.equal(AliceInitialCR);
    });

    it("Should let open trove to Alice with correct params", async () => {
      await openTrove({
        caller: alice,
        baseFeeLMAAmount: AliceTroveDebt,
        collAmount: AliceTroveColl,
      });
    });

    it("Should have a correct entire system debt", async () => {
      await checkCollDebtCorrectness(
        totalCollateralAliceOpening,
        totalDebtAliceOpening
      );
    });

    it("Should calculate and return correct CR for alice's position", async () => {
      expect(await getCR({ owner: alice })).to.be.equal(AliceInitialCR);
    });

    it("Should have a correct amount of collateral and debt in position record (alice position)", async () => {
      const { debt, coll } = await getTrove(alice);

      expect(debt).to.be.equal(AliceTroveDebt);
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
      await increase(15);
      await openTrove({
        caller: bob,
        baseFeeLMAAmount: BobTroveDebt,
        collAmount: BobTroveColl,
      });
    });

    it("Should have a correct CR in a new position (bob position)", async () => {
      expect(await getCR({ owner: bob })).to.be.equal(BobInitialCR);
    });

    it("Should have a correct entire system debt (after bob opens position)", async () => {
      await checkCollDebtCorrectness(
        totalCollateralBobOpening,
        totalDebtBobOpening
      );
    });

    it("Should have a correct amount of collateral and debt in position record (bob position)", async () => {
      const { debt, coll } = await getTrove(bob);

      expect(debt).to.be.equal(BobTroveDebt);
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

    it.skip("Should have a correct CR in a new position (bob position)", async () => {
      expect(await getCR()).to.be.equal(BobInitialCR);
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

    it("should result into a correct staked amount", async () => {
      const balance = await baseFeeLMAToken.balanceOf(
        await stabilityPool.getAddress()
      );

      expect(balance).to.be.equal("1353572");
    });

    it("Should let adjust the position (alice position)", async () => {
      await expect(
        decreaseDebt({ caller: alice, amount: AliceDecreaseDebtFirst })
      ).not.to.be.reverted;
    });

    it("Should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await checkCollDebtCorrectness(
        totalCollAliceDecrease,
        totalDebtAliceDecrease
      );
    });

    it("Should record correct amount of deft after decrease (alice position)", async () => {
      // TODO: Do the test after the math is done
    });

    it("Should let open another position in the system (carol position)", async () => {
      await increase(19900); //increase by 332 minutes

      await openTrove({
        caller: carol,
        collAmount: CarolTroveColl,
        baseFeeLMAAmount: CarolTroveDebt,
      });
    });

    it("should result into a correct CR in a position(carol position)", async () => {
      expect(await getCR({ owner: carol })).to.be.equal(CarolInitialCR);
    });

    it("Should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await checkCollDebtCorrectness(
        totalCollCarolOpening,
        totalDebtCarolOpening
      );
    });

    it("Should have a correct amount of collateral and debt in position record (carol position)", async () => {
      const { debt, coll } = await getTrove(carol);

      expect(debt).to.be.equal(CarolTroveDebt);
      expect(coll).to.be.equal(CarolTroveColl);
    });

    // TODO: Check if correct
    it("Should have transferred the correct amount BFE token during position opening (carol position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(carol.address);
      compareWithFault(
        CarolBFEBalanceAtOpening,
        CarolTroveDebt - CarolTroveOpeningFee - gasCompensationReserve
      );

      compareWithFault(balance, CarolBFEBalanceAtOpening);
    });

    it("Should let another user provide to stability pool (carol)", async () => {
      await provide({ caller: carol, amount: CarolBFEBalanceAtOpening });
      const deposit = await stabilityPool.getCompoundedBaseFeeLMADeposit(
        carol.address
      );

      expect(deposit).to.be.equal(CarolBFEBalanceAtOpening);
    });

    it("should result into a correct balance of stability pool", async () => {
      const balance = await baseFeeLMAToken.balanceOf(
        await stabilityPool.getAddress()
      );

      expect(balance).to.be.equal("3534078");
    });

    it("Should let withdraw provided funds", async () => {
      await stabilityPool.connect(bob).withdrawFromSP(BobUnstakeFirst);
    });

    it("Withdrawn funds should result in a correct balance", async () => {
      expect(await baseFeeLMAToken.balanceOf(bob.address)).to.be.equal(
        BobUnstakeFirst
      );
    });

    it("Should let redeem collateral, retrieve correct amount of bfe from account and transfer back correct amount of collateral", async () => {
      const balanceCollBefore = await payToken.balanceOf(bob.address);
      const balanceDebtBefore = await baseFeeLMAToken.balanceOf(bob.address);
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
      const balanceCollAfter = await payToken.balanceOf(bob.address);
      const balanceDebtAfter = await baseFeeLMAToken.balanceOf(bob.address);
      compareWithFault(
        balanceCollAfter - balanceCollBefore,
        BobCollBalanceAfterRedemption
      );
      expect(balanceCollAfter - balanceCollBefore).to.be.equal(
        BobCollBalanceAfterRedemption
      );
    });

    it("Should have a correct entire system debt (after bob redeems coll)", async () => {
      await checkCollDebtCorrectness(
        totalCollBobFirstRedemption,
        totalDebtBobFirstRedemption
      );
    });

    it("should result into correct debt and collateral in a redeemed position", async () => {
      const { debt, coll } = await getTrove(alice);

      expect(debt).to.be.equal(AliceDebtAfterFirstDecrease);
      expect(coll).to.be.equal(AliceCollAfterFirstDecrease);
    });

    it("should let increase collateral to the position (bob position)", async () => {
      await setNewBaseFeePrice(33);
      await setNewBaseFeePrice(36);
      await setNewBaseFeePrice(40);
      await setNewBaseFeePrice(44);
      await setNewBaseFeePrice(48);
      await setNewBaseFeePrice(52);
      await setNewBaseFeePrice(56);
      await setNewBaseFeePrice(60);
      await increaseColl({ amount: BobTroveIncreaseCollFirst });
    });

    it("Should have a correct entire system debt (after bob increases coll)", async () => {
      await checkCollDebtCorrectness(
        totalCollBobIncrease,
        totalDebtBobIncrease
      );
    });

    it("Should have a correct amount of collateral and debt in position record (bob position)", async () => {
      const { debt, coll } = await getTrove(bob);

      expect(debt).to.be.equal(BobTroveDebt);
      expect(coll).to.be.equal(BobTroveCollAfterIncrease);
    });

    it.skip("Should have a correct CR after coll increase in position (bob position)", async () => {
      expect(await getCR()).to.be.equal(BobCRAfterIncrease);
    });

    it("Should have a correct entire system debt (just before bob liquidates alice)", async () => {
      await checkCollDebtCorrectness(
        BigInt("5349863244859813100"),
        BigInt("13440000")
      );
    });

    it("Should let liquidate troves with CR below minimal", async () => {
      const { debt, coll } = await getTrove(alice);

      console.log("ALICE DEBT: ", debt);

      await expect(troveManager.batchLiquidateTroves([alice.address])).not.be
        .reverted;
    });

    it("Should have a correct entire system debt (after bob liquidates alice)", async () => {
      await checkCollDebtCorrectness(
        totalCollAliceLiquidated,
        totalDebtAliceLiquidated
      );
    });

    it("should result into empty stability pool", async () => {
      const balance = await baseFeeLMAToken.balanceOf(
        await stabilityPool.getAddress()
      );

      expect(balance).to.be.equal(0);
    });

    it("should be no position after liquidation", async () => {
      const { debt, coll } = await getTrove(alice);

      expect(debt).to.be.equal(0);
      expect(coll).to.be.equal(0);
    });

    it("should leave bfe tokens on liquidated user's address", async () => {
      const balance = await baseFeeLMAToken.balanceOf(alice.address);

      expect(balance).to.be.equal(
        AliceBFEBalanceAtOpening - AliceDecreaseDebtFirst
      );
      expect(balance).to.be.equal(AliceRedemptionFirst);
    });

    it("should calculate debt and collateral of other users after liquidation (bob position)", async () => {
      const { debt, coll } = await getTrove(bob);

      expect(debt).to.be.equal("5505770");
      expect(coll).to.be.equal("2070265589023270000");
    });

    it("should let redeem tokens if there is no position opened in the system", async () => {
      const { debt, coll } = await getTrove(bob);

      expect(debt).to.be.equal(
        BobTroveDebtAfterRedemption + gasCompensationReserve
      );

      const hint = await hintHelpers.getRedemptionHints(
        AliceRedemptionFirst,
        gasPrice010,
        0
      );
      await expect(
        troveManager
          .connect(bob)
          .redeemCollateral(
            AliceRedemptionFirst,
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
      const { debt, coll } = await getTrove(bob);

      expect(debt).to.be.equal(BobTroveDebtAfterRedemption);
      expect(coll).to.be.equal(BobTroveCollAfterRedemption);
    });

    it("should allow increasing debt in the position (bob position)", async () => {
      await increaseDebt({ caller: bob, amount: BobTroveIncreaseDebtSecond });
      await expect(
        increaseDebt({ caller: bob, amount: BobTroveIncreaseDebtSecond })
      ).not.to.be.reverted;
    });

    it("should still allow to provide to stability pool", async () => {
      await expect(provide({ amount: "1240228" })).not.to.be.reverted;
    });

    it("should correctly set system into a recovery mode", async () => {
      await setNewBaseFeePrice(65);
      await setNewBaseFeePrice(70);
      await setNewBaseFeePrice(75);
      await setNewBaseFeePrice(84);
      await setNewBaseFeePrice(94);
      await setNewBaseFeePrice(105);
      await setNewBaseFeePrice(112);
      await setNewBaseFeePrice(120);
      console.log("current price: ", await priceFeed.lastGoodPrice());
      console.log("current tcr: ", await troveManager.getUnreliableTCR());
      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        true
      );
    });

    it("should let borrow more tokens during the recovery mode and transfer tokens correctly", async () => {
      const carolBFEBalanceBefore = await baseFeeLMAToken.balanceOf(
        carol.address
      );
      const carolCollBalanceBefore = await payToken.balanceOf(carol.address);
      await expect(increaseDebt({ caller: carol, amount: CarolIncreaseDebt }))
        .not.to.be.reverted;

      expect(carolBFEBalanceBefore + CarolIncreaseDebt).to.be.equal(
        await baseFeeLMAToken.balanceOf(carol.address)
      );
      expect(carolCollBalanceBefore).to.be.equal(
        await payToken.balanceOf(carol.address)
      );
    });

    it("should let carol liquidate bob", async () => {
      await expect(
        troveManager.connect(carol).batchLiquidateTroves([bob.address])
      ).not.to.be.reverted;
    });

    it.skip("should let carol repay debt", async () => {
      await expect(decreaseDebt({ caller: carol, amount: CarolRepayment })).not
        .to.be.reverted;
    });

    it("should not mark oracles as broken if price was increased by more then 12.5%", async () => {
      const amount = ethers.parseUnits("1000", "gwei");
      const block = await latestBlock();
      await mainOracle.feedBaseFeeValue(amount, block);
      await priceFeed.fetchPrice();
      expect(await priceFeed.status()).to.be.equal(1);
      await secondaryOracle.feedBaseFeeValue(
        ethers.parseUnits("1000", "gwei"),
        block
      );
      await priceFeed.fetchPrice();
      expect(await priceFeed.status()).to.be.equal(2);
    });

    it("should mark both oracles as working if price consists", async () => {
      await setNewBaseFeePrice(1001);

      await setNewBaseFeePrice(1004);
      expect(await priceFeed.status()).to.be.equal(0);
    });

    it("should mark oracle as frozen if no updates happens for more then 69 blocks", async () => {
      await mine(70);
      const block = await latestBlock();

      await secondaryOracle.feedBaseFeeValue(
        ethers.parseUnits("1000", "gwei"),
        block
      );
      await priceFeed.fetchPrice();
      expect(await priceFeed.status()).to.be.equal(3);
    });
  });
});
