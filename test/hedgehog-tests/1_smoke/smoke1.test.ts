import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TERC20, TestPriceFeed } from "../../../typechain-types";
import {
  BaseFeeLMAToken,
  BaseFeeOracle,
  BorrowerOperations,
  HintHelpers,
  StabilityPool,
  TroveManager,
} from "../../../typechain-types/contracts";
import { getSigners, setupContracts } from "../../utils";
import {
  ProvideToStabilityPool,
  getOpenTrove,
  getStabilityPoolMethods,
  OpenTroveToBorrowerOperations,
  AdjustTroveParamsToBorrowerOperations,
  getAdjustTroveParams,
  getCollRatioParams,
  CollateralRatioParams,
  GetEntireCollAndDebtParams,
  checkCorrectness,
  validateCollDebtMatch,
  setNewParamsToBaseFee,
} from "../../utils/shared";

const { latestBlock, increase } = time;

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Base functionality and Access Control. Flow #1", () => {
    let alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;

    let priceFeed: TestPriceFeed;
    let troveManager: TroveManager;
    let stabilityPool: StabilityPool;
    let borrowerOperations: BorrowerOperations;
    let hintHelpers: HintHelpers;
    let baseFeeLMAToken: BaseFeeLMAToken;
    let payToken: TERC20;
    let mainOracle: BaseFeeOracle, secondaryOracle: BaseFeeOracle;
    let checkCollDebtCorrectness: any;
    let compareWithFault: any;
    let setNewBaseFeePrice: any;

    let provideToStabilityPool: ProvideToStabilityPool;
    let openTroveToBorrowerOperations: OpenTroveToBorrowerOperations;
    let troveDebtIncrease: AdjustTroveParamsToBorrowerOperations;
    let troveCollIncrease: AdjustTroveParamsToBorrowerOperations;
    let unreliableTroveCR: CollateralRatioParams;
    let entireCollAndDebt: GetEntireCollAndDebtParams;

    const gasCompensationReserve = BigInt("100000000000000000000000");
    const gasPrice010 = "30000000000";
    const gasPrice1114 = "60000000000";

    // Alice:
    const AliceTroveColl = BigInt("602000000000000000000");
    const AliceTroveDebtWithError = BigInt("11000000000000000000000000");
    const AliceTroveDebt = BigInt("4000000000000000000000000000");
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
    const AliceCRAtLiquidation = BigInt("1442997368766666666");

    // Bob:
    const BobTroveColl = BigInt("3000000000000000000000");
    const BobTroveDebt = BigInt("2000000000000000000000000000");
    const BobInitialCR = BigInt("49997500124966666666");
    const BobTroveOpeningFee = BigInt("1009975001");
    const BobIdealBFEBalanceAtOpening = BigInt("990024999000000000000000000");
    const BobActualBFEBalanceAtOpening = BigInt("990024999000000000000000000");
    const BobUnstakeFirst = BigInt("990024999000000000000000000");
    const BobRedemptionFirst = BigInt("990024999000000000000000000");
    const BobCollBalanceAfterRedemption = BigInt("29436206421573249806");
    const BobTroveIncreaseCollFirst = BigInt("2000000000000000000000");
    const BobTroveCollAfterIncrease = BigInt("5000000000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("2000100000000000000000000000");
    const BobCRAfterIncrease = BigInt("41664583437483333333");
    const BobTroveCollAfterLiquid = BigInt("5039221150992945115000");
    const BobTroveDebtAfterLiquid = BigInt("2455381982917386906666665000");
    const BobCRAfterLiquid = BigInt("34205276314450000000");

    const BobTroveIncreaseDebtSecond = BigInt("40000000000000000000000000000");
    const BobTroveCollAfterRedemption = BigInt("5039221150992945115000");
    const BobTroveDebtAfterRedemption = BigInt("2455381982917386906666665000");
    const BobTroveDebtAfterSecondIncrease = BigInt(
      "42455381982917386906666665000"
    );
    const BobTroveCollAfterSecondIncrease = BigInt("5039221150992945115000");
    const BobCRAfterSecondIncrease = BigInt("1978241986300000000");
    const BobCRAtLiquidation = BigInt("1483681489725000000");

    // Carol:
    const CarolTroveColl = BigInt("4000000000000000000000");
    const CarolTroveDebt = BigInt("6000000000000000000000000000");
    const CarolInitialCR = BigInt("22221851858000000000");
    const CarolBFEBalanceAtOpening = BigInt("1810567431748703568000000000");
    const CarolTroveCollAfterLiquid = BigInt("4031376920794356092000");
    const CarolTroveDebtAfterLiquid = BigInt("6364325586333909525333332000");
    const CarolCRAfterLiquid = BigInt("10557224710633333333");
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
    const totalCollAliceLiquidated = BigInt("9070598071787301208938");
    const totalDebtAliceLiquidated = BigInt("8819707569251296432000000000");
    const totalCollAliceRedeemsBob = BigInt("9070598071787301208934");
    const totalDebtAliceRedeemsBob = BigInt("8819707569251296431920392482");

    before(async () => {
      [, , , alice, bob, carol] = await getSigners({
        fork: false,
      });

      [
        priceFeed,
        ,
        troveManager,
        ,
        stabilityPool,
        ,
        ,
        ,
        borrowerOperations,
        hintHelpers,
        baseFeeLMAToken,
        ,
        ,
        payToken,
        mainOracle,
        secondaryOracle,
      ] = await setupContracts();

      const { provideToStabilityPool: provideToStabilityPoolInit } =
        await getStabilityPoolMethods({ baseFeeLMAToken, stabilityPool });

      provideToStabilityPool = provideToStabilityPoolInit;

      const {
        openTroveToBorrowerOperations: openTroveToBorrowerOperationsInit,
      } = await getOpenTrove({ borrowerOperations, payToken });

      openTroveToBorrowerOperations = openTroveToBorrowerOperationsInit;

      const {
        troveDebtIncrease: troveDebtIncreaseInit,
        troveCollIncrease: troveCollIncreaseInit,
      } = await getAdjustTroveParams({ borrowerOperations, payToken });

      troveDebtIncrease = troveDebtIncreaseInit;
      troveCollIncrease = troveCollIncreaseInit;

      const {
        getUnreliableTroveCollateralRatio:
          getUnreliableTroveCollateralRatioInit,
        getEntireCollAndDebt: entireCollAndDebtInit,
      } = await getCollRatioParams({ troveManager });

      unreliableTroveCR = getUnreliableTroveCollateralRatioInit;
      entireCollAndDebt = entireCollAndDebtInit;

      const { checkCollDebtCorrectness: checkCollDebtCorrectnessInit } =
        await checkCorrectness({ troveManager });
      checkCollDebtCorrectness = checkCollDebtCorrectnessInit;

      const { compareWithFault: compareWithFaultInit } =
        await validateCollDebtMatch();
      compareWithFault = compareWithFaultInit;

      const { setNewBaseFeePrice: setNewBaseFeePriceInit } =
        await setNewParamsToBaseFee({ mainOracle, secondaryOracle, priceFeed });
      setNewBaseFeePrice = setNewBaseFeePriceInit;
    });

    it("should not let open trove if CR is below minimum", async () => {
      await priceFeed.setLastGoodPrice(gasPrice010);

      await expect(
        openTroveToBorrowerOperations({
          caller: alice,
          baseFeeLMAAmount: AliceTroveDebt * BigInt(10),
          collAmount: AliceTroveColl,
        })
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
      );
    });

    it("should not let open trove if mint net debt is below minimum", async () => {
      await priceFeed.setLastGoodPrice(gasPrice010);

      await expect(
        openTroveToBorrowerOperations({
          caller: alice,
          baseFeeLMAAmount: AliceTroveDebtWithError,
          collAmount: AliceTroveColl,
        })
      ).to.be.revertedWith(
        "BorrowerOps: Trove's net debt must be greater than minimum"
      );
    });

    it("should correctly calculate estimated cr", async () => {
      expect(
        await borrowerOperations.computeUnreliableCR(
          AliceTroveColl,
          AliceTroveDebt + gasCompensationReserve
        )
      ).to.be.equal(AliceInitialCR);
    });

    it("should let open trove to Alice with correct params", async () => {
      await expect(
        openTroveToBorrowerOperations({
          caller: alice,
          baseFeeLMAAmount: AliceTroveDebt,
          collAmount: AliceTroveColl,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt", async () => {
      await checkCollDebtCorrectness({
        expectedColl: totalCollateralAliceOpening,
        expectedDebt: totalDebtAliceOpening,
      });
    });

    it("should calculate and return correct CR for alice's position", async () => {
      expect(await unreliableTroveCR({ owner: alice })).to.be.equal(
        AliceInitialCR
      );
    });

    it("should have a correct amount of collateral and debt in position record (alice position)", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: alice });

      expect(debt).to.be.equal(AliceTroveDebt + gasCompensationReserve);
      expect(coll).to.be.equal(AliceTroveColl);
    });

    it("should have transferred the correct amount BFE token during position opening (alice position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(alice.address);

      expect(AliceBFEBalanceAtOpening).to.be.equal(
        AliceTroveDebt - AliceTroveOpeningFee
      );

      expect(balance).to.be.equal(AliceBFEBalanceAtOpening);
    });

    it("should let alice stake into stability pool", async () => {
      await expect(
        provideToStabilityPool({
          caller: alice,
          amount: AliceBFEBalanceAtOpening,
        })
      ).not.to.be.reverted;
    });

    it("should have correct total supply before bob opens position", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal(AliceTroveDebt + gasCompensationReserve);
    });

    it("should let another user(bob) open a position", async () => {
      await increase(15);

      await expect(
        openTroveToBorrowerOperations({
          caller: bob,
          baseFeeLMAAmount: BobTroveDebt,
          collAmount: BobTroveColl,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct CR in a new position (bob position)", async () => {
      expect(await unreliableTroveCR({ owner: bob })).to.be.equal(BobInitialCR);
    });

    it("should have a correct entire system debt (after bob opens position)", async () => {
      await checkCollDebtCorrectness({
        expectedColl: totalCollateralBobOpening,
        expectedDebt: totalDebtBobOpening,
      });
    });

    it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: bob });

      expect(debt).to.be.equal(BobTroveDebt + gasCompensationReserve);
      expect(coll).to.be.equal(BobTroveColl);
    });

    it("should have transferred the correct amount BFE token during position opening (bob position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(bob.address);

      compareWithFault(
        BobIdealBFEBalanceAtOpening,
        BobTroveDebt - BobTroveOpeningFee
      );

      compareWithFault(
        balance,
        BobIdealBFEBalanceAtOpening + gasCompensationReserve
      );
    });

    it("should have a correct CR in a new position (bob position)", async () => {
      expect(await unreliableTroveCR({ owner: bob })).to.be.equal(BobInitialCR);
    });

    it("should let stake BFE to staking", async () => {
      // Provide 100%
      await expect(
        provideToStabilityPool({
          caller: bob,
          amount: BobActualBFEBalanceAtOpening,
        })
      ).not.to.be.reverted;
    });

    it("shouldn't have the system in the recovery mode", async () => {
      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        false
      );
    });

    it("should record correct staked amount", async () => {
      const deposit = await stabilityPool.getCompoundedBaseFeeLMADeposit(
        bob.address
      );

      expect(deposit).to.be.equal(BobActualBFEBalanceAtOpening);
    });

    it("should result into a correct staked amount", async () => {
      const balance = await baseFeeLMAToken.balanceOf(
        await stabilityPool.getAddress()
      );

      expect(balance).to.be.equal("4970024999000000000000000000");
    });

    it("should have correct total supply before alice increase", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal("6000200000000000000000000000");
    });

    it("should let adjust the position (alice position)", async () => {
      await increase(2000);
      await expect(
        troveDebtIncrease({
          caller: alice,
          amount: AliceTroveIncreaseDebt,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await checkCollDebtCorrectness({
        expectedColl: totalCollAliceIncrease,
        expectedDebt: totalDebtAliceIncrease,
      });
    });

    it("should result into a correct debt and collateral in a position after decrease", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: alice });

      expect(debt).to.be.equal(AliceDebtAfterFirstIncrease);
      expect(coll).to.be.equal(AliceCollAfterFirstIncrease);
    });

    it("should result into a correct CR in a alice position", async () => {
      const cr = await unreliableTroveCR({ owner: alice });
      expect(cr).to.be.equal(AliceCRAfterFirstIncrease);
    });

    it("should have correct total supply before carol mint", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal("9600200000000000000000000000");
    });

    it("should let open another position in the system (carol position)", async () => {
      await increase(17970);

      await expect(
        openTroveToBorrowerOperations({
          caller: carol,
          collAmount: CarolTroveColl,
          baseFeeLMAAmount: CarolTroveDebt,
        })
      ).not.to.be.reverted;
    });

    it("should result into a correct CR in a position(carol position)", async () => {
      expect(await unreliableTroveCR({ owner: carol })).to.be.equal(
        CarolInitialCR
      );
    });

    it("should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await checkCollDebtCorrectness({
        expectedColl: totalCollCarolOpening,
        expectedDebt: totalDebtCarolOpening,
      });
    });

    it("should have a correct amount of collateral and debt in position record (carol position)", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: carol });

      expect(debt).to.be.equal(CarolTroveDebt + gasCompensationReserve);
      expect(coll).to.be.equal(CarolTroveColl);
    });

    it("should have transferred the correct amount BFE token during position opening (carol position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(carol.address);

      expect(balance).to.be.equal(CarolBFEBalanceAtOpening);
    });

    it("should let another user provide to stability pool (carol)", async () => {
      await provideToStabilityPool({
        caller: carol,
        amount: CarolBFEBalanceAtOpening,
      });
      const deposit = await stabilityPool.getCompoundedBaseFeeLMADeposit(
        carol.address
      );

      expect(deposit).to.be.equal(CarolBFEBalanceAtOpening);
    });

    it("should result into a correct balance of stability pool", async () => {
      const balance = await baseFeeLMAToken.balanceOf(
        await stabilityPool.getAddress()
      );
      expect(balance).to.be.equal("6780592430748703568000000000");
    });

    it("should let withdraw provided funds", async () => {
      await increase(615);
      await stabilityPool.connect(bob).withdrawFromSP(BobUnstakeFirst);
    });

    it("Withdrawn funds should result in a correct balance", async () => {
      compareWithFault(
        await baseFeeLMAToken.balanceOf(bob.address),
        BobUnstakeFirst
      );
    });

    it("should let redeem collateral, retrieve correct amount of bfe from account and transfer back correct amount of collateral", async () => {
      const balanceCollBefore = await payToken.balanceOf(bob.address);
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

      compareWithFault(
        balanceCollAfter - balanceCollBefore,
        BobCollBalanceAfterRedemption
      );
      expect(balanceCollAfter - balanceCollBefore).to.be.equal(
        BobCollBalanceAfterRedemption
      );
    });

    it("should have a correct entire system debt (after bob redeems coll)", async () => {
      await checkCollDebtCorrectness({
        expectedColl: totalCollBobFirstRedemption,
        expectedDebt: totalDebtBobFirstRedemption,
      });
    });

    it("should result into correct debt and coll in a redeemed position", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: alice });

      expect(debt).to.be.equal(AliceTroveDebtAfterBobRedemption);
      expect(coll).to.be.equal(AliceTroveCollAfterBobRedemption);
    });

    it("should result into a correct CR in alices position", async () => {
      expect(await unreliableTroveCR({ owner: alice })).to.be.equal(
        AliceCRAfterBobRedemption
      );
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
      await increase(80);
      await expect(troveCollIncrease({ amount: BobTroveIncreaseCollFirst })).not
        .to.be.reverted;
    });

    it("should have a correct entire system debt (after bob increases coll)", async () => {
      await checkCollDebtCorrectness({
        expectedColl: totalCollBobIncrease,
        expectedDebt: totalDebtBobIncrease,
      });
    });

    it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: bob });

      expect(debt).to.be.equal(BobTroveDebtAfterIncrease);
      expect(coll).to.be.equal(BobTroveCollAfterIncrease);
    });

    it("should have a correct CR after coll increase in position (bob position)", async () => {
      expect(await unreliableTroveCR({ owner: bob })).to.be.equal(
        BobCRAfterIncrease
      );
    });

    it("should have a correct entire system debt (just before carol liquidates alice)", async () => {
      await checkCollDebtCorrectness({
        expectedColl: totalCollJustBeforeAliceLiquidated,
        expectedDebt: totalDebtJustBeforeAliceLiquidated,
      });
    });

    it("should let liquidate troves with CR below minimal", async () => {
      expect(await unreliableTroveCR({ owner: alice })).to.be.equal(
        AliceCRAtLiquidation
      );
      expect(await troveManager.MCR()).to.be.greaterThan(AliceCRAtLiquidation);

      const balanceETHBefore = await payToken.balanceOf(carol.address);
      await increase(15);
      await expect(
        troveManager.connect(carol).batchLiquidateTroves([alice.address])
      ).not.be.reverted;
      const balanceAfter = await payToken.balanceOf(carol.address);

      expect(balanceAfter - balanceETHBefore).to.be.equal(
        "2861496250150000000"
      );
    });

    it("should have a correct entire system debt (bob liquidates alice)", async () => {
      const coll = await troveManager.getEntireSystemColl();
      const debt = await troveManager.getEntireSystemDebt();

      expect(coll).to.be.equal(totalCollAliceLiquidated);
      expect(debt).to.be.equal(totalDebtAliceLiquidated);
    });

    it("should result into empty stability pool", async () => {
      const balance = await baseFeeLMAToken.balanceOf(
        await stabilityPool.getAddress()
      );

      expect(balance).to.be.equal(0);
    });

    it("should be no position after liquidation", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: alice });

      expect(debt).to.be.equal(0);
      expect(coll).to.be.equal(0);
    });

    it("should leave bfe tokens on liquidated user's address", async () => {
      const balance = await baseFeeLMAToken.balanceOf(alice.address);

      expect(balance).to.be.equal("79607517769802142000000000");
    });

    it("should calculate debt and collateral of other users after liquidation (bob position)", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: bob });

      expect(debt).to.be.equal(BobTroveDebtAfterLiquid);
      expect(coll).to.be.equal(BobTroveCollAfterLiquid);
    });

    it("should calculate cr of other positions correclty after liquidation (bob position)", async () => {
      expect(await unreliableTroveCR({ owner: bob })).to.be.equal(
        BobCRAfterLiquid
      );
    });

    it("should have correct trove params in carol trove as well (CR)", async () => {
      expect(await unreliableTroveCR({ owner: carol })).to.be.equal(
        CarolCRAfterLiquid
      );
    });

    it("should have correct trove params in carol trove as well (coll) ", async () => {
      const { coll } = await entireCollAndDebt({ owner: carol });
      expect(coll).to.be.equal(CarolTroveCollAfterLiquid);
    });

    it("should have correct trove params in carol trove as well (debt) ", async () => {
      const { debt } = await entireCollAndDebt({ owner: carol });
      expect(debt).to.be.equal(CarolTroveDebtAfterLiquid);
    });

    it("should let redeem tokens if there is no position opened in the system", async () => {
      await increase(13285);

      const balanceBefore = await payToken.balanceOf(alice.address);
      const hint = await hintHelpers.getRedemptionHints(
        AliceRedemptionFirst,
        gasPrice1114,
        0
      );

      await expect(
        troveManager
          .connect(alice)
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

      const balanceAfter = await payToken.balanceOf(alice.address);

      expect(balanceAfter - balanceBefore).to.be.equal(4);
    });

    it("should result into correct debt and collateral in a redeemed position", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: bob });

      expect(debt).to.be.equal(BobTroveDebtAfterRedemption);
      expect(coll).to.be.equal(BobTroveCollAfterRedemption);
    });

    it("should have a correct entire system debt (alice redeems bob)", async () => {
      const coll = await troveManager.getEntireSystemColl();
      const debt = await troveManager.getEntireSystemDebt();

      expect(coll).to.be.equal(totalCollAliceRedeemsBob);
      expect(debt).to.be.equal(totalDebtAliceRedeemsBob);
    });

    it("should allow increasing debt in the position (bob position)", async () => {
      await increase(14250);
      await expect(
        troveDebtIncrease({
          caller: bob,
          amount: BobTroveIncreaseDebtSecond,
        })
      ).not.to.be.reverted;
    });

    it("should calculate bobs CR correctly after the second increase", async () => {
      expect(BobCRAfterSecondIncrease).to.be.equal(
        await unreliableTroveCR({ owner: bob })
      );
    });

    it("should calculate debt and collateral after position debt increase (bob position)", async () => {
      const { debt, coll } = await entireCollAndDebt({ owner: bob });

      expect(debt).to.be.equal(BobTroveDebtAfterSecondIncrease);
      expect(coll).to.be.equal(BobTroveCollAfterSecondIncrease);
    });

    it("should correctly system shouldn't get into recovery mode wrongly", async () => {
      await setNewBaseFeePrice(65);
      await setNewBaseFeePrice(70);
      await setNewBaseFeePrice(80);
      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        false
      );
    });

    it("should let borrow more tokens during the recovery mode and transfer tokens correctly", async () => {
      await increase(3990);
      const carolBFEBalanceBefore = await baseFeeLMAToken.balanceOf(
        carol.address
      );
      const carolCollBalanceBefore = await payToken.balanceOf(carol.address);
      await payToken
        .connect(carol)
        .approve(await borrowerOperations.getAddress(), CarolIncreaseColl);
      await expect(
        borrowerOperations
          .connect(carol)
          .adjustTrove(
            ethers.parseEther("1"),
            0,
            CarolIncreaseColl,
            CarolIncreaseDebt,
            true,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).not.to.be.reverted;

      const fee = BigInt("22000000000");

      // expect(carolBFEBalanceBefore + CarolIncreaseDebt - fee).to.be.equal(
      //   await baseFeeLMAToken.balanceOf(carol.address)
      // );
      expect(CarolIncreaseColl).to.be.equal(
        carolCollBalanceBefore - (await payToken.balanceOf(carol.address))
      );
    });

    it("should let provide to stability pool in recovery mode", async () => {
      await expect(
        provideToStabilityPool({
          caller: carol,
          amount: "100000",
        })
      ).not.to.be.reverted;
    });

    it("should let alice liquidate bob", async () => {
      expect(await unreliableTroveCR({ owner: bob })).to.be.equal(
        BobCRAtLiquidation
      );
      expect(await troveManager.MCR()).to.be.greaterThan(BobCRAtLiquidation);

      const balanceETHBefore = await payToken.balanceOf(carol.address);
      await increase(15);
      await expect(
        troveManager.connect(carol).batchLiquidateTroves([bob.address])
      ).not.be.reverted;
      const balanceAfter = await payToken.balanceOf(carol.address);

      expect(balanceAfter - balanceETHBefore).to.be.equal(
        "25196105754964725575"
      );
    });

    it("should let carol completely repay and close her debt correctly", async () => {
      const collBalanceBefore = await payToken.balanceOf(carol.address);
      await increase(10000);
      await openTroveToBorrowerOperations({
        caller: bob,
        collAmount: await payToken.balanceOf(bob),
        baseFeeLMAAmount:
          (await entireCollAndDebt({ owner: carol })).debt / BigInt(4),
      });
      await increase(20000);

      await troveDebtIncrease({
        caller: bob,
        amount: (await entireCollAndDebt({ owner: carol })).debt / BigInt(2),
      });

      await increase(40000);

      await troveDebtIncrease({
        caller: bob,
        amount: (await entireCollAndDebt({ owner: carol })).debt / BigInt(2),
      });
      await increase(40000);
      await troveDebtIncrease({
        caller: bob,
        amount: (await entireCollAndDebt({ owner: carol })).debt / BigInt(2),
      });
      await baseFeeLMAToken
        .connect(alice)
        .transfer(
          carol.address,
          await baseFeeLMAToken.balanceOf(alice.address)
        );
      await baseFeeLMAToken
        .connect(bob)
        .transfer(carol.address, await baseFeeLMAToken.balanceOf(bob.address));

      await expect(borrowerOperations.connect(carol).closeTrove()).to.not.be
        .reverted;
    });

    // TODO: Get into a separate file

    it("should not mark oracles as broken if price was increased by more then 12.5%", async () => {
      const amount = ethers.parseUnits("100000", "gwei");
      const block = await latestBlock();
      await mainOracle.feedBaseFeeValue(amount, block);
      await priceFeed.fetchPrice();
      expect(await priceFeed.status()).to.be.equal(1);
      await secondaryOracle.feedBaseFeeValue(
        ethers.parseUnits("100000", "gwei"),
        block
      );
      await priceFeed.fetchPrice();
      expect(await priceFeed.status()).to.be.equal(0);
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
