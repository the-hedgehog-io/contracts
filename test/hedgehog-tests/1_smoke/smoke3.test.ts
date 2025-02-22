import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ERC20Mock, TestPriceFeed } from "../../../typechain-types";
import {
  BaseFeeLMAToken,
  BaseFeeOracle,
  BorrowerOperations,
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
  checkCorrectness,
  getAdjustTroveParams,
  getCollRatioParams,
  getOpenTrove,
  getStabilityPoolMethods,
  setNewParamsToBaseFee,
  validateCollDebtMatch,
} from "../../utils/shared";

const { increase } = time;

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control . Flow #3", () => {
    let alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;

    let priceFeed: TestPriceFeed;
    let troveManager: TroveManager;
    let stabilityPool: StabilityPool;
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

    const gasCompensationReserve = BigInt("300000000000000000000000");
    const expectedStakedBalance = "2958684061409356496000000000";
    const expectedStabilityPoolAfterDeposit = "3583526702348096019000000000";
    const expectedStabilityPoolBFEBalance = "3651505595508481852900000000";
    const expectedPayTokenGainFromLiquidation = "1010000000000000000";

    const AliceTroveColl = BigInt("202000000000000000000");
    const AliceTroveDebt = BigInt("2550000000000000000000000000");
    const AliceTroveOpeningFee = BigInt("12750000000000000000000000");
    const AliceBFEBalanceAtOpening = BigInt("2537250000000000000000000000");
    const AliceInitialCR = BigInt("2640212262600000000");
    const expectedTotalSupplyBeforeAliceIncrease = BigInt(
      "4550000000000000000000000000"
    );

    const AliceTroveIncreaseDebt = BigInt("400000000000000000000000000");
    const AliceDebtAfterFirstIncrease = BigInt("2950000000000000000000000000");
    const AliceCollAfterFirstIncrease = BigInt("202000000000000000000");
    const AliceCRAfterFirstIncrease = BigInt("2282253782100000000");

    const totalSupplyBeforeBobOpensPosition = BigInt(
      "2550000000000000000000000000"
    );
    const BobTroveColl = BigInt("400000000000000000000");
    const BobTroveCollSecond = "2528977540106951870400";
    const BobTroveDebt = BigInt("2000000000000000000000000000");
    const BobTroveDebtSecond = "6833212299465240641711229600";
    const BobInitialCR = BigInt("6665666816633333333");
    const BobTroveOpeningFee = BigInt("1578442928000000000000000000");
    const BobIdealBFEBalanceAtOpening = BigInt("421557071717053000000000000");
    const BobActualBFEBalanceAtOpening = BigInt("421434061409356496000000000");
    const balanceChangeAfterDebtIncrease = "1321578657253454565840000000";
    const BobTroveIncreaseCollFirst = BigInt("2000000000000000000000");
    const BobTroveCollAfterIncrease = BigInt("2400000000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("2000000000000000000000000000");
    const BobCRAfterIncrease = BigInt("19997000449916666666");

    const BobTroveIncreaseDebtSecond = BigInt("2940000000000000000000000000");

    const CarolTroveColl = BigInt("90000000000000000000");
    const CarolTroveCollSecond = "1412012459893048127640";
    const CarolTroveDebt = BigInt("600000000000000000000000000");
    const CarolTroveDebtSecond = "1757087700534759358288769860";
    const CarolTroveOpeningFee = BigInt("104038098000000000000000000");
    const CarolInitialCR = BigInt("4997501249366666666");
    const CarolBFEBalanceAtOpening = BigInt("495961901938739523000000000");
    const expectedTotalSupplyBeforeCarolMint = BigInt(
      "4950000000000000000000000000"
    );
    const expectedTokenTransferAmount = "67978893160385833900000000";

    const totalCollateralAliceOpening = BigInt("202000000000000000000");
    const totalDebtAliceOpening = BigInt("2550000000000000000000000000");
    const totalCollateralBobOpening = BigInt("602000000000000000000");
    const totalDebtBobOpening = BigInt("4550000000000000000000000000");
    const totalDebtAliceIncrease = BigInt("4950000000000000000000000000");
    const totalCollAliceIncrease = BigInt("602000000000000000000");
    const totalCollCarolOpening = BigInt("692000000000000000000");
    const totalDebtCarolOpening = BigInt("5550000000000000000000000000");
    const totalCollBobIncrease = BigInt("2692000000000000000000");
    const totalDebtBobIncrease = BigInt("5550000000000000000000000000");

    before(async () => {
      [, , , alice, bob, carol] = await getSigners({
        fork: false,
      });

      ({
        priceFeed,
        troveManager,
        stabilityPool,
        borrowerOperations,
        baseFeeLMAToken,
        payToken,
        mainOracle,
        secondaryOracle,
      } = await setupContracts());

      ({ compareWithFault } = await validateCollDebtMatch());

      ({ openTrove } = await getOpenTrove({
        borrowerOperations,
        payToken,
      }));

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
            totalDebtBobOpening + gasCompensationReserve * BigInt(2), // 2 positions
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

      compareWithFault(
        BobIdealBFEBalanceAtOpening,
        BobTroveDebt - BobTroveOpeningFee
      );

      compareWithFault(balance, BobIdealBFEBalanceAtOpening);
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
          gasCompensationReserve * BigInt(2) // 2 positions
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
          amount: "128880739000000000000000000",
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
        troveDebtIncrease({ caller: bob, amount: BobTroveIncreaseDebtSecond })
      ).not.to.be.reverted;

      expect(
        (await baseFeeLMAToken.balanceOf(bob.address)) - balanceBefore
      ).to.be.equal(balanceChangeAfterDebtIncrease);
    });

    it("should correctly set system into a recovery mode", async () => {
      await setNewBaseFeePrice(140);
      await setNewBaseFeePrice(250);
      await setNewBaseFeePrice(250);
      expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
        true
      );
    });

    it("should let borrow more tokens during the recovery mode and transfer tokens correctly", async () => {
      await increase(3990);
      const carolBFEBalanceBefore = await baseFeeLMAToken.balanceOf(
        carol.address
      );

      await expect(
        troveDebtIncrease({
          caller: carol,
          amount: ethers.parseEther("100000000"),
          collIncrease: ethers.parseEther("1250"),
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
      const balanceBefore = await payToken.balanceOf(carol.address);
      await expect(
        troveManager
          .connect(carol)
          .batchLiquidateTroves([alice.address, bob.address])
      ).not.to.be.reverted;

      const balanceAfter = await payToken.balanceOf(carol.address);
      expect(
        await baseFeeLMAToken.balanceOf(await stabilityPool.getAddress())
      ).to.equal(expectedStabilityPoolBFEBalance);
      expect(balanceAfter - balanceBefore).to.be.equal(
        expectedPayTokenGainFromLiquidation
      );
    });

    it("should have both positions closed", async () => {
      await expect(
        getTrove({
          owner: bob,
          expectedColl: BobTroveCollSecond,
          expectedDebt: BobTroveDebtSecond,
        })
      ).not.to.be.reverted;
      await expect(
        getTrove({
          owner: alice,
          expectedColl: ethers.parseEther("0"),
          expectedDebt: ethers.parseEther("0"),
        })
      ).not.to.be.reverted;
      await expect(
        getTrove({
          owner: carol,
          expectedColl: CarolTroveCollSecond,
          expectedDebt: CarolTroveDebtSecond,
        })
      ).not.to.be.reverted;
    });
  });
});
