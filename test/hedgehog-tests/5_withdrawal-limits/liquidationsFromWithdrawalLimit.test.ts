import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { ethers } from "hardhat";
import { TERC20 } from "../../../typechain-types";
import { expect } from "chai";
import { getSigners, setupContracts } from "../../utils";
const { latestBlock } = time;

import {
  ActivePool,
  BaseFeeLMAToken,
  BaseFeeOracle,
  BorrowerOperations,
  HintHelpers,
  TroveManager,
} from "../../../typechain-types/contracts";

import {
  OpenTrove,
  RedeemCollateral,
  getOpenTrove,
  redeem,
} from "../../utils/shared";

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Base functionality and Access Control. Flow #1", () => {
    let deployer: SignerWithAddress,
      alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;
    let dave: SignerWithAddress;
    let activePool: ActivePool;
    let troveManager: TroveManager;
    let hintHelpers: HintHelpers;

    let secondaryOracle: BaseFeeOracle;
    let baseFeeLMAToken: BaseFeeLMAToken;
    let borrowerOperations: BorrowerOperations;
    let payToken: TERC20;
    let openTrove: OpenTrove;
    let redeemCollateral: RedeemCollateral;

    beforeEach(async () => {
      [deployer, alice, bob, carol, dave, bob, carol] = await getSigners({
        fork: false,
      });
      ({
        troveManager,
        activePool,
        borrowerOperations,
        hintHelpers,
        payToken,
        secondaryOracle,
        baseFeeLMAToken,
      } = await setupContracts());

      ({ openTrove } = await getOpenTrove({
        payToken,
        borrowerOperations,
      }));

      ({ redeemCollateral } = await redeem({ hintHelpers, troveManager }));
    });
    const collAmountAlice = BigInt("200000000000000000000");
    const collAmountAliceExtended = BigInt("2000000000000000000000");
    const debtAmountAlice = BigInt("2000000000000000000000000000");
    const collAmountBob = BigInt("200000000000000000000");
    const debtAmountBob = BigInt("1280000000000000000000000000");

    it("should not let to repay debt if borrower has insufficient BaseFeeLMA balance to cover his debt repayment", async () => {
      await payToken.transfer(carol.address, ethers.parseEther("10000000000"));

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

      await openTrove({
        caller: carol,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: BigInt("700000000000000000000000000"),
      });

      await openTrove({
        caller: dave,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: BigInt("100000000000000000000000000"),
      });

      const systemCollBeforeLiquidate =
        await borrowerOperations.getEntireSystemColl();

      expect(await troveManager.getTroveOwnersCount()).to.be.equal(4);

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("110000000000", await latestBlock());

      const unusedLimitBeforeLiquidate =
        await borrowerOperations.unusedWithdrawalLimit();

      await troveManager.liquidateTroves(2);

      const systemCollAfterLiquidate =
        await borrowerOperations.getEntireSystemColl();

      const unusedLimitAfterLiquidate =
        await borrowerOperations.unusedWithdrawalLimit();
    });

    it("should allow to update limits after close troves correctly", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      await openTrove({
        caller: bob,
        collAmount: collAmountBob + collAmountAlice / BigInt("2"),
        baseFeeLMAAmount: debtAmountBob,
      });

      const systemCollBeforeClose =
        await borrowerOperations.getEntireSystemColl();

      const unusedLimitBeforeClose =
        await borrowerOperations.unusedWithdrawalLimit();

      await borrowerOperations.connect(alice).closeTrove();

      const systemCollAfterClose =
        await borrowerOperations.getEntireSystemColl();

      const unusedLimitAfterClose =
        await borrowerOperations.unusedWithdrawalLimit();

      expect(systemCollBeforeClose - systemCollAfterClose).to.be.equal(
        collAmountAlice
      );
    });

    it("should allow to redeem collateral correctly", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAlice,
        baseFeeLMAAmount: debtAmountAlice,
      });
      await openTrove({
        caller: bob,
        collAmount: collAmountBob + collAmountAlice / BigInt("2"),
        baseFeeLMAAmount: debtAmountBob,
      });

      expect(await activePool.getWStETH()).to.be.equal(
        collAmountAlice + collAmountBob + collAmountAlice / BigInt("2")
      );
      await redeemCollateral({
        caller: alice,
        baseFeeLMAamount: ethers.parseEther("12"),
        gasPrice: "30000000000",
      });
      expect(await activePool.getWStETH()).to.be.equal("499999999640000000000");
    });

    it("should allow to update limit after liquidate correctly", async () => {
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

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("110000000000", await latestBlock());

      expect(await troveManager.Troves(bob.address)).not.to.be.reverted;

      expect(
        await troveManager.liquidate(bob.address, {
          from: deployer,
        })
      ).not.to.be.reverted;
    });

    it("should allows a user to open a Trove, then close it, then re-open it with sufficent collateral in system", async () => {
      await openTrove({
        caller: alice,
        collAmount: collAmountAliceExtended,
        baseFeeLMAAmount: debtAmountAlice,
      });

      await openTrove({
        caller: bob,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob,
      });

      expect(await borrowerOperations.unusedWithdrawalLimit()).to.be.equal(
        (collAmountAliceExtended + collAmountBob) / BigInt(2)
      );

      await baseFeeLMAToken
        .connect(alice)
        .transfer(bob.address, ethers.parseEther("900000000"));

      expect(await troveManager.getTroveStatus(bob.address)).to.be.equal(1);

      await borrowerOperations.connect(bob).closeTrove();

      const unusedLimitAfterClose = BigInt("905000000000000000000");
      expect(await borrowerOperations.unusedWithdrawalLimit()).to.be.equal(
        unusedLimitAfterClose
      );

      expect(await troveManager.getTroveStatus(bob.address)).not.to.be.equal(1);

      const newDebtBob = BigInt("128000000000000000000000000");
      const newCollBob = BigInt("20000000000000000000");

      await openTrove({
        caller: bob,
        collAmount: newCollBob,
        baseFeeLMAAmount: newDebtBob,
      });

      expect(await borrowerOperations.unusedWithdrawalLimit()).to.be.equal(
        unusedLimitAfterClose + newCollBob / BigInt("2")
      );

      expect(await troveManager.getTroveStatus(bob.address)).to.be.equal(1);
    });

    it("should allow to update limit after liquidate correctly", async () => {
      await openTrove({
        caller: alice,
        collAmount: BigInt("150000000000000000000"), //150
        baseFeeLMAAmount: debtAmountAlice,
      });

      await openTrove({
        caller: bob,
        collAmount: collAmountBob,
        baseFeeLMAAmount: debtAmountBob, //200
      });

      await secondaryOracle
        .connect(deployer)
        .feedBaseFeeValue("110000000000", await latestBlock());

      expect(await troveManager.Troves(bob.address)).not.to.be.reverted;

      expect(
        await troveManager.liquidate(bob.address, {
          from: deployer,
        })
      ).not.to.be.reverted;
    });

    it("should not allow to  liquidate if nothing to liquidate", async () => {
      await openTrove({
        caller: alice,
        collAmount: BigInt("300000000000000000000"), //300
        baseFeeLMAAmount: debtAmountAlice,
      });

      await openTrove({
        caller: bob,
        collAmount: BigInt("200000000000000000000"), //200
        baseFeeLMAAmount: debtAmountBob,
      });

      await expect(
        troveManager.liquidate(bob.address, {
          from: deployer,
        })
      ).to.be.revertedWith("TroveManager: nothing to liquidate");
    });
  });
});
