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
  StabilityPool,
  TroveManager,
} from "../../../typechain-types/contracts";
import {
  validateCollDebtMatch,
  OpenTrove,
  getOpenTrove,
  AdjustTroveParamsToBorrowerOperations,
  getAdjustTroveParams,
  getCollRatioParams,
  CollateralRatioParams,
  GetEntireCollAndDebtParams,
  ProvideToStabilityPool,
  getStabilityPoolMethods,
  setNewParamsToBaseFee,
  checkCorrectness,
} from "../../utils/shared";
import { getSigners, setupContracts } from "../../utils";

const { increase } = time;

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control . Flow #2", () => {
    let alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;
    let priceFeed: TestPriceFeed;
    let troveManager: TroveManager;
    let stabilityPool: StabilityPool;
    let collSurplusPool: CollSurplusPool;
    let borrowerOperations: BorrowerOperations;
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

    const gasCompensationReserve = BigInt("100000000000000000000000");
    const expectedStakedBalance = "4970024999375015626000000000";
    const expectedStabilityPoolAfterDeposit = "6678477563129355120400000000";
    const expectedPayTokenGainFromLiquidation = "10930120000000000000";
    const expectedBFEGainFromLiquidation = "200000000000000000000000";
    const expectedStabilityPoolBFEBalance = BigInt(
      "345610984537692010000000000"
    );
    const expectedCollateralInSurplusPool = "315976000000000000000";
    const expectedTokenTransferAmount = "267233421408336889600000000";

    const AliceTroveColl = BigInt("602000000000000000000");
    const AliceTroveCollSecond = "25000000000000000000";
    const AliceTroveDebt = BigInt("4000000000000000000000000000");
    const AliceTroveDebtSecond = "50000000000000000000000000";
    const AliceTroveOpeningFee = BigInt("20000000000000000000000000");
    const AliceBFEBalanceAtOpening = BigInt("3980000000000000000000000000");
    const AliceInitialCR = BigInt("5016541253133333333");
    const expectedTotalSupplyBeforeAliceIncrease =
      "6000200000000000000000000000";
    const AliceTroveIncreaseDebt = BigInt("400000000000000000000000000");
    const AliceDebtAfterFirstIncrease = BigInt("4400100000000000000000000000");
    const AliceCollAfterFirstIncrease = BigInt("602000000000000000000");
    const AliceCRAfterFirstIncrease = BigInt("4560502412800000000");

    const totalSupplyBeforeBobOpensPosition = "4000100000000000000000000000";
    const BobTroveColl = BigInt("300000000000000000000");
    const BobTroveDebt = BigInt("2000000000000000000000000000");
    const BobInitialCR = BigInt("4999750012466666666");
    const BobTroveOpeningFee = BigInt("1009975001");
    const BobIdealBFEBalanceAtOpening = BigInt("990024999375015626000000000");
    const balanceChangeAfterDebtIncrease = "2109852008004331866000000000";
    const BobTroveIncreaseCollFirst = BigInt("1600000000000000000000");
    const BobTroveCollAfterIncrease = BigInt("1900000000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("2000100000000000000000000000");
    const BobCRAfterIncrease = BigInt("15832541706233333333");
    const BobTroveIncreaseDebtSecond = BigInt("4600000000000000000000000000");

    const CarolTroveColl = BigInt("630000000000000000000");
    const CarolTroveDebt = BigInt("3000000000000000000000000000");
    const CarolTroveOpeningFee = BigInt("1513718938");
    const CarolInitialCR = BigInt("6999766674433333333");
    const CarolBFEBalanceAtOpening = BigInt("1486281061542887898000000000");
    const expectedTotalSupplyBeforeCarolMint = "6400200000000000000000000000";
    const totalCollateralAliceOpening = BigInt("602000000000000000000");
    const totalDebtAliceOpening = BigInt("4000100000000000000000000000");
    const totalCollateralBobOpening = BigInt("902000000000000000000");
    const totalDebtBobOpening = BigInt("6000200000000000000000000000");
    const totalDebtAliceIncrease = BigInt("6400200000000000000000000000");
    const totalCollAliceIncrease = BigInt("902000000000000000000");
    const totalCollCarolOpening = BigInt("1532000000000000000000");
    const totalDebtCarolOpening = BigInt("9400300000000000000000000000");

    const totalCollBobIncrease = BigInt("3132000000000000000000");
    const totalDebtBobIncrease = BigInt("9400300000000000000000000000");

    before(async () => {
      [, , , alice, bob, carol] = await getSigners({
        fork: false,
      });

      ({
        priceFeed,
        troveManager,
        stabilityPool,
        collSurplusPool,
        borrowerOperations,
        baseFeeLMAToken,
        payToken,
        mainOracle,
        secondaryOracle,
      } = await setupContracts());

      ({ compareWithFault } = await validateCollDebtMatch());

      ({ openTrove } = await getOpenTrove({ payToken, borrowerOperations }));

      ({ getCR, getTroveAndCheck, getTrove } = await getCollRatioParams({
        troveManager,
      }));

      ({ provideToStabilityPool } = await getStabilityPoolMethods({
        baseFeeLMAToken,
        stabilityPool,
      }));

      ({ troveDebtIncrease, troveCollIncrease } = await getAdjustTroveParams({
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
          expectedDebt: totalDebtAliceOpening,
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

      expect(totalSupply).to.be.equal(totalSupplyBeforeBobOpensPosition);
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
          expectedDebt: totalDebtBobOpening,
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
      expect(balance).to.be.equal(BobIdealBFEBalanceAtOpening);
    });

    it("should have a correct CR in a new position (bob position)", async () => {
      expect(await getCR({ owner: bob })).to.be.equal(BobInitialCR);
    });

    it("should let stake BFE to staking", async () => {
      // Provide 100%
      await expect(
        provideToStabilityPool({ amount: BobIdealBFEBalanceAtOpening })
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

      expect(deposit).to.be.equal(BobIdealBFEBalanceAtOpening);
    });

    it("should result into a correct staked amount", async () => {
      const balance = await baseFeeLMAToken.balanceOf(
        await stabilityPool.getAddress()
      );

      expect(balance).to.be.equal(expectedStakedBalance);
    });

    it("should have correct total supply before alice increase", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal(expectedTotalSupplyBeforeAliceIncrease);
    });

    it("should let adjust the position (alice position)", async () => {
      await increase(2010);
      await expect(
        troveDebtIncrease({ caller: alice, amount: AliceTroveIncreaseDebt })
      ).not.to.be.reverted;

      await expect(
        provideToStabilityPool({
          caller: alice,
          amount: await baseFeeLMAToken.balanceOf(alice.address),
        })
      ).not.to.be.reverted;
    });

    it("should have a correct entire system debt (after alice increases coll in her position)", async () => {
      await expect(
        checkCollDebtCorrectness({
          expectedColl: totalCollAliceIncrease,
          expectedDebt: totalDebtAliceIncrease,
        })
      ).not.to.be.reverted;
    });

    it("should result into a correct debt and collateral in a position after increase", async () => {
      await getTroveAndCheck({
        owner: alice,
        expectedColl: AliceCollAfterFirstIncrease,
        expectedDebt: AliceDebtAfterFirstIncrease,
      });
    });

    it("should result into a correct CR in a alice position", async () => {
      const cr = await getCR({ owner: alice });
      expect(cr).to.be.equal(AliceCRAfterFirstIncrease);
    });

    it("should have correct total supply before carol mint", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal(expectedTotalSupplyBeforeCarolMint);
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
          expectedDebt: totalDebtCarolOpening,
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
      compareWithFault(
        CarolBFEBalanceAtOpening,
        CarolTroveDebt - CarolTroveOpeningFee
      );
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

    it("should let increase collateral to the position (bob position)", async () => {
      await increase(1680);
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
          expectedDebt: totalDebtBobIncrease,
        })
      ).not.to.be.reverted;
    });

    it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
      await expect(
        getTrove({
          owner: bob,
          expectedColl: BobTroveCollAfterIncrease,
          expectedDebt: BobTroveDebtAfterIncrease,
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
        troveDebtIncrease({ caller: bob, amount: BobTroveIncreaseDebtSecond })
      ).not.to.be.reverted;

      expect(
        (await baseFeeLMAToken.balanceOf(bob.address)) - balanceBefore
      ).to.be.equal(balanceChangeAfterDebtIncrease);
    });

    it("should correctly set system into a recovery mode", async () => {
      await setNewBaseFeePrice(140);
      await setNewBaseFeePrice(150);
      await setNewBaseFeePrice(160);
      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        true
      );
    });

    it("should let borrow more tokens during the recovery mode and transfer tokens correctly", async () => {
      await increase(4000);
      const carolBFEBalanceBefore = await baseFeeLMAToken.balanceOf(
        carol.address
      );
      const collIncrease = ethers.parseEther("1280");
      const amount = ethers.parseEther("400000000");

      await expect(
        troveDebtIncrease({
          caller: carol,
          amount: amount,
          collIncrease: collIncrease,
        })
      ).not.to.be.reverted;

      expect(expectedTokenTransferAmount).to.be.equal(
        (await baseFeeLMAToken.balanceOf(carol.address)) - carolBFEBalanceBefore
      );
    });

    it("should let provide to stability pool in recovery mode", async () => {
      await expect(
        provideToStabilityPool({
          caller: carol,
          amount: expectedTokenTransferAmount,
        })
      ).to.be.not.reverted;
    });

    it("should let carol liquidate bob and alice", async () => {
      const bfeBalance = await baseFeeLMAToken.balanceOf(carol.address);
      const balanceBefore = await payToken.balanceOf(carol.address);
      await expect(
        troveManager
          .connect(carol)
          .batchLiquidateTroves([alice.address, bob.address])
      ).not.to.be.reverted;
      const bfeBalanceAfter = await baseFeeLMAToken.balanceOf(carol.address);
      const balanceAfter = await payToken.balanceOf(carol.address);
      expect(balanceAfter - balanceBefore).to.be.equal(
        expectedPayTokenGainFromLiquidation
      );
      expect(bfeBalanceAfter - bfeBalance).to.be.equal(
        expectedBFEGainFromLiquidation
      );
      expect(
        await baseFeeLMAToken.balanceOf(await stabilityPool.getAddress())
      ).to.equal(expectedStabilityPoolBFEBalance);
    });

    it("should have both positions closed", async () => {
      await expect(
        getTroveAndCheck({
          owner: bob,
          expectedColl: ethers.parseEther("0"),
          expectedDebt: ethers.parseEther("0"),
        })
      ).not.to.be.reverted;
      await expect(
        getTroveAndCheck({
          owner: alice,
          expectedColl: ethers.parseEther("0"),
          expectedDebt: ethers.parseEther("0"),
        })
      ).not.to.be.reverted;
    });

    it("should have recorded collateral in coll surplus correctly", async () => {
      expect(await collSurplusPool.getCollateral(bob.address)).to.be.equal(
        expectedCollateralInSurplusPool
      );
    });

    it("should let retrieve coll surplus", async () => {
      const bfeBalanceBefore = await payToken.balanceOf(bob.address);
      await expect(borrowerOperations.connect(bob).claimCollateral()).not.to.be
        .reverted;
      const bfeBalanceAfter = await payToken.balanceOf(bob.address);

      expect(bfeBalanceAfter - bfeBalanceBefore).to.be.equal(
        expectedCollateralInSurplusPool
      );
    });

    it("should let close trove in recovery mode", async () => {
      await setNewBaseFeePrice(30);
      await setNewBaseFeePrice(30);
      await setNewBaseFeePrice(30);
      await openTrove({
        caller: alice,
        collAmount: AliceTroveCollSecond,
        baseFeeLMAAmount: AliceTroveDebtSecond,
      });
      await setNewBaseFeePrice(450);
      await setNewBaseFeePrice(450);
      await setNewBaseFeePrice(450);

      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        true
      );
      await baseFeeLMAToken
        .connect(carol)
        .transfer(
          alice.address,
          await baseFeeLMAToken.balanceOf(carol.address)
        );
      await expect(
        borrowerOperations.connect(alice).closeTrove()
      ).to.be.revertedWith(
        "BorrowerOps: Operation not permitted during Recovery Mode"
      );
    });
  });
});
