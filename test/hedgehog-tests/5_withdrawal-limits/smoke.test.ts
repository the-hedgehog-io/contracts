import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
const { latestBlock } = time;
import {
  ActivePool,
  BaseFeeLMAToken,
  BaseFeeOracle,
  BorrowerOperationsLiquidationsTest,
  FeesRouter,
  SortedTroves,
  TERC20,
  TroveManager,
} from "../../../typechain-types";
import { getSigners } from "../../utils";
import {
  getOpenTrove,
  OpenTrove,
  setupContractsForLiquid,
} from "../../utils/shared";
import { expect } from "chai";

describe("Hedgehog Core Contracts Smoke tests", () => {
  let deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    carol: SignerWithAddress,
    dave: SignerWithAddress,
    eva: SignerWithAddress; // Fee recipient
  let BaseFeeLMA_GAS_COMPENSATION: bigint;
  let sortedTroves: SortedTroves;
  let borrowerOperations: BorrowerOperationsLiquidationsTest;
  let payToken: TERC20;
  let troveManager: TroveManager;
  let secondaryOracle: BaseFeeOracle;
  let baseFeeLMAToken: BaseFeeLMAToken;
  let activePool: ActivePool;
  let feesRouter: FeesRouter;
  let openTrove: OpenTrove;

  let MIN_NET_DEBT: bigint;
  let BORROWING_FEE_FLOOR: bigint;

  beforeEach(async () => {
    [deployer, alice, bob, carol, dave, eva] = await getSigners({
      fork: false,
    });

    ({
      borrowerOperations,
      payToken,
      baseFeeLMAToken,
      sortedTroves,
      secondaryOracle,
      troveManager,
      activePool,
      feesRouter,
    } = await setupContractsForLiquid());
    BaseFeeLMA_GAS_COMPENSATION =
      await borrowerOperations.BaseFeeLMA_GAS_COMPENSATION();
    MIN_NET_DEBT = await borrowerOperations.MIN_NET_DEBT();

    BORROWING_FEE_FLOOR = await borrowerOperations.BORROWING_FEE_FLOOR();
    ({ openTrove } = await getOpenTrove({ payToken, borrowerOperations }));
  });

  const collAmountAlice = BigInt("200000000000000000000");
  const debtAmountAlice = BigInt("2000000000000000000000000000");
  const collAmountBob = BigInt("200000000000000000000");
  const debtAmountBob = BigInt("1280000000000000000000000000");

  context("OpenTrove functionality: ", () => {
    it("should let to open the trove", async () => {
      await expect(
        openTrove({
          caller: alice,
          collAmount: collAmountAlice,
          baseFeeLMAAmount: debtAmountAlice,
        })
      ).not.to.be.reverted;

      await expect(
        openTrove({
          caller: bob,
          collAmount: collAmountBob,
          baseFeeLMAAmount: debtAmountBob,
        })
      ).not.to.be.reverted;
    });

    it("should let to open the trove with the correct system collateral and debt", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const realCollAlice = await borrowerOperations.getEntireSystemColl();
      const realDebtAlice = await borrowerOperations.getEntireSystemDebt();
      expect(realCollAlice).to.be.equal(collAmountAlice);
      expect(realDebtAlice).to.be.equal(
        debtAmountAlice + BigInt(BaseFeeLMA_GAS_COMPENSATION)
      );

      await openTrove({
        caller: bob,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      const fullSystemColl = await borrowerOperations.getEntireSystemColl();

      const fullSystemDebt = await borrowerOperations.getEntireSystemDebt();
      expect(fullSystemColl).to.be.equal(collAmountAlice + collAmountBob);
      expect(fullSystemDebt).to.be.equal(
        debtAmountAlice +
          BaseFeeLMA_GAS_COMPENSATION +
          debtAmountBob +
          BaseFeeLMA_GAS_COMPENSATION
      );
    });

    it("should let to open the trove with check if the list contains a node", async () => {
      expect(await sortedTroves.contains(alice)).to.be.false;

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      expect(await sortedTroves.contains(alice)).to.be.true;
      expect(await sortedTroves.contains(bob)).to.be.false;

      await openTrove({
        caller: bob,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      expect(await sortedTroves.contains(alice)).to.be.true;
      expect(await sortedTroves.contains(bob)).to.be.true;
    });

    it("should not let to open the trove  if the max percentage less than 0.5", async () => {
      await expect(
        openTrove({
          maxFeePercentage: 0.001,
          caller: alice,
          collAmount: collAmountAlice,
          baseFeeLMAAmount: debtAmountAlice,
        })
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%");
    });

    it("should not let to open the trove  if the max percentage more than 100%", async () => {
      await expect(
        openTrove({
          maxFeePercentage: 1.1,
          caller: alice,
          collAmount: collAmountAlice,
          baseFeeLMAAmount: debtAmountAlice,
        })
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%");
    });

    it("should not let to open the trove if the trove is active", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      const collAmountAliceSecond = BigInt("200000000000000000000");
      const debtAmountAliceSecond = BigInt("1280000000000000000000000000");
      await expect(
        openTrove({
          caller: alice,
          collAmount: collAmountAliceSecond,
          baseFeeLMAAmount: debtAmountAliceSecond,
        })
      ).to.be.revertedWith("BorrowerOps: Trove is active");
    });

    it("should not let to open the trove if the max percentage more than 100% in Recovery Mode", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("100000000000", await latestBlock());

      await expect(
        openTrove({
          maxFeePercentage: 1.1,
          caller: bob,
          collAmount: collAmountBob,
          baseFeeLMAAmount: debtAmountBob,
        })
      ).to.be.revertedWith(
        "Max fee percentage must less than or equal to 100%"
      );
    });

    it("should not let to open the trove if fee exceeds max fee percentage", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await expect(
        openTrove({
          maxFeePercentage: 0.5,
          caller: bob,
          collAmount: collAmountBob,
          baseFeeLMAAmount: debtAmountBob,
        })
      ).to.be.revertedWith("Fee exceeded provided maximum");
    });

    it("should let to open the trove if fee is less than max fee percentage", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await expect(
        openTrove({
          maxFeePercentage: 0.65,
          caller: bob,
          collAmount: collAmountBob,
          baseFeeLMAAmount: debtAmountBob,
        })
      ).not.to.be.reverted;
    });

    it("should not let to open the trove when system is in Recovery Mode and ICR < CCR", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("100000000000", await latestBlock());

      await expect(
        openTrove({
          caller: bob,
          collAmount: collAmountBob,
          baseFeeLMAAmount: debtAmountBob,
        })
      ).to.be.revertedWith(
        "BorrowerOps: Operation must leave trove with ICR >= CCR"
      );
    });

    it("should not let to open the trove when when trove ICR < MCR", async () => {
      const newDebtAlice = BigInt("10000000000000000000000000000");

      await expect(
        openTrove({
          caller: alice,
          collAmount: collAmountAlice,
          baseFeeLMAAmount: newDebtAlice,
        })
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
      );
    });

    it("should not let to open the trove when opening the trove would cause the TCR of the system to fall below the CCR", async () => {
      const newDebtAlice = BigInt("3000000000000000000000000000");

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: newDebtAlice,
      });

      const newDebtBob = BigInt("1900284999000000000000000000");
      const newCollBob = BigInt("85700000000000000000");

      await expect(
        openTrove({
          caller: bob,
          collAmount: newCollBob,
          baseFeeLMAAmount: newDebtBob,
        })
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in TCR < CCR is not permitted"
      );
    });

    it("should let to open the trove with ICR >= CCR when system is in Recovery Mode", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("100000000000", await latestBlock());

      const newDebtBob = BigInt("900000000000000000000000000");

      await expect(
        openTrove({
          caller: bob,
          collAmount: collAmountBob,
          baseFeeLMAAmount: newDebtBob,
        })
      ).not.to.be.reverted;
    });

    it("should not let to open the trove with debt is less than min debt when system is in Recovery Mode", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("100000000000", await latestBlock());

      await expect(
        openTrove({
          caller: bob,
          collAmount: collAmountBob,
          baseFeeLMAAmount: MIN_NET_DEBT - BigInt("1"),
        })
      ).to.be.revertedWith(
        "BorrowerOps: Trove's net debt must be greater than minimum"
      );
    });

    it("should let to open the trove and adds trove owner to TroveOwners array", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      expect(await troveManager.TroveOwners(0)).to.be.equal(alice.address);

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("100000000000", await latestBlock());

      await openTrove({
        caller: bob,
        collAmount: collAmountBob,
        baseFeeLMAAmount: MIN_NET_DEBT,
      });
      expect(await troveManager.TroveOwners(0)).to.be.equal(alice.address);
      expect(await troveManager.TroveOwners(1)).to.be.equal(bob.address);
    });

    it("should let to open the trove and adds to total stakes correctly", async () => {
      expect(await troveManager.totalStakes()).to.be.equal(0);

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect(await troveManager.totalStakes()).to.be.equal(collAmountAlice);

      const newBobColl = collAmountBob + BigInt("107");

      await openTrove({
        caller: bob,
        collAmount: newBobColl,
        baseFeeLMAAmount: MIN_NET_DEBT,
      });
      expect(await troveManager.totalStakes()).to.be.equal(
        collAmountAlice + newBobColl
      );
    });

    it("should let to insert trove to sorted troves list correctly", async () => {
      expect(await sortedTroves.contains(alice.address)).to.be.false;
      expect(await sortedTroves.isEmpty()).to.be.true;
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect(await sortedTroves.contains(alice.address)).to.be.true;
      expect(await sortedTroves.contains(bob.address)).to.be.false;
      expect(await sortedTroves.isEmpty()).to.be.false;
    });

    it("should let to increase the activePool WStETH and  payToken balance correctly", async () => {
      expect(await activePool.getWStETH()).to.be.equal(1);
      expect(await payToken.balanceOf(activePool.target)).to.be.equal(0);

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect(await activePool.getWStETH()).to.be.equal(collAmountAlice);
      expect(await payToken.balanceOf(activePool.target)).to.be.equal(
        collAmountAlice
      );
    });

    it("should let to open trove and close trove in Normal Mode", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await openTrove({
        caller: carol,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      await baseFeeLMAToken
        .connect(alice)
        .approve(baseFeeLMAToken, ethers.parseEther("900000000"));
      await baseFeeLMAToken
        .connect(alice)
        .transfer(carol.address, ethers.parseEther("900000000"));

      const balanceBFEEBeforeClose = await baseFeeLMAToken.balanceOf(
        carol.address
      );

      await expect(borrowerOperations.connect(carol).closeTrove()).not.to.be
        .reverted;

      const balanceBFEEAfterClose = await baseFeeLMAToken.balanceOf(
        carol.address
      );

      expect(balanceBFEEBeforeClose - balanceBFEEAfterClose).to.be.equal(
        debtAmountBob
      );
    });

    it("should let to open trove and liquidate in Recovery Mode", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await openTrove({
        caller: carol,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("110000000000", await latestBlock());

      expect(await troveManager.Troves(carol.address)).not.to.be.reverted;

      console.log(
        "system coll before liquidate",
        await borrowerOperations.getEntireSystemColl()
      );
      console.log(
        "system debt before liquidate",
        await borrowerOperations.getEntireSystemDebt()
      );

      console.log(
        "active pool bef pay tok",
        await payToken.balanceOf(activePool.target)
      );

      console.log(
        "balance BFEE carol before liquidate ",
        await baseFeeLMAToken.balanceOf(carol.address)
      );

      console.log(
        "balance pay token carol before liquidate ",
        await payToken.balanceOf(carol.address)
      );

      await troveManager.liquidate(carol.address, {
        from: deployer,
      });

      console.log(
        "balance BFEE carol after liquidate ",
        await baseFeeLMAToken.balanceOf(carol.address)
      );
      console.log(
        "balance pay token carol after liquidate ",
        await payToken.balanceOf(carol.address)
      );

      expect(await troveManager.Troves(carol.address)).to.be
        .revertedWithoutReason;

      console.log(
        "system coll after liquidate",
        await borrowerOperations.getEntireSystemColl()
      );
      console.log(
        "system debt after liquidate",
        await borrowerOperations.getEntireSystemDebt()
      );
      console.log(
        "active pool aft pay tok",
        await payToken.balanceOf(activePool.target)
      );

      console.log(await troveManager.L_WStETH());
      console.log(await troveManager.L_BaseFeeLMADebt());
    });

    it("should allows a user to open a Trove, then close it, then re-open it", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await openTrove({
        caller: bob,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      await baseFeeLMAToken
        .connect(alice)
        .transfer(bob.address, ethers.parseEther("900000000"));

      expect(await troveManager.getTroveStatus(bob.address)).to.be.equal(1);
      expect(await sortedTroves.contains(bob.address)).to.be.true;

      await borrowerOperations.connect(bob).closeTrove();

      expect(await troveManager.getTroveStatus(bob.address)).not.to.be.equal(1);
      expect(await sortedTroves.contains(bob.address)).to.be.false;

      const newDebtBob = BigInt("128000000000000000000000000");
      const newCollBob = BigInt("20000000000000000000");

      await openTrove({
        caller: bob,
        collAmount: newCollBob,
        baseFeeLMAAmount: newDebtBob,
      });

      expect(await sortedTroves.contains(bob.address)).to.be.true;
      expect(await troveManager.getTroveStatus(bob.address)).to.be.equal(1);
    });

    it("should to increase the Trove's debt and coll by the correct amount", async () => {
      expect(await troveManager.Troves(alice.address)).to.be
        .revertedWithoutReason;

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect((await troveManager.Troves(alice.address)).debt).to.be.equal(
        debtAmountAlice + BaseFeeLMA_GAS_COMPENSATION
      );
      expect((await troveManager.Troves(alice.address)).coll).to.be.equal(
        collAmountAlice
      );
    });

    it("should to increase debt in ActivePool by the debt of the trove", async () => {
      expect(await activePool.getBaseFeeLMADebt()).to.be.equal(0);

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      const systemDebt = await borrowerOperations.getEntireSystemDebt();
      const debtActivePool = await activePool.getBaseFeeLMADebt();

      expect(systemDebt).to.be.equal(debtActivePool);
    });

    it("should to increase user BaseFeeLMAToken balance by correct amount", async () => {
      expect(await baseFeeLMAToken.balanceOf(alice.address)).to.be.equal(0);

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect(await baseFeeLMAToken.balanceOf(alice.address)).to.be.equal(
        debtAmountAlice -
          (debtAmountAlice * BORROWING_FEE_FLOOR) / ethers.parseEther("1")
      );
    });

    it("should not alow to open trove if fee exceeds gain", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      const newDebtBob = BigInt("2000000000000000000000000000");
      await expect(
        openTrove({
          caller: bob,
          collAmount: collAmountBob,
          baseFeeLMAAmount: newDebtBob,
        })
      ).to.be.revertedWith("BO: Fee exceeds gain");
    });
  });

  context("AddColl functionality", () => {
    it("should not allow to add coll if top-up would leave trove with ICR < MCR", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const newCollBob = BigInt("1800000000000000000000");
      await openTrove({
        caller: bob,
        collAmount: newCollBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("70000000000", await latestBlock());

      const amountForAddColl = BigInt("5000000000000000");

      await payToken
        .connect(alice)
        .approve(borrowerOperations, amountForAddColl);
      await expect(
        borrowerOperations
          .connect(alice)
          .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amountForAddColl)
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
      );
    });

    it("should to increase the activePool StETH and payToken balance by correct amount after addColl", async () => {
      expect(await activePool.getWStETH()).to.be.equal(1);
      expect(await payToken.balanceOf(activePool.target)).to.be.equal(0);

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect(await activePool.getWStETH()).to.be.equal(collAmountAlice);
      expect(await payToken.balanceOf(activePool.target)).to.be.equal(
        collAmountAlice
      );
      const amountForAddColl = BigInt("5000000000000000000");

      await payToken
        .connect(alice)
        .approve(borrowerOperations, amountForAddColl);
      await borrowerOperations
        .connect(alice)
        .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amountForAddColl);

      expect(await activePool.getWStETH()).to.be.equal(
        collAmountAlice + amountForAddColl
      );
      expect(await payToken.balanceOf(activePool.target)).to.be.equal(
        collAmountAlice + amountForAddColl
      );
    });

    it("should to adds the correct collateral amount to the Trove", async () => {
      expect(
        await troveManager.Troves(alice.address)
      ).to.be.revertedWithoutReason();

      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect((await troveManager.Troves(alice.address)).coll).to.be.equal(
        collAmountAlice
      );
      expect((await troveManager.Troves(alice.address)).debt).to.be.equal(
        debtAmountAlice + BaseFeeLMA_GAS_COMPENSATION
      );

      const amountForAddColl = BigInt("5000000000000000000");

      await payToken
        .connect(alice)
        .approve(borrowerOperations, amountForAddColl);
      await borrowerOperations
        .connect(alice)
        .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amountForAddColl);

      expect((await troveManager.Troves(alice.address)).coll).to.be.equal(
        collAmountAlice + amountForAddColl
      );
      expect((await troveManager.Troves(alice.address)).debt).to.be.equal(
        debtAmountAlice + BaseFeeLMA_GAS_COMPENSATION
      );
    });

    it("should allow trove is in sortedList before and after", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect(await sortedTroves.contains(alice.address)).to.be.true;
      expect(await sortedTroves.isEmpty()).to.be.false;

      const amountForAddColl = BigInt("5000000000000000000");

      await payToken
        .connect(alice)
        .approve(borrowerOperations, amountForAddColl);
      await borrowerOperations
        .connect(alice)
        .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amountForAddColl);

      expect(await sortedTroves.contains(alice.address)).to.be.true;
      expect(await sortedTroves.isEmpty()).to.be.false;
    });

    it("should allow updates the total stakes after add coll", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      expect(await troveManager.totalStakes()).to.be.equal(collAmountAlice);

      const amountForAddColl = BigInt("5000000000000000000");

      await payToken
        .connect(alice)
        .approve(borrowerOperations, amountForAddColl);
      await borrowerOperations
        .connect(alice)
        .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amountForAddColl);

      expect(await troveManager.totalStakes()).to.be.equal(
        collAmountAlice + amountForAddColl
      );
    });

    it("should not allow add coll if trove is non-existent or closed", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      const amountForAddColl = BigInt("5000000000000000000");

      await payToken.connect(bob).approve(borrowerOperations, amountForAddColl);
      await expect(
        borrowerOperations
          .connect(bob)
          .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amountForAddColl)
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed");
    });

    it("should allow add coll in Recovery Mode", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("80000000000", await latestBlock());

      const amountForAddColl = BigInt("50000000000000000000");

      await payToken
        .connect(alice)
        .approve(borrowerOperations, amountForAddColl);
      await borrowerOperations
        .connect(alice)
        .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amountForAddColl);
    });

    it("should not allow add coll if value equal 0", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      const amountForAddColl = 0;
      await expect(
        borrowerOperations
          .connect(alice)
          .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amountForAddColl)
      ).to.be.revertedWith("Borrower Operations: Invalid amount");
    });
  });

  context("Adjust trove functionality", () => {
    it("should not allow to adjust trove  when adjustment would leave trove with ICR < MCR", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });

      const newDebt = BigInt("128000000000000000000000000");

      await openTrove({
        caller: bob,
        collAmount: BigInt("90000000000000000000"),
        baseFeeLMAAmount: newDebt,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("50000000000", await latestBlock());

      await expect(
        borrowerOperations
          .connect(alice)
          .adjustTrove(
            ethers.parseEther("1"),
            0,
            0,
            BigInt("700000000000000000000000000"),
            true,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
      );
    });

    it("should not let to adjust the trove  if the max percentage less than 0.5", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("0.001");

      await expect(
        borrowerOperations
          .connect(alice)
          .adjustTrove(
            maxFeePercentage,
            0,
            collAmountBob,
            debtAmountBob,
            true,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%");
    });

    it("should not let to adjust the trove if fee exceeds max fee percentage", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: ethers.parseEther("3200000000"),
      });

      await openTrove({
        caller: bob,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("90000000000", await latestBlock());

      const addCollAlice = BigInt("530000000000000000000");
      const addDebtAlice = BigInt("810000000000000000000000000");

      await payToken
        .connect(alice)
        .approve(borrowerOperations.target, addCollAlice);

      const maxFeePercentage = ethers.parseEther("0.049");
      await expect(
        borrowerOperations
          .connect(alice)
          .adjustTrove(
            maxFeePercentage,
            0,
            addCollAlice,
            addDebtAlice,
            true,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("Fee exceeded provided maximum");
    });
  });
  context("withdraw Base FeeLMA :", async () => {
    it("should not allow to withdraw BaseFeeLMA if top-up would leave trove with ICR < MCR", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const newCollBob = BigInt("1800000000000000000000");
      await openTrove({
        caller: bob,
        collAmount: newCollBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("70000000000", await latestBlock());

      const amountForWithdraw = BigInt("10000000000000000000");
      const maxFeePercentage = ethers.parseEther("1");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
      );
    });

    it("should not let to withdraw BaseFee if the max percentage more than 100%", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("1.1");
      const amountForWithdraw = BigInt("10000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%");
    });

    it("should not let to withdraw BaseFee if the max percentage less than 0,5%", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("0.001");
      const amountForWithdraw = BigInt("10000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%");
    });

    it("should not let to withdraw BaseFee if fee exceeds max fee percentage", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("0.005");
      const amountForWithdraw = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("Fee exceeded provided maximum");
    });

    it("should let to withdraw BaseFee", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("0.2");
      const amountForWithdraw = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).not.to.be.reverted;
    });

    it("should not let to withdraw BaseFee if calling address doesn't have active trove", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("0.2");
      const amountForWithdraw = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(bob)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed");
    });

    it("should not let to withdraw BaseFee if when requested withdrawal amount is zero BaseFeeLMA", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("0.2");
      const amountForWithdraw = 0;

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith(
        "BorrowerOps: Debt increase requires non-zero debtChange"
      );
    });

    it("should not let to withdraw baseFee when system is in Recovery Mode and ICR < CCR", async () => {
      const newCollAlice = BigInt("1500000000000000000000");
      const newDebtAlice = BigInt("1800000000000000000000000000");

      await openTrove({
        caller: alice,
        collAmount: newCollAlice,
        baseFeeLMAAmount: newDebtAlice,
      });

      const newCollBob = BigInt("1800000000000000000000");

      await openTrove({
        caller: bob,
        collAmount: newCollBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("540000000000", await latestBlock());

      const amountForWithdraw = BigInt("30000000000000000000000000");
      const maxFeePercentage = ethers.parseEther("1");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith(
        "BorrowerOps: Operation must leave trove with ICR >= CCR"
      );
    });

    it("should not let to withdraw baseFee when a withdrawal would cause the TCR of the system to fall below the CCR", async () => {
      const newCollAlice = BigInt("1500000000000000000000");
      const newDebtAlice = BigInt("1800000000000000000000000000");

      await openTrove({
        caller: alice,
        collAmount: newCollAlice,
        baseFeeLMAAmount: newDebtAlice,
      });

      const newCollBob = BigInt("1800000000000000000000");

      await openTrove({
        caller: bob,
        collAmount: newCollBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("532000000000", await latestBlock());

      const amountForWithdraw = BigInt("30000000000000000000000000");
      const maxFeePercentage = ethers.parseEther("1");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in TCR < CCR is not permitted"
      );
    });

    it("should let to increase the Trove's BaseFeeLMA debt by the correct amount", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("1");
      const amountForWithdraw = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).not.to.be.reverted;

      expect(await borrowerOperations.getEntireSystemDebt()).to.be.equal(
        debtAmountAlice + amountForWithdraw + BaseFeeLMA_GAS_COMPENSATION
      );
    });

    it("should let to increase BaseFeeLMA debt in ActivePool by correct amount ", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const maxFeePercentage = ethers.parseEther("1");
      const amountForWithdraw = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawBaseFeeLMA(
            maxFeePercentage,
            amountForWithdraw,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).not.to.be.reverted;

      expect(await activePool.getBaseFeeLMADebt()).to.be.equal(
        debtAmountAlice + amountForWithdraw + BaseFeeLMA_GAS_COMPENSATION
      );
    });

    it("should let to repay BaseFeeLMA when it would leave trove with net debt >= minimum net debt", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const amountForRepay = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .repayBaseFeeLMA(
            amountForRepay,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).not.to.be.reverted;
    });

    it("should not let to repay BaseFeeLM when it would leave trove with net debt < minimum net debt", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const amountForRepay = BigInt("1990000000000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .repayBaseFeeLMA(
            amountForRepay,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith(
        "BorrowerOps: Trove's net debt must be greater than minimum"
      );
    });

    it("should not let to repay BaseFeeLM if repaid amount is greater than current debt ", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const amountForRepay = debtAmountAlice + BigInt("1");

      await expect(
        borrowerOperations
          .connect(alice)
          .repayBaseFeeLMA(
            amountForRepay,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWithPanic(0x11);
    });

    it("should not let to repay BaseFeeLMA when calling address does not have active trove", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const amountForRepay = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(bob)
          .repayBaseFeeLMA(
            amountForRepay,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed");
    });

    it("should not let to reduce the Trove's BaseFeeLMA debt by the correct amount", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const amountForRepay = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .repayBaseFeeLMA(
            amountForRepay,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).not.to.be.reverted;

      expect(await borrowerOperations.getEntireSystemDebt()).to.be.equal(
        debtAmountAlice + BaseFeeLMA_GAS_COMPENSATION - amountForRepay
      );
    });

    it("should not let to reduce the BaseFeeLMA debt in ActivePool by correct amount", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const amountForRepay = BigInt("1000000000000000000000");

      await expect(
        borrowerOperations
          .connect(alice)
          .repayBaseFeeLMA(
            amountForRepay,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).not.to.be.reverted;

      expect(await activePool.getBaseFeeLMADebt()).to.be.equal(
        debtAmountAlice + BaseFeeLMA_GAS_COMPENSATION - amountForRepay
      );
    });

    it("should let to repay debt in Recovery Mode", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      const amountForRepay = BigInt("1000000000000000000000");

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("100000000000", await latestBlock());

      await expect(
        borrowerOperations
          .connect(alice)
          .repayBaseFeeLMA(
            amountForRepay,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).not.to.be.reverted;
    });

    it("should not let to repay debt if borrower has insufficient BaseFeeLMA balance to cover his debt repayment", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      await openTrove({
        caller: bob,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      const amountForRepay =
        (await baseFeeLMAToken.balanceOf(bob.address)) + BigInt("1");

      await expect(
        borrowerOperations
          .connect(bob)
          .repayBaseFeeLMA(
            amountForRepay,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith(
        "BorrowerOps: Caller doesnt have enough BaseFeeLMA to make repayment"
      );
    });
  });
});
