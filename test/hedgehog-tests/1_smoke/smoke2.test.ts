import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import {
  CommunityIssuance,
  ERC20Mock,
  HOGToken,
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
import { getSigners, setupContracts } from "../../utils";

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
  context("Base functionality and Access Control . Flow #2", () => {
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
    let hogToken: HOGToken;
    let payToken: ERC20Mock;
    let mainOracle: BaseFeeOracle, secondaryOracle: BaseFeeOracle;

    const gasCompensationReserve = BigInt("100000");
    const gasPrice010 = "30000000000";
    const gasPrice1114 = "60000000000";

    const AliceTroveColl = BigInt("602000000000000000000");
    const AliceTroveDebt = BigInt("4000000000");
    const AliceTroveOpeningFee = BigInt("20000000");
    const AliceBFEBalanceAtOpening = BigInt("3980000000");
    const AliceInitialCR = BigInt("5016541253135338283");

    const AliceTroveIncreaseDebt = BigInt("400000000");
    const AliceDebtAfterFirstIncrease = BigInt("4400100000");
    const AliceCollAfterFirstIncrease = BigInt("602000000000000000000");
    const AliceCRAfterFirstIncrease = BigInt("4560502412823950970");

    const BobTroveColl = BigInt("300000000000000000000");
    const BobTroveDebt = BigInt("2000000000");
    const BobInitialCR = BigInt("4999750012499375031");
    const BobTroveOpeningFee = BigInt("1009975001");
    const BobIdealBFEBalanceAtOpening = BigInt("990024999");
    const BobActualBFEBalanceAtOpening = BigInt("990024999");

    const BobTroveIncreaseCollFirst = BigInt("1600000000000000000000");
    const BobTroveCollAfterIncrease = BigInt("1900000000000000000000");
    const BobTroveDebtAfterIncrease = BigInt("2000100000");
    const BobCRAfterIncrease = BigInt("15832541706248020932");

    const BobTroveIncreaseDebtSecond = BigInt("4600000000");

    const BobTroveCollAfterSecondIncrease = BigInt("1775365589023270000");
    const BobTroveDebtAfterSecondIncrease = BigInt("3590770");
    const BobCRAfterSecondIncrease = 824;

    const CarolTroveColl = BigInt("1800000000000000000000");
    const CarolTroveDebt = BigInt("3000000000");
    const CarolTroveOpeningFee = BigInt("1513718938");
    const CarolInitialCR = BigInt("19999333355554814839");
    const CarolBFEBalanceAtOpening = BigInt("1486281062");
    const CarolTroveCollAfterLiquid = BigInt("3065768314496680000");
    const CarolTroveDebtAfterLiquid = BigInt(4644705);
    const CarolCRAfterLiquid = 1100;
    const CarolIncreaseDebt = BigInt("50000");
    const CarolRepayment = BigInt("100000");

    const totalCollateralAliceOpening = BigInt("602000000000000000000");
    const totalDebtAliceOpening = BigInt("4000100000");
    const totalCollateralBobOpening = BigInt("902000000000000000000");
    const totalDebtBobOpening = BigInt("6000200000");
    const totalDebtAliceIncrease = BigInt("6400200000");
    const totalCollAliceIncrease = BigInt("902000000000000000000");
    const totalCollCarolOpening = BigInt("2702000000000000000000");
    const totalDebtCarolOpening = BigInt("9400300000");
    const totalCollBobFirstRedemption = BigInt("3787650000000000000");
    const totalDebtBobFirstRedemption = BigInt("7355000");
    const totalCollBobIncrease = BigInt("4302000000000000000000");
    const totalDebtBobIncrease = BigInt("9400300000");

    const totalCollAliceLiquidated = BigInt("4447752704427490000");
    const totalDebtAliceLiquidated = BigInt("4559762");

    before(async () => {
      [deployer, setter, hacker, alice, bob, carol] = await getSigners({
        fork: false,
      });

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
      const { debt, coll, pendingBaseFeeLMADebtReward, pendingWStETHReward } =
        await troveManager.getEntireDebtAndColl(caller.address);

      return { debt, coll, pendingBaseFeeLMADebtReward, pendingWStETHReward };
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

    it("should correctly calculate estimated cr", async () => {
      expect(
        await borrowerOperations.computeUnreliableCR(
          AliceTroveColl,
          AliceTroveDebt + gasCompensationReserve
        )
      ).to.be.equal(AliceInitialCR);
    });

    it("should let open trove to Alice with correct params", async () => {
      await openTrove({
        caller: alice,
        baseFeeLMAAmount: AliceTroveDebt,
        collAmount: AliceTroveColl,
      });
    });

    it("should have a correct entire system debt", async () => {
      await checkCollDebtCorrectness(
        totalCollateralAliceOpening,
        totalDebtAliceOpening
      );
    });

    it("should calculate and return correct CR for alice's position", async () => {
      expect(await getCR({ owner: alice })).to.be.equal(AliceInitialCR);
    });

    it("should have a correct amount of collateral and debt in position record (alice position)", async () => {
      const { debt, coll } = await getTrove(alice);

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
      await expect(provide({ caller: alice, amount: AliceBFEBalanceAtOpening }))
        .not.to.be.reverted;
    });

    it("should have correct total supply before bob opens position", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal("4000100000");
    });

    it("should let another user(bob) open a position", async () => {
      await increase(15);
      await openTrove({
        caller: bob,
        baseFeeLMAAmount: BobTroveDebt,
        collAmount: BobTroveColl,
      });
    });

    it("should have a correct CR in a new position (bob position)", async () => {
      expect(await getCR({ owner: bob })).to.be.equal(BobInitialCR);
    });

    it("should have a correct entire system debt (after bob opens position)", async () => {
      await checkCollDebtCorrectness(
        totalCollateralBobOpening,
        totalDebtBobOpening
      );
    });

    it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
      const { debt, coll } = await getTrove(bob);

      expect(debt).to.be.equal(BobTroveDebt + gasCompensationReserve);
      expect(coll).to.be.equal(BobTroveColl);
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
      expect(await getCR()).to.be.equal(BobInitialCR);
    });

    it("should let stake BFE to staking", async () => {
      // Provide 100%
      await provide({ amount: BobActualBFEBalanceAtOpening });
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

      expect(balance).to.be.equal("4970024999");
    });

    it("should have correct total supply before alice increase", async () => {
      const totalSupply = await baseFeeLMAToken.totalSupply();

      expect(totalSupply).to.be.equal("6000200000");
    });

    it("should let adjust the position (alice position)", async () => {
      await increase(2010);
      await expect(
        increaseDebt({ caller: alice, amount: AliceTroveIncreaseDebt })
      ).not.to.be.reverted;
      await expect(provide({ caller: alice, amount: "222171502" })).not.to.be
        .reverted;
    });

    it("should have a correct entire system debt (after alice increases coll in her position)", async () => {
      await checkCollDebtCorrectness(
        totalCollAliceIncrease,
        totalDebtAliceIncrease
      );
    });

    it("should result into a correct debt and collateral in a position after increase", async () => {
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

      expect(totalSupply).to.be.equal("6400200000");
    });

    it("should let open another position in the system (carol position)", async () => {
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

    it("should have a correct entire system debt (after alice decreases coll in her position)", async () => {
      await checkCollDebtCorrectness(
        totalCollCarolOpening,
        totalDebtCarolOpening
      );
    });

    it("should have a correct amount of collateral and debt in position record (carol position)", async () => {
      const { debt, coll } = await getTrove(carol);

      expect(debt).to.be.equal(CarolTroveDebt + gasCompensationReserve);
      expect(coll).to.be.equal(CarolTroveColl);
    });

    it("should have transferred the correct amount BFE token during position opening (carol position)", async () => {
      const balance = await baseFeeLMAToken.balanceOf(carol.address);
      compareWithFault(
        CarolBFEBalanceAtOpening,
        CarolTroveDebt - CarolTroveOpeningFee
      );
      compareWithFault(balance, CarolBFEBalanceAtOpening);
    });

    it("should let another user provide to stability pool (carol)", async () => {
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

      expect(balance).to.be.equal("6678477563");
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
      await increaseColl({ amount: BobTroveIncreaseCollFirst });
    });

    it("should have a correct entire system debt (after bob increases coll)", async () => {
      await checkCollDebtCorrectness(
        totalCollBobIncrease,
        totalDebtBobIncrease
      );
    });

    it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
      const { debt, coll } = await getTrove(bob);

      expect(debt).to.be.equal(BobTroveDebtAfterIncrease);
      expect(coll).to.be.equal(BobTroveCollAfterIncrease);
    });

    it("should have a correct CR after coll increase in position (bob position)", async () => {
      expect(await getCR()).to.be.equal(BobCRAfterIncrease);
    });

    it("should allow increasing debt in the position (bob position)", async () => {
      await increase(14270);
      const balanceBefore = await baseFeeLMAToken.balanceOf(bob.address);
      await expect(
        increaseDebt({ caller: bob, amount: BobTroveIncreaseDebtSecond })
      ).not.to.be.reverted;

      expect(
        (await baseFeeLMAToken.balanceOf(bob.address)) - balanceBefore
      ).to.be.equal("2109852009");
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
      await increase(3990);
      const carolBFEBalanceBefore = await baseFeeLMAToken.balanceOf(
        carol.address
      );
      const carolCollBalanceBefore = await payToken.balanceOf(carol.address);

      await payToken
        .connect(carol)
        .approve(await borrowerOperations.getAddress(), "64000000000000000000");
      await expect(
        borrowerOperations
          .connect(carol)
          .adjustTrove(
            ethers.parseEther("1"),
            0,
            "64000000000000000000",
            "400000000",
            true,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.rejectedWith(
        "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode"
      );

      expect("267233421").to.be.equal(
        (await baseFeeLMAToken.balanceOf(carol.address)) - carolBFEBalanceBefore
      );
    });

    it("should let provide to stability pool in recovery mode", async () => {
      await expect(provide({ caller: carol, amount: "39748" })).to.be.not
        .reverted;
    });

    it("should let carol liquidate bob", async () => {
      const balanceBefore = await payToken.balanceOf(carol.address);
      await expect(
        troveManager
          .connect(carol)
          .batchLiquidateTroves([alice.address, bob.address])
      ).not.to.be.reverted;

      const balanceAfter = await payToken.balanceOf(carol.address);
      expect(
        await baseFeeLMAToken.balanceOf(await stabilityPool.getAddress())
      ).to.equal(BigInt("828948"));
      expect(balanceAfter - balanceBefore).to.be.equal("4385000000000000");
    });

    it("should have both positions closed", async () => {
      const { coll, debt } = await getTrove(bob);
      const { coll: collAlice, debt: debtAlice } = await getTrove(alice);

      expect(collAlice).to.be.equal(0);
      expect(debtAlice).to.be.equal(0);
      expect(coll).to.be.equal(0);
      expect(debt).to.be.equal(0);
    });
  });
});
