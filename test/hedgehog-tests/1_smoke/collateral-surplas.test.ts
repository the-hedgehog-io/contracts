import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ERC20Mock, TestPriceFeed } from "../../../typechain-types";
import {
  BaseFeeLMAToken,
  BaseFeeOracle,
  BorrowerOperations,
  CollSurplusPool,
  HintHelpers,
  StabilityPool,
  TroveManager,
} from "../../../typechain-types/contracts";
import { getSigners, setupContracts } from "../../utils";
import {
  AdjustTroveParamsToBorrowerOperations,
  CollateralRatioParams,
  GetEntireCollAndDebtParams,
  OpenTrove,
  ProvideToStabilityPool,
  RedeemCollateral,
  checkCorrectness,
  getAdjustTroveParams,
  getCollRatioParams,
  getOpenTrove,
  getStabilityPoolMethods,
  redeem,
  setNewParamsToBaseFee,
  validateCollDebtMatch,
} from "../../utils/shared";

const { increase } = time;

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control . CollSurp", () => {
    let alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;
    let priceFeed: TestPriceFeed;
    let troveManager: TroveManager;
    let stabilityPool: StabilityPool;
    let collSurplusPool: CollSurplusPool;
    let borrowerOperations: BorrowerOperations;
    let hintHelpers: HintHelpers;
    let baseFeeLMAToken: BaseFeeLMAToken;
    let payToken: ERC20Mock;
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
    let getTrove: GetEntireCollAndDebtParams;
    let provideToStabilityPool: ProvideToStabilityPool;
    let troveDebtIncrease: AdjustTroveParamsToBorrowerOperations;
    let troveCollIncrease: AdjustTroveParamsToBorrowerOperations;
    let setNewBaseFeePrice: (_amount: number) => Promise<void>;
    let checkCollDebtCorrectness: ({
      expectedColl,
      expectedDebt,
    }: {
      expectedColl: bigint;
      expectedDebt: bigint;
    }) => Promise<void>;
    let decreaseDebt: AdjustTroveParamsToBorrowerOperations;
    let redeemCollateral: RedeemCollateral;

    const gasCompensationReserve = BigInt("300000000000000000000000");
    const maxIterations = 3917044731;
    const expectedStakedBalance = "4970074994000000000000000000";
    const expectedStabilityPoolAfterDeposit = "6678629531277447118000000000";
    const balanceChangeAfterDebtIncrease = "2048945773334724057200000000";

    const AliceTroveColl = BigInt("602000000000000000000");
    const AliceTroveDebt = BigInt("4000000000000000000000000000");
    const AliceTroveOpeningFee = BigInt("20000000000000000000000000");
    const AliceBFEBalanceAtOpening = BigInt("3980000000000000000000000000");

    const AliceInitialCR = BigInt("5016290444866666666");
    const expectedTotalSupplyBeforeAliceIncrease = BigInt(
      "6000000000000000000000000000"
    );
    const AliceStabilityPoolAmount = "222180737000000000000000000";
    const AliceTroveIncreaseDebt = BigInt("400000000000000000000000000");
    const AliceDebtAfterFirstIncrease = BigInt("4400000000000000000000000000");
    const AliceCollAfterFirstIncrease = BigInt("602000000000000000000");
    const AliceCRAfterFirstIncrease = BigInt("4560295131366666666");
    const expectedCollateralAmount = "593397571521060057494";
    const totalSupplyBeforeBobOpensPosition = BigInt(
      "4000000000000000000000000000"
    );
    const BobTroveColl = BigInt("300000000000000000000");
    const BobTroveDebt = BigInt("2000000000000000000000000000");
    const BobInitialCR = BigInt("4999250112466666666");
    const BobTroveOpeningFee = BigInt("1009925006000000000000000000");
    const BobIdealBFEBalanceAtOpening = BigInt("990074994000000000000000000");
    const BobActualBFEBalanceAtOpening = BigInt("990074994000000000000000000");
    const BobTroveCollIncrease = "10000000000000000000000";
    const BobTroveDebtIncrease = "3000000000000000000000000000";

    const BobTroveIncreaseCollFirst = BigInt("1600000000000000000000");
    const BobTroveCollAfterIncrease = BigInt("1900000000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("2000000000000000000000000000");
    const BobCRAfterIncrease = BigInt("15830958689516666666");
    const BobTroveIncreaseDebtSecond = BigInt("4600000000000000000000000000");

    const CarolTroveColl = BigInt("1800000000000000000000");
    const CarolTroveDebt = BigInt("3000000000000000000000000000");
    const CarolTroveOpeningFee = BigInt("1513626200000000000000000000");
    const CarolInitialCR = BigInt("19998000199966666666");
    const CarolBFEBalanceAtOpening = BigInt("1486373800277447118000000000"); //1486295924000000000000000000
    const expectedTotalSupplyBeforeCarolMint = BigInt(
      "6400000000000000000000000000"
    );
    const CarolTroveCollIncrease = "10000000000000000000000";
    const CarolTroveDebtIncrease = "100000000000000000000000000";

    const totalCollateralAliceOpening = BigInt("602000000000000000000");
    const totalDebtAliceOpening = BigInt("4000000000000000000000000000");
    const totalCollateralBobOpening = BigInt("902000000000000000000");
    const totalDebtBobOpening = BigInt("6000000000000000000000000000");
    const totalDebtAliceIncrease = BigInt("6400000000000000000000000000");
    const totalCollAliceIncrease = BigInt("902000000000000000000");
    const totalCollCarolOpening = BigInt("2702000000000000000000");
    const totalDebtCarolOpening = BigInt("9400000000000000000000000000");

    const totalCollBobIncrease = BigInt("4302000000000000000000");
    const totalDebtBobIncrease = BigInt("9400000000000000000000000000");

    before(async () => {
      [, , , alice, bob, carol] = await getSigners({
        fork: false,
      });

      const {
        priceFeed: priceFeedInit,
        troveManager: troveManagerInit,
        stabilityPool: stabilityPoolInit,
        collSurplusPool: collSurplusPoolInit,
        borrowerOperations: borrowerOperationsInit,
        hintHelpers: hintHelpersInit,
        baseFeeLMAToken: BaseFeeLMATokenInit,
        payToken: payTokenInit,
        mainOracle: mainOracleInit,
        secondaryOracle: secondaryOracleInit,
      } = await setupContracts();

      priceFeed = priceFeedInit;
      troveManager = troveManagerInit;
      stabilityPool = stabilityPoolInit;
      collSurplusPool = collSurplusPoolInit;
      borrowerOperations = borrowerOperationsInit;
      hintHelpers = hintHelpersInit;
      (baseFeeLMAToken = BaseFeeLMATokenInit), (payToken = payTokenInit);
      mainOracle = mainOracleInit;
      secondaryOracle = secondaryOracleInit;

      const { compareWithFault: compareWithFaultInit } =
        await validateCollDebtMatch();
      compareWithFault = compareWithFaultInit;

      const { openTrove: openTroveInit } = await getOpenTrove({
        borrowerOperations,
        payToken,
      });

      openTrove = openTroveInit;

      const {
        getCR: getCRInit,
        getTroveAndCheck: getTroveAndCheckInit,
        getTrove: getTroveInit,
      } = await getCollRatioParams({ troveManager });

      getCR = getCRInit;
      getTroveAndCheck = getTroveAndCheckInit;
      getTrove = getTroveInit;

      const { provideToStabilityPool: provideToStabilityPoolInit } =
        await getStabilityPoolMethods({ baseFeeLMAToken, stabilityPool });

      provideToStabilityPool = provideToStabilityPoolInit;

      const {
        troveDebtIncrease: troveDebtIncreaseInit,
        troveCollIncrease: troveCollIncreaseInit,
        decreaseDebt: decreaseDebtInit,
      } = await getAdjustTroveParams({ borrowerOperations, payToken });

      troveDebtIncrease = troveDebtIncreaseInit;
      troveCollIncrease = troveCollIncreaseInit;
      decreaseDebt = decreaseDebtInit;

      const { setNewBaseFeePrice: setNewBaseFeePriceInit } =
        await setNewParamsToBaseFee({ mainOracle, secondaryOracle, priceFeed });
      setNewBaseFeePrice = setNewBaseFeePriceInit;

      const { checkCollDebtCorrectness: checkCollDebtCorrectnessInit } =
        await checkCorrectness({ troveManager });
      checkCollDebtCorrectness = checkCollDebtCorrectnessInit;

      const { redeemCollateral: redeemCollateralInit } = await redeem({
        hintHelpers,
        troveManager,
      });

      redeemCollateral = redeemCollateralInit;
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

      expect(totalSupply).to.be.equal(
        totalSupplyBeforeBobOpensPosition + gasCompensationReserve
      );
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

      expect(compareWithFault(balance, BobIdealBFEBalanceAtOpening)).not.to.be
        .reverted;
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
        expectedTotalSupplyBeforeAliceIncrease +
          gasCompensationReserve * BigInt(2)
      );
    });

    it("should let adjust the position (alice position)", async () => {
      await increase(2010);

      await expect(
        troveDebtIncrease({ caller: alice, amount: AliceTroveIncreaseDebt })
      ).not.to.be.reverted;
      await expect(
        provideToStabilityPool({
          caller: alice,
          amount: AliceStabilityPoolAmount,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt (after alice increases coll in her position)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollAliceIncrease,
          expectedDebt:
            totalDebtAliceIncrease + gasCompensationReserve * BigInt(2),
        })
      ).not.to.be.reverted;
    });

    it("should result into a correct debt and collateral in a position after increase", async () => {
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
      expect(
        compareWithFault(
          CarolBFEBalanceAtOpening,
          CarolTroveDebt - CarolTroveOpeningFee
        )
      ).not.to.be.reverted;
      expect(compareWithFault(balance, CarolBFEBalanceAtOpening)).not.to.be
        .reverted;
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

    it("should let increase collateral to the position (bob position)", async () => {
      await setNewBaseFeePrice(33);
      await setNewBaseFeePrice(36);
      await setNewBaseFeePrice(40);
      await setNewBaseFeePrice(44);
      await setNewBaseFeePrice(48);
      await setNewBaseFeePrice(52);
      await setNewBaseFeePrice(56);
      await setNewBaseFeePrice(60);
      await expect(troveCollIncrease({ amount: BobTroveIncreaseCollFirst })).not
        .to.be.reverted;
    });

    it("should have a correct entire system debt (after bob increases coll)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollBobIncrease,
          expectedDebt:
            totalDebtBobIncrease + gasCompensationReserve * BigInt(3),
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

    it("should allow increasing debt in the position (bob position)", async () => {
      await increase(14270);
      const balanceBefore = await baseFeeLMAToken.balanceOf(bob.address);
      await expect(
        troveDebtIncrease({
          caller: bob,
          amount: BobTroveIncreaseDebtSecond,
        })
      ).not.to.be.reverted;

      expect(
        (await baseFeeLMAToken.balanceOf(bob.address)) - balanceBefore
      ).to.be.equal(balanceChangeAfterDebtIncrease);
    });

    it("should correctly set system into a recovery mode", async () => {
      await setNewBaseFeePrice(140);
      await setNewBaseFeePrice(150);
      await setNewBaseFeePrice(160);
      await setNewBaseFeePrice(160);
      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        true
      );
    });

    it("should not let borrow more tokens resulting into smaller CR", async () => {
      const collIncrease = ethers.parseEther("64");
      const amount = ethers.parseEther("400000000");
      await expect(
        troveDebtIncrease({
          caller: carol,
          amount: amount,
          collIncrease: collIncrease,
        })
      ).to.be.revertedWith(
        "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode"
      );
    });

    it("should update coll surplus correctly in the event of trove closing during redemption", async () => {
      await setNewBaseFeePrice(2);
      await setNewBaseFeePrice(2);
      await setNewBaseFeePrice(2);
      await troveCollIncrease({
        caller: carol,
        amount: CarolTroveCollIncrease,
      });
      await troveCollIncrease({
        caller: bob,
        amount: BobTroveCollIncrease,
      });
      await increase(100000000000000);
      await troveDebtIncrease({
        caller: carol,
        amount: CarolTroveDebtIncrease,
      });
      await increase(100000000000000);
      await troveDebtIncrease({
        caller: bob,
        amount: BobTroveDebtIncrease,
      });

      await baseFeeLMAToken
        .connect(carol)
        .transfer(
          alice.address,
          await baseFeeLMAToken.balanceOf(carol.address)
        );
      await decreaseDebt({
        caller: alice,
        amount: await baseFeeLMAToken.balanceOf(alice),
      });
      const { debt } = await getTrove({ owner: alice });

      await expect(
        redeemCollateral({
          caller: bob,
          baseFeeLMAamount: debt - gasCompensationReserve,
          gasPrice: ethers.parseUnits("160", "gwei"),
          maxIterations: maxIterations,
        })
      ).not.to.be.reverted;
    });

    it("should let claim gained coll surplus", async () => {
      expect(await collSurplusPool.getCollateral(alice.address)).to.be.equal(
        expectedCollateralAmount
      );
      const balanceAlice = await payToken.balanceOf(alice.address);

      expect(await borrowerOperations.connect(alice).claimCollateral()).not.to
        .be.reverted;

      const balanceAfter = await payToken.balanceOf(alice.address);

      expect(balanceAfter - balanceAlice).to.be.equal(expectedCollateralAmount);
    });
  });
});
