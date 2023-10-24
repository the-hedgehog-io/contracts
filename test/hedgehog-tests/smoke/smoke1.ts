import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import {
  CommunityIssuance,
  ERC20Mock,
  HOGStaking,
  HOGToken,
  LockupContractFactory,
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
import { setupContracts } from "../../utils";

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
    const AliceTroveCollAfterBobRedemption = BigInt("333200000000000000");
    const AliceTroveDebtAfterBobRedemption = BigInt("4440000");
    const AliceCRAfterBobRedemption = BigInt("2501501501501501501");
    const AliceRedemptionFirst = BigInt("4915000");
    const AliceReceivedStEthForRedemption = BigInt("276457931475403000");
    const AliceCRAtLiquidation = BigInt("1250750750750750750");

    const BobTroveColl = BigInt("1500000000000000000");
    const BobTroveDebt = BigInt("1000000");
    const BobInitialCR = BigInt("50000000000000000000");
    const BobTroveOpeningFee = BigInt("505000");
    const BobIdealBFEBalanceAtOpening = BigInt("445000");
    const BobActualBFEBalanceAtOpening = BigInt("445000");
    const BobUnstakeFirst = BigInt("560000");
    const BobRedemptionFirst = BigInt("560000");
    const BobCollBalanceAfterRedemption = BigInt("16651117241379311");
    const BobTroveIncreaseCollFirst = BigInt("900000000000000000");
    const BobTroveCollAfterIncrease = BigInt("2900000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("5000000");
    const BobCRAfterIncrease = BigInt("9666666666666666666");
    const BobTroveCollAfterLiquid = BigInt("2964782567825590000");
    const BobTroveDebtAfterLiquid = BigInt("5867587");
    const BobCRAfterLiquid = BigInt("8421356594254680000");
    // TODO: Everything after liquidation might end up being wrong

    const BobTroveCollAfterRedemption = BigInt("1765765445809099988");
    const BobTroveDebtAfterRedemption = BigInt("674289");
    const BobTroveIncreaseDebtSecond = BigInt("11000000");
    const BobTroveCollAfterSecondIncrease = BigInt("1775365589023270000");
    const BobTroveDebtAfterSecondIncrease = BigInt("3590770");
    const BobCRAfterSecondIncrease = 824;

    const CarolTroveColl = BigInt("2000000000000000000");
    const CarolTroveDebt = BigInt("3000000");
    const CarolTroveOpeningFee = BigInt("2094762");
    const CarolInitialCR = BigInt("22222222222222222222");
    const CarolBFEBalanceAtOpening = BigInt("2180506");
    const CarolTroveCollAfterLiquid = BigInt("3065768314496680000");
    const CarolTroveDebtAfterLiquid = BigInt(4644705);
    const CarolCRAfterLiquid = 1100;
    const CarolIncreaseDebt = BigInt("50000");
    const CarolRepayment = BigInt("100000");

    const totalCollateralAliceOpening = BigInt("301000000000000000");
    const totalDebtAliceOpening = BigInt("2000000");
    const totalCollateralBobOpening = BigInt("1801000000000000000");
    const totalDebtBobOpening = BigInt("3000000");
    const totalDebtAliceIncrease = BigInt("4800000");
    const totalCollAliceIncrease = BigInt("1801000000000000000");
    const totalCollCarolOpening = BigInt("3801000000000000000");
    const totalDebtCarolOpening = BigInt("7800000");
    const totalCollBobFirstRedemption = BigInt("4333200000000000000");
    const totalDebtBobFirstRedemption = BigInt("13440000");
    const totalCollBobIncrease = BigInt("5233200000000000000");
    const totalDebtBobIncrease = BigInt("13440000");
    const totalCollJustBeforeAliceLiquidated = BigInt("5233200000000000000");
    const totalDebtJustBeforeAliceLiquidated = BigInt("13440000");
    const totalCollAliceLiquidated = BigInt("5009460200808750000");
    const totalDebtAliceLiquidated = BigInt("10465922");

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

    it("Should let alice stake into stability pool", async () => {
      await expect(provide({ caller: alice, amount: AliceBFEBalanceAtOpening }))
        .not.to.be.reverted;
    });

    it("should have correct total supply before bob opens position", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal("2000000");
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

    it("Should have a correct CR in a new position (bob position)", async () => {
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

      expect(balance).to.be.equal("2385000"); // TODO: Is that correct?
    });

    it("should have correct total supply before alice increase", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal("3000000");
    });

    it("Should let adjust the position (alice position)", async () => {
      await increase(2000);
      await expect(
        increaseDebt({ caller: alice, amount: AliceTroveIncreaseDebt })
      ).not.to.be.reverted;
    });

    it("Should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await checkCollDebtCorrectness(
        totalCollAliceIncrease,
        totalDebtAliceIncrease
      );
    });

    it("should result into a correct debt and collateral in a position after decrease", async () => {
      const { debt, coll } = await getTrove(alice);

      expect(debt).to.be.equal(AliceDebtAfterFirstIncrease);
      expect(coll).to.be.equal(AliceCollAfterFirstIncrease);
    });

    it("should result into a correct CR in a alice position", async () => {
      const cr = await getCR({ owner: alice });
      expect(cr).to.be.equal(AliceCRAfterFirstIncrease);
    });

    it("should have correct total supply before carol mint", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal("4800000");
    });

    it("Should let open another position in the system (carol position)", async () => {
      await increase(17970);

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

    // it("Should let withdraw provided funds", async () => {
    //   await stabilityPool.connect(bob).withdrawFromSP(BobUnstakeFirst);
    // });

    // it("Withdrawn funds should result in a correct balance", async () => {
    //   expect(await baseFeeLMAToken.balanceOf(bob.address)).to.be.equal(
    //     BobUnstakeFirst
    //   );
    // });

    // it("Should let redeem collateral, retrieve correct amount of bfe from account and transfer back correct amount of collateral", async () => {
    //   const balanceCollBefore = await payToken.balanceOf(bob.address);
    //   const hint = await hintHelpers.getRedemptionHints(
    //     BobRedemptionFirst,
    //     gasPrice010,
    //     0
    //   );
    //   await expect(
    //     troveManager
    //       .connect(bob)
    //       .redeemCollateral(
    //         BobRedemptionFirst,
    //         hint[0],
    //         ethers.ZeroAddress,
    //         ethers.ZeroAddress,
    //         hint[1],
    //         0,
    //         ethers.parseEther("1")
    //       )
    //   ).not.to.be.reverted;
    //   const balanceCollAfter = await payToken.balanceOf(bob.address);
    //   compareWithFault(
    //     balanceCollAfter - balanceCollBefore,
    //     BobCollBalanceAfterRedemption
    //   );
    //   expect(balanceCollAfter - balanceCollBefore).to.be.equal(
    //     BobCollBalanceAfterRedemption
    //   );
    // });

    // it("Should have a correct entire system debt (after bob redeems coll)", async () => {
    //   await checkCollDebtCorrectness(
    //     totalCollBobFirstRedemption,
    //     totalDebtBobFirstRedemption
    //   );
    // });

    // it("should result into correct debt and coll in a redeemed position", async () => {
    //   const { debt, coll } = await getTrove(alice);

    //   expect(debt).to.be.equal(AliceTroveDebtAfterBobRedemption);
    //   expect(coll).to.be.equal(AliceTroveCollAfterBobRedemption);
    // });

    // it("should result into a correct CR in alices position", async () => {
    //   expect(await getCR({ owner: alice })).to.be.equal(
    //     AliceCRAfterBobRedemption
    //   );
    // });

    // it("should let increase collateral to the position (bob position)", async () => {
    //   await setNewBaseFeePrice(33);
    //   await setNewBaseFeePrice(36);
    //   await setNewBaseFeePrice(40);
    //   await setNewBaseFeePrice(44);
    //   await setNewBaseFeePrice(48);
    //   await setNewBaseFeePrice(52);
    //   await setNewBaseFeePrice(56);
    //   await setNewBaseFeePrice(60);
    //   await increaseColl({ amount: BobTroveIncreaseCollFirst });
    // });

    // it("Should have a correct entire system debt (after bob increases coll)", async () => {
    //   await checkCollDebtCorrectness(
    //     totalCollBobIncrease,
    //     totalDebtBobIncrease
    //   );
    // });

    // it("Should have a correct amount of collateral and debt in position record (bob position)", async () => {
    //   const { debt, coll } = await getTrove(bob);

    //   expect(debt).to.be.equal(BobTroveDebtAfterIncrease);
    //   expect(coll).to.be.equal(BobTroveCollAfterIncrease);
    // });

    // it("Should have a correct CR after coll increase in position (bob position)", async () => {
    //   expect(await getCR()).to.be.equal(BobCRAfterIncrease);
    // });

    // it("Should have a correct entire system debt (just before bob liquidates alice)", async () => {
    //   await checkCollDebtCorrectness(
    //     totalCollJustBeforeAliceLiquidated,
    //     totalDebtJustBeforeAliceLiquidated
    //   );
    // });

    // // it("Should have a correct TCR (just before bob liquidates alice)", async() => {
    // //   expect(await troveManager.getUnreliableTCR()).to.be.equal()
    // // })

    // it("Should let liquidate troves with CR below minimal", async () => {
    //   expect(await getCR({ owner: alice })).to.be.equal(AliceCRAtLiquidation);
    //   expect(await troveManager.MCR()).to.be.greaterThan(AliceCRAtLiquidation);

    //   await expect(troveManager.batchLiquidateTroves([alice.address])).not.be
    //     .reverted;
    // });

    // it("Should have a correct entire system debt (bob liquidates alice)", async () => {
    //   const coll = await troveManager.getEntireSystemColl();
    //   const debt = await troveManager.getEntireSystemDebt();

    //   expect(coll).to.be.equal(totalCollAliceLiquidated);
    //   expect(debt).to.be.equal(totalDebtAliceLiquidated);
    // });

    // it("should result into empty stability pool", async () => {
    //   const balance = await baseFeeLMAToken.balanceOf(
    //     await stabilityPool.getAddress()
    //   );

    //   expect(balance).to.be.equal(0);
    // });

    // it("should be no position after liquidation", async () => {
    //   const { debt, coll } = await getTrove(alice);

    //   expect(debt).to.be.equal(0);
    //   expect(coll).to.be.equal(0);
    // });

    // it("should leave bfe tokens on liquidated user's address", async () => {
    //   const balance = await baseFeeLMAToken.balanceOf(alice.address);

    //   expect(balance).to.be.equal(
    //     AliceBFEBalanceAtOpening - AliceDecreaseDebtFirst
    //   );
    //   expect(balance).to.be.equal(AliceRedemptionFirst);
    // });

    // it("should calculate debt and collateral of other users after liquidation (bob position)", async () => {
    //   const { debt, coll } = await getTrove(bob);

    //   expect(debt).to.be.equal(BobTroveDebtAfterLiquid);
    //   expect(coll).to.be.equal(BobTroveCollAfterLiquid);
    // });

    // it("Should calculate cr of other positions correclty after liquidation (bob position)", async () => {
    //   expect(await getCR({ owner: bob })).to.be.equal(BobCRAfterLiquid);
    // });

    // it("should let redeem tokens if there is no position opened in the system", async () => {
    //   const balanceBefore = await payToken.balanceOf(alice.address);
    //   const hint = await hintHelpers.getRedemptionHints(
    //     AliceRedemptionFirst,
    //     gasPrice1114,
    //     0
    //   );

    //   await expect(
    //     troveManager
    //       .connect(alice)
    //       .redeemCollateral(
    //         AliceRedemptionFirst,
    //         hint[0],
    //         ethers.ZeroAddress,
    //         ethers.ZeroAddress,
    //         hint[1],
    //         0,
    //         ethers.parseEther("1")
    //       )
    //   ).not.to.be.reverted;

    //   const balanceAfter = await payToken.balanceOf(alice.address);

    //   expect(balanceAfter - balanceBefore).to.be.equal(
    //     AliceReceivedStEthForRedemption
    //   );
    // });

    // // it("should result into correct debt and collateral in a redeemed position", async () => {
    // //   const { debt, coll } = await getTrove(bob);

    // //   expect(debt).to.be.equal(BobTroveDebtAfterSecondIncrease);
    // //   expect(coll).to.be.equal(BobTroveCollAfterSecondIncrease);
    // // });

    // // it("Should have a correct entire system debt (alice redeems bob)", async () => {
    // //   const coll = await troveManager.getEntireSystemColl();
    // //   const debt = await troveManager.getEntireSystemDebt();

    // //   expect(coll).to.be.equal(totalCollAliceLiquidated);
    // //   expect(debt).to.be.equal(totalDebtAliceLiquidated);
    // // });

    // it("should allow increasing debt in the position (bob position)", async () => {
    //   await expect(
    //     increaseDebt({ caller: bob, amount: BobTroveIncreaseDebtSecond })
    //   ).not.to.be.reverted;
    // });

    // // it("should calculate debt and collateral after position debt increase (bob position)", async () => {
    // //   const { debt, coll } = await getTrove(bob);

    // //   expect(debt).to.be.equal(BobTroveDebtAfterRedemption);
    // //   expect(coll).to.be.equal(BobTroveCollAfterRedemption);
    // // });

    // it("should still allow to provide to stability pool", async () => {
    //   await expect(provide({ amount: BobTroveIncreaseDebtSecond })).not.to.be
    //     .reverted;
    // });

    // it("should correctly set system into a recovery mode", async () => {
    //   await setNewBaseFeePrice(65);
    //   await setNewBaseFeePrice(70);
    //   await setNewBaseFeePrice(80);
    //   console.log(await troveManager.getUnreliableTCR());
    //   expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
    //     true
    //   );
    // });

    // it("should let borrow more tokens during the recovery mode and transfer tokens correctly", async () => {
    //   const carolBFEBalanceBefore = await baseFeeLMAToken.balanceOf(
    //     carol.address
    //   );
    //   const carolCollBalanceBefore = await payToken.balanceOf(carol.address);
    //   await expect(increaseDebt({ caller: carol, amount: CarolIncreaseDebt }))
    //     .not.to.be.reverted;

    //   expect(carolBFEBalanceBefore + CarolIncreaseDebt).to.be.equal(
    //     await baseFeeLMAToken.balanceOf(carol.address)
    //   );
    //   expect(carolCollBalanceBefore).to.be.equal(
    //     await payToken.balanceOf(carol.address)
    //   );
    // });

    // it("should let carol liquidate bob", async () => {
    //   await expect(
    //     troveManager.connect(carol).batchLiquidateTroves([bob.address])
    //   ).not.to.be.reverted;
    // });

    // // it.skip("should let carol repay debt", async () => {
    // //   await expect(decreaseDebt({ caller: carol, amount: CarolRepayment })).not
    // //     .to.be.reverted;
    // // });

    // it("should not mark oracles as broken if price was increased by more then 12.5%", async () => {
    //   const amount = ethers.parseUnits("1000", "gwei");
    //   const block = await latestBlock();
    //   await mainOracle.feedBaseFeeValue(amount, block);
    //   await priceFeed.fetchPrice();
    //   expect(await priceFeed.status()).to.be.equal(1);
    //   await secondaryOracle.feedBaseFeeValue(
    //     ethers.parseUnits("1000", "gwei"),
    //     block
    //   );
    //   await priceFeed.fetchPrice();
    //   expect(await priceFeed.status()).to.be.equal(2);
    // });

    // it("should mark both oracles as working if price consists", async () => {
    //   await setNewBaseFeePrice(1001);

    //   await setNewBaseFeePrice(1004);
    //   expect(await priceFeed.status()).to.be.equal(0);
    // });

    // it("should mark oracle as frozen if no updates happens for more then 69 blocks", async () => {
    //   await mine(70);
    //   const block = await latestBlock();

    //   await secondaryOracle.feedBaseFeeValue(
    //     ethers.parseUnits("1000", "gwei"),
    //     block
    //   );
    //   await priceFeed.fetchPrice();
    //   expect(await priceFeed.status()).to.be.equal(3);
    // });
  });
});
