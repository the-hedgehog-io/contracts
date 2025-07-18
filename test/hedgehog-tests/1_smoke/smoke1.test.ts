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
  OpenTrove,
  AdjustTroveParamsToBorrowerOperations,
  getAdjustTroveParams,
  getCollRatioParams,
  CollateralRatioParams,
  GetEntireCollAndDebtParams,
  checkCorrectness,
  validateCollDebtMatch,
  setNewParamsToBaseFee,
  redeem,
  RedeemCollateral,
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

    let provideToStabilityPool: ProvideToStabilityPool;
    let openTrove: OpenTrove;
    let troveDebtIncrease: AdjustTroveParamsToBorrowerOperations;
    let troveCollIncrease: AdjustTroveParamsToBorrowerOperations;
    let getCR: CollateralRatioParams;
    let getTroveAndCheck: ({
      owner,
      expectedColl,
      expectedDebt,
    }: {
      owner?: SignerWithAddress | undefined;
      expectedColl?: bigint | undefined;
      expectedDebt?: bigint | undefined;
    }) => Promise<void>;
    let getTrove: GetEntireCollAndDebtParams;

    let setNewBaseFeePrice: (_amount: number) => Promise<void>;
    let compareWithFault: (
      arg1: bigint | number,
      arg2: bigint | number,
      faultScale?: number
    ) => void;
    let checkCollDebtCorrectness: ({
      expectedColl,
      expectedDebt,
    }: {
      expectedColl: bigint;
      expectedDebt: bigint;
    }) => Promise<void>;
    let redeemCollateral: RedeemCollateral;

    const gasCompensationReserve = BigInt("300000000000000000000000");
    const gasPrice010 = "30000000000";
    const gasPrice1114 = 110;
    const expectedStakedBalance = "4970074994375421844000000000";
    const expectedStabilityPoolAfterDeposit = "6834500326168553505250000000";
    const expectedLiquidationReward = "25196093393307934725";
    const expectedLiquidationProfit = "2861488750900000000";
    const remainingBFEAfterLiquidation = "79818616762009185600000000";

    // Alice:
    const AliceTroveColl = BigInt("602000000000000000000");
    const AliceTroveDebtWithError = BigInt("11000000000000000000000000");
    const AliceTroveDebt = BigInt("4000000000000000000000000000");
    const AliceTroveOpeningFee = BigInt("20000000000000000000000000");
    const AliceBFEBalanceAtOpening = BigInt("3980000000000000000000000000");
    const AliceInitialCR = BigInt("5016290444883300419");
    const expectedTotalSupplyBeforeAliceIncrease = BigInt(
      "6000000000000000000000000000"
    );
    const AliceTroveIncreaseDebt = BigInt("650000000000000000000000000");
    const AliceDebtAfterFirstIncrease = BigInt("4650000000000000000000000000");
    const AliceCollAfterFirstIncrease = BigInt("602000000000000000000");
    const AliceCRAfterFirstIncrease = BigInt("4315133790651499186");
    const AliceTroveCollAfterBobRedemption = BigInt("572297750180000000000");
    const AliceTroveDebtAfterBobRedemption = BigInt(
      "3660225006000000000000000000"
    );

    const AliceCRAfterBobRedemption = BigInt("5211863107157480216");
    const AliceRedemptionFirst = BigInt("4958756435844540000000");
    const AliceCRAtLiquidation = BigInt("2796969648483333333");

    // Bob:
    const BobTroveColl = BigInt("3000000000000000000000");
    const BobTroveDebt = BigInt("2000000000000000000000000000");
    const BobInitialCR = BigInt("49992501124831275308");
    const BobTroveOpeningFee = BigInt("1009925006000000000000000000");
    const BobIdealBFEBalanceAtOpening = BigInt("990074994000000000000000000");
    const BobActualBFEBalanceAtOpening = BigInt("990074994375421844000000000");
    const BobUnstakeFirst = BigInt("990074994000000000000000000");
    const BobRedemptionFirst = BigInt("990074994000000000000000000");
    const BobCollBalanceAfterRedemption = BigInt("29345273626578239609");
    const BobTroveIncreaseCollFirst = BigInt("2000000000000000000000");
    const BobTroveCollAfterIncrease = BigInt("5000000000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("2000000000000000000000000000");
    const BobCRAfterIncrease = BigInt("41660417604026062757");
    const BobTroveCollAfterLiquid = BigInt("5505716040345559500000");
    const BobTroveDebtAfterLiquid = BigInt("5250943877442273534635875000");
    const BobCRAfterLiquid = BigInt("2097038615856387");

    const BobTroveIncreaseDebtSecond = BigInt("400000000000000000000000000");
    const BobTroveCollAfterRedemption = BigInt("5505716040345559500000");
    const BobTroveDebtAfterRedemption = BigInt("5250943877442273534635875000");
    const BobTroveDebtAfterSecondIncrease = BigInt(
      "5650943877442273534635875000"
    );
    const BobTroveCollAfterSecondIncrease = BigInt("5505716040345559500000");
    const BobCRAfterSecondIncrease = BigInt("8857275012576471863");
    const BobCRAtLiquidation = BigInt("12178753142292648812");

    // Carol:
    const CarolTroveColl = BigInt("630000000000000000000");
    const CarolTroveDebt = BigInt("3000000000000000000000000000");
    const CarolInitialCR = BigInt("6999300069993000699");
    const CarolBFEBalanceAtOpening = BigInt("1530462258904477332000000000");
    const CarolTroveCollAfterLiquid = BigInt("693720221083540497000");
    const CarolTroveDebtAfterLiquid = BigInt("6659881128557726465364120250");
    const CarolCRAfterLiquid = BigInt("208328109073554");
    const CarolIncreaseDebt = BigInt("22000000000");
    const CarolIncreaseColl = BigInt("7040000000000000000000");
    const expectedTotalSupplyBeforeCarolMint = BigInt(
      "6650000000000000000000000000"
    );
    const totalCollateralAliceOpening = BigInt("602000000000000000000");
    const totalDebtAliceOpening = BigInt("4000000000000000000000000000");
    const totalCollateralBobOpening = BigInt("3602000000000000000000");
    const totalDebtBobOpening = BigInt("6000000000000000000000000000");
    const totalDebtAliceIncrease = BigInt("6650000000000000000000000000");
    const totalCollAliceIncrease = BigInt("3602000000000000000000");
    const totalCollCarolOpening = BigInt("4232000000000000000000");
    const totalDebtCarolOpening = BigInt("9650000000000000000000000000");
    const totalCollBobFirstRedemption = BigInt("4202297750180000000000");
    const totalDebtBobFirstRedemption = BigInt("8660825006000000000000000000");
    const totalCollBobIncrease = BigInt("6202297750180000000000");
    const totalDebtBobIncrease = BigInt("8660825006000000000000000000");
    const totalCollJustBeforeAliceLiquidated = BigInt("6202297750180000000000");
    const totalDebtJustBeforeAliceLiquidated = BigInt(
      "8660825006000000000000000000"
    );
    const totalCollAliceLiquidated = BigInt("6199436261429100000000");
    const totalDebtAliceLiquidated = BigInt("11910825006000000000000000000");
    const totalCollAliceRedeemsBob = BigInt("6199436261429100000000");
    const totalDebtAliceRedeemsBob = BigInt("11910825006000000000000000000");
    const balanceSPAfterLiquidation = BigInt("6442239575075096310250000000");

    before(async () => {
      [, , , alice, bob, carol] = await getSigners({
        fork: false,
      });

      ({
        priceFeed,
        troveManager,
        stabilityPool,
        borrowerOperations,
        hintHelpers,
        baseFeeLMAToken,
        payToken,
        mainOracle,
        secondaryOracle,
      } = await setupContracts());

      ({ provideToStabilityPool } = await getStabilityPoolMethods({
        baseFeeLMAToken,
        stabilityPool,
      }));

      ({ openTrove } = await getOpenTrove({
        borrowerOperations,
        payToken,
      }));

      ({ troveDebtIncrease, troveCollIncrease } = await getAdjustTroveParams({
        borrowerOperations,
        payToken,
      }));

      ({ getCR, getTroveAndCheck, getTrove } = await getCollRatioParams({
        troveManager,
      }));

      ({ checkCollDebtCorrectness } = await checkCorrectness({ troveManager }));

      ({ compareWithFault } = await validateCollDebtMatch());

      ({ setNewBaseFeePrice } = await setNewParamsToBaseFee({
        mainOracle,
        secondaryOracle,
        priceFeed,
      }));

      ({ redeemCollateral } = await redeem({
        hintHelpers,
        troveManager,
      }));
    });

    it("should not let open trove if CR is below minimum", async () => {
      await priceFeed.setLastGoodPrice(gasPrice010);

      await expect(
        openTrove({
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
        openTrove({
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
        openTrove({
          caller: alice,
          baseFeeLMAAmount: AliceTroveDebt,
          collAmount: AliceTroveColl,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollateralAliceOpening,
          expectedDebt: totalDebtAliceOpening + gasCompensationReserve,
        })
      ).not.to.be.reverted;
    });

    it("should calculate and return correct CR for alice's position", async () => {
      expect(await getCR({ owner: alice })).to.be.equal(AliceInitialCR);
    });

    it("should have a correct amount of collateral and debt in position record (alice position)", async () => {
      await expect(
        getTroveAndCheck({
          owner: alice,
          expectedColl: AliceTroveColl,
          expectedDebt: AliceTroveDebt + gasCompensationReserve,
        })
      ).not.to.be.reverted;
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
        openTrove({
          caller: bob,
          baseFeeLMAAmount: BobTroveDebt,
          collAmount: BobTroveColl,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct CR in a new position (bob position)", async () => {
      expect(await getCR({ owner: bob })).to.be.equal(BobInitialCR);
    });

    it("should have a correct entire system debt (after bob opens position)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollateralBobOpening,
          expectedDebt:
            totalDebtBobOpening + gasCompensationReserve * BigInt(2),
        })
      ).not.to.be.reverted;
    });

    it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
      await getTroveAndCheck({
        owner: bob,
        expectedColl: BobTroveColl,
        expectedDebt: BobTroveDebt + gasCompensationReserve,
      });
    });

    it("should have transferred the correct amount BFE token during position opening (bob position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(bob.address);

      expect(
        compareWithFault(
          BobIdealBFEBalanceAtOpening,
          BobTroveDebt - BobTroveOpeningFee
        )
      ).not.to.be.reverted;

      expect(
        compareWithFault(
          balance,
          BobIdealBFEBalanceAtOpening + gasCompensationReserve
        )
      ).not.to.be.reverted;
    });

    it("should have a correct CR in a new position (bob position)", async () => {
      expect(await getCR({ owner: bob })).to.be.equal(BobInitialCR);
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

      expect(balance).to.be.equal(expectedStakedBalance);
    });

    it("should have correct total supply before alice increase", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal(
        expectedTotalSupplyBeforeAliceIncrease +
          gasCompensationReserve * BigInt(2)
      );
    });

    it("should let adjust the position (alice position)", async () => {
      await increase(2000);
      await expect(
        troveDebtIncrease({
          caller: alice,
          amount: AliceTroveIncreaseDebt,
        })
      ).not.to.be.reverted;

      await expect(
        provideToStabilityPool({
          caller: alice,
          amount: await baseFeeLMAToken.balanceOf(alice.address),
        })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollAliceIncrease,
          expectedDebt:
            totalDebtAliceIncrease + gasCompensationReserve * BigInt(2),
        })
      ).not.to.be.reverted;
    });

    it("should result into a correct debt and collateral in a position after decrease", async () => {
      await expect(
        getTroveAndCheck({
          owner: alice,
          expectedColl: AliceCollAfterFirstIncrease,
          expectedDebt: AliceDebtAfterFirstIncrease + gasCompensationReserve,
        })
      ).not.to.be.reverted;
    });

    it("should result into a correct CR in a alice position", async () => {
      expect(await getCR({ owner: alice })).to.be.equal(
        AliceCRAfterFirstIncrease
      );
    });

    it("should have correct total supply before carol mint", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal(
        expectedTotalSupplyBeforeCarolMint + gasCompensationReserve * BigInt(2)
      );
    });

    it("should let open another position in the system (carol position)", async () => {
      await increase(17970);

      await expect(
        openTrove({
          caller: carol,
          collAmount: CarolTroveColl,
          baseFeeLMAAmount: CarolTroveDebt,
        })
      ).not.to.be.reverted;
    });

    it("should result into a correct CR in a position(carol position)", async () => {
      expect(await getCR({ owner: carol })).to.be.equal(CarolInitialCR);
    });

    it("should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollCarolOpening,
          expectedDebt:
            totalDebtCarolOpening + gasCompensationReserve * BigInt(3),
        })
      ).not.to.be.reverted;
    });

    it("should have a correct amount of collateral and debt in position record (carol position)", async () => {
      await expect(
        getTroveAndCheck({
          owner: carol,
          expectedColl: CarolTroveColl,
          expectedDebt: CarolTroveDebt + gasCompensationReserve,
        })
      ).not.to.be.reverted;
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
      expect(balance).to.be.equal(expectedStabilityPoolAfterDeposit);
    });

    it("should let withdraw provided funds", async () => {
      await increase(615);
      await expect(stabilityPool.connect(bob).withdrawFromSP(BobUnstakeFirst))
        .not.to.be.reverted;
    });

    it("Withdrawn funds should result in a correct balance", async () => {
      compareWithFault(
        await baseFeeLMAToken.balanceOf(bob.address),
        BobUnstakeFirst
      );
    });

    it("should let redeem collateral, retrieve correct amount of bfe from account and transfer back correct amount of collateral", async () => {
      const balanceCollBefore = await payToken.balanceOf(bob.address);
      await redeemCollateral({
        caller: bob,
        baseFeeLMAamount: BobRedemptionFirst,
        gasPrice: gasPrice010,
      });

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
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollBobFirstRedemption,
          expectedDebt: totalDebtBobFirstRedemption,
        })
      ).not.to.be.reverted;
    });

    it("should result into correct debt and coll in a redeemed position", async () => {
      await expect(
        getTroveAndCheck({
          owner: alice,
          expectedColl: AliceTroveCollAfterBobRedemption,
          expectedDebt: AliceTroveDebtAfterBobRedemption,
        })
      ).not.to.be.reverted;
    });

    it("should result into a correct CR in alice's position", async () => {
      expect(await getCR({ owner: alice })).to.be.equal(
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
      await expect(
        troveCollIncrease({ caller: bob, amount: BobTroveIncreaseCollFirst })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt (after bob increases coll)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollBobIncrease,
          expectedDebt: totalDebtBobIncrease,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
      await expect(
        getTroveAndCheck({
          owner: bob,
          expectedColl: BobTroveCollAfterIncrease,
          expectedDebt: BobTroveDebtAfterIncrease + gasCompensationReserve,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct CR after coll increase in position (bob position)", async () => {
      expect(await getCR({ owner: bob })).to.be.equal(BobCRAfterIncrease);
    });

    it("should have a correct entire system debt (just before carol liquidates alice)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollJustBeforeAliceLiquidated,
          expectedDebt: totalDebtJustBeforeAliceLiquidated,
        })
      ).not.to.be.reverted;
    });

    it("should let another user provide to stability pool (check)", async () => {
      await expect(
        troveDebtIncrease({
          caller: carol,
          amount: AliceTroveIncreaseDebt * BigInt("5"),
        })
      ).not.to.be.reverted;
      const balance = await baseFeeLMAToken.balanceOf(carol.address);

      await provideToStabilityPool({
        caller: carol,
        amount: balance,
      });

      await setNewBaseFeePrice(500000);
      await setNewBaseFeePrice(500000);
      await setNewBaseFeePrice(500000);
      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        true
      );
    });

    it("should let liquidate troves with CR below minimal", async () => {
      // expect(await getCR({ owner: alice })).to.be.equal(AliceCRAtLiquidation);
      // expect(await troveManager.MCR()).to.be.greaterThan(AliceCRAtLiquidation);

      const balanceETHBefore = await payToken.balanceOf(carol.address);
      await increase(15);
      await troveManager.connect(carol).batchLiquidateTroves([alice.address]);

      const balanceAfter = await payToken.balanceOf(carol.address);

      expect(balanceAfter - balanceETHBefore).to.be.equal(
        expectedLiquidationProfit
      );
    });

    it("should have a correct entire system debt (bob liquidates alice)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollAliceLiquidated,
          expectedDebt: totalDebtAliceLiquidated,
        })
      ).not.to.be.reverted;
    });

    it("should result correctly stability pool", async () => {
      const balance = await baseFeeLMAToken.balanceOf(
        await stabilityPool.getAddress()
      );

      expect(balance).to.be.equal(balanceSPAfterLiquidation);
    });

    it("should be no position after liquidation", async () => {
      await expect(
        getTroveAndCheck({
          owner: alice,
          expectedColl: BigInt(0),
          expectedDebt: BigInt(0),
        })
      ).not.to.be.reverted;
    });

    it("should leave bfe tokens on liquidated user's address", async () => {
      const balance = await baseFeeLMAToken.balanceOf(alice.address);

      expect(balance).to.be.equal(BigInt(0));
    });

    it("should calculate debt and collateral of other users after liquidation (bob position)", async () => {
      await expect(
        getTroveAndCheck({
          owner: bob,
          expectedColl: BobTroveCollAfterLiquid,
          expectedDebt: BobTroveDebtAfterLiquid,
        })
      ).not.to.be.reverted;
    });

    it("should calculate cr of other positions correctly after liquidation (bob position)", async () => {
      expect(await getCR({ owner: bob })).to.be.equal(BobCRAfterLiquid);
    });

    it("should have correct trove params in carol trove as well (CR)", async () => {
      expect(await getCR({ owner: carol })).to.be.equal(CarolCRAfterLiquid);
    });

    it("should have correct trove params in carol trove as well (coll and debt) ", async () => {
      await expect(
        getTroveAndCheck({
          owner: carol,
          expectedColl: CarolTroveCollAfterLiquid,
          expectedDebt: CarolTroveDebtAfterLiquid,
        })
      ).not.to.be.reverted;
    });

    it("should not let redeem tokens if there is no position opened in the system and if totalWStETHDrawn =0", async () => {
      await increase(13285);

      await setNewBaseFeePrice(gasPrice1114);
      await setNewBaseFeePrice(gasPrice1114);
      await setNewBaseFeePrice(gasPrice1114);

      await baseFeeLMAToken
        .connect(carol)
        .transfer(alice.address, ethers.parseEther("8000"));

      await expect(
        redeemCollateral({
          caller: alice,
          baseFeeLMAamount: AliceRedemptionFirst,
          gasPrice: gasPrice1114,
        })
      ).to.be.revertedWith("TroveManager: Unable to redeem any amount");
    });

    it("should result into correct debt and collateral in a redeemed position", async () => {
      await expect(
        getTroveAndCheck({
          owner: bob,
          expectedColl: BobTroveCollAfterRedemption,
          expectedDebt: BobTroveDebtAfterRedemption,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt (alice redeems bob)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollAliceRedeemsBob,
          expectedDebt: totalDebtAliceRedeemsBob,
        })
      ).not.to.be.reverted;
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
      expect(await getCR({ owner: bob })).to.be.equal(BobCRAfterSecondIncrease);
    });

    it("should calculate debt and collateral after position debt increase (bob position)", async () => {
      await expect(
        getTroveAndCheck({
          owner: bob,
          expectedColl: BobTroveCollAfterSecondIncrease,
          expectedDebt: BobTroveDebtAfterSecondIncrease,
        })
      ).not.to.be.reverted;
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

      const carolCollBalanceBefore = await payToken.balanceOf(carol.address);

      await expect(
        troveDebtIncrease({
          caller: carol,
          amount: CarolIncreaseDebt,
          collIncrease: CarolIncreaseColl,
        })
      ).not.to.be.reverted;

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

    it("should not let alice liquidate bob", async () => {
      expect(await getCR({ owner: bob })).to.be.equal(BobCRAtLiquidation);

      await increase(15);
      await expect(
        troveManager.connect(carol).batchLiquidateTroves([bob.address])
      ).be.revertedWith("TroveManager: nothing to liquidate");
    });

    it("should let carol completely repay and close her debt correctly", async () => {
      const collBalanceBefore = await payToken.balanceOf(carol.address);
      await increase(10000);
      const trove = await getTrove({ owner: carol });
      await openTrove({
        caller: alice,
        collAmount: AliceTroveColl,
        baseFeeLMAAmount: trove.debt / BigInt(4),
      });
      await increase(20000);

      await troveDebtIncrease({
        caller: bob,
        amount: (await getTrove({ owner: carol })).debt / BigInt(2),
      });

      await increase(40000);

      await troveDebtIncrease({
        caller: bob,
        amount: (await getTrove({ owner: carol })).debt / BigInt(2),
      });
      await increase(40000);
      await troveDebtIncrease({
        caller: bob,
        amount: (await getTrove({ owner: carol })).debt / BigInt(2),
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

    it("should not mark oracles as broken if price was increased by more than 12.5%", async () => {
      await setNewBaseFeePrice(100000);

      await priceFeed.fetchPrice();
      expect(await priceFeed.status()).to.be.equal(0);
    });

    it("should mark both oracles as working if price consists", async () => {
      await setNewBaseFeePrice(1001);

      await setNewBaseFeePrice(1004);
      expect(await priceFeed.status()).to.be.equal(0);
    });

    it("should mark oracle as frozen if no updates happens for more than 69 blocks", async () => {
      await mine(70);

      await setNewBaseFeePrice(1000);
      expect(await priceFeed.status()).to.be.equal(0);
    });
  });
});
