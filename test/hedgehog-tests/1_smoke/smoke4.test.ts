import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
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
  checkCorrectness,
  validateCollDebtMatch,
  setNewParamsToBaseFee,
} from "../../utils/shared";

const { increase } = time;

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

    let compareWithFault: (
      arg1: bigint | number,
      arg2: bigint | number,
      faultScale?: number
    ) => void;
    let openTrove: OpenTrove;
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
    let provideToStabilityPool: ProvideToStabilityPool;
    let troveDebtIncrease: AdjustTroveParamsToBorrowerOperations;
    let setNewBaseFeePrice: (_amount: number) => Promise<void>;
    let checkCollDebtCorrectness: ({
      expectedColl,
      expectedDebt,
    }: {
      expectedColl: bigint;
      expectedDebt: bigint;
    }) => Promise<void>;

    const gasCompensationReserve = BigInt("300000000000000000000000");
    const gasPrice010 = "30000000000";
    const expectedStakedBalance = "4970024999000000000000000000";
    const expectedStabilityPoolAfterDeposit = "6780592430748703568000000000";
    const transferAmount = "9000000000000000000000";

    // Alice:
    const AliceTroveColl = BigInt("602000000000000000000");
    const AliceTroveDebtWithError = BigInt("111000000");
    const AliceTroveDebt = BigInt("4000000000000000000000000000");
    const AliceTroveOpeningFee = BigInt("20000000000000000000000000");
    const AliceBFEBalanceAtOpening = BigInt("3980000000000000000000000000");
    const AliceInitialCR = BigInt("5016541253133333333");
    const expectedTotalSupplyBeforeAliceIncrease =
      BigInt("6000000000000000000000000000");

    const AliceTroveIncreaseDebt = BigInt("3600000000000000000000000000");
    const AliceDebtAfterFirstIncrease = BigInt("7600000000000000000000000000");
    const AliceCollAfterFirstIncrease = BigInt("602000000000000000000");
    const AliceCRAfterFirstIncrease = BigInt("2640316136166666666");

    const BobTroveColl = BigInt("3000000000000000000000");
    const BobTroveDebt = BigInt("2000000000000000000000000000");
    const BobInitialCR = BigInt("49997500124966666666");
    const BobTroveOpeningFee = BigInt("1009975001");
    const BobIdealBFEBalanceAtOpening = BigInt("990024999000000000000000000");
    const BobActualBFEBalanceAtOpening = BigInt("990024999000000000000000000");
    const BobUnstakeFirst = BigInt("990024999000000000000000000");
    const BobRedemptionFirst = BigInt("990024999000000000000000000");
    const BobCollWithdraw = "225000000000000000";

    // Carol:
    const CarolTroveColl = BigInt("4000000000000000000000");
    const CarolTroveDebt = BigInt("6000000000000000000000000000");
    const CarolTroveOpeningFee = BigInt("4189432568");
    const CarolInitialCR = BigInt("22221851858000000000");
    const CarolBFEBalanceAtOpening = BigInt("1810567431748703568000000000");
    const expectedTotalSupplyBeforeCarolMint = BigInt("9600000000000000000000000000");

    const totalCollateralAliceOpening = BigInt("602000000000000000000");
    const totalDebtAliceOpening = BigInt("4000000000000000000000000000");
    const totalCollateralBobOpening = BigInt("3602000000000000000000");
    const totalDebtBobOpening = BigInt("6000000000000000000000000000");
    const totalDebtAliceIncrease = BigInt("9600000000000000000000000000");
    const totalCollAliceIncrease = BigInt("3602000000000000000000");
    const totalCollCarolOpening = BigInt("7602000000000000000000");
    const totalDebtCarolOpening = BigInt("15600000000000000000000000000");

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

      ({ compareWithFault } = await validateCollDebtMatch());

      ({ openTrove } = await getOpenTrove({ payToken, borrowerOperations }));

      ({ getCR, getTroveAndCheck } = await getCollRatioParams({
        troveManager,
      }));

      ({ provideToStabilityPool } = await getStabilityPoolMethods({
        baseFeeLMAToken,
        stabilityPool,
      }));

      ({ troveDebtIncrease } = await getAdjustTroveParams({
        borrowerOperations,
        payToken,
      }));

      ({ setNewBaseFeePrice } = await setNewParamsToBaseFee({
        mainOracle,
        secondaryOracle,
        priceFeed,
      }));

      ({ checkCollDebtCorrectness } = await checkCorrectness({ troveManager }));
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
          expectedDebt: totalDebtBobOpening + gasCompensationReserve * BigInt(2),
        })
      ).not.to.be.reverted;
    });

    it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
      await expect(
        getTroveAndCheck({
          owner: bob,
          expectedColl: BobTroveColl,
          expectedDebt: BobTroveDebt + gasCompensationReserve,
        })
      ).not.to.be.reverted;
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
        provideToStabilityPool({ amount: BobActualBFEBalanceAtOpening })
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
        expectedTotalSupplyBeforeAliceIncrease + gasCompensationReserve * BigInt(2)
      );
    });

    it("should let adjust the position (alice position)", async () => {
      await increase(2000);
      await expect(
        troveDebtIncrease({ caller: alice, amount: AliceTroveIncreaseDebt })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollAliceIncrease,
          expectedDebt: totalDebtAliceIncrease + gasCompensationReserve * BigInt(2),
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
          expectedDebt: totalDebtCarolOpening + gasCompensationReserve * BigInt(3),
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
      expect(
        compareWithFault(
          CarolBFEBalanceAtOpening,
          CarolTroveDebt - CarolTroveOpeningFee
        )
      ).not.to.be.reverted;
      expect(balance).to.be.eq(CarolBFEBalanceAtOpening);
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
      expect(
        compareWithFault(
          await baseFeeLMAToken.balanceOf(bob.address),
          BobUnstakeFirst
        )
      ).not.to.be.reverted;
    });

    it("Should not let perform multiple trove adjustments in a single block, but should revert", async () => {
      await increase(90000);
      const price = ethers.parseEther("475");
      const hint = await hintHelpers.getRedemptionHints(
        BobRedemptionFirst,
        price,
        0
      );
      await borrowerOperations
        .connect(bob)
        .withdrawColl(BobCollWithdraw, ethers.ZeroAddress, ethers.ZeroAddress);

      await setNewBaseFeePrice(475);

      const singleTxCaller = await (
        await ethers.getContractFactory("SingleTxCaller")
      ).deploy();
      await payToken
        .connect(carol)
        .transfer(singleTxCaller.target, transferAmount);

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
