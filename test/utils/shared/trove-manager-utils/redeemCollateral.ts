import { ethers } from "hardhat";
import { HintHelpers } from "../../../../typechain-types/contracts";
import { getSigners } from "../../index";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { BigNumberish } from "ethers";
import { TroveManager } from "../../../../typechain-types";

export type RedeemAllCollateral = {
  caller: SignerWithAddress;
  baseFeeLMAamount: BigNumberish | string;
  upperPartialRedemptionHint: string;
  lowerPartialRedemptionHint: string;
  maxIterations: number;
  maxFeePercentage: BigNumberish;
  gasPrice: string | BigNumberish;
};

export type RedeemCollateral =
  ({}: Partial<RedeemAllCollateral>) => Promise<void>;

export const redeem = async ({
  hintHelpers,
  troveManager,
}: {
  hintHelpers: HintHelpers;
  troveManager: TroveManager;
}) => {
  const [, , , , bob] = await getSigners({
    fork: false,
  });

  const getRedemptionHints = async ({
    baseFeeLMAamount = 0,
    price = 0,
    maxIterations = 0,
  }) => {
    const {
      firstRedemptionHint,
      partialRedemptionHintNICR,
      truncatedBaseFeeLMAamount,
    } = await hintHelpers.getRedemptionHints(
      baseFeeLMAamount,
      price,
      maxIterations
    );
    return {
      firstRedemptionHint,
      partialRedemptionHintNICR,
      truncatedBaseFeeLMAamount,
    };
  };
  const redeemCollateral: RedeemCollateral = async ({
    caller = bob,
    baseFeeLMAamount = ethers.parseEther("0"),
    upperPartialRedemptionHint = ethers.ZeroAddress,
    lowerPartialRedemptionHint = ethers.ZeroAddress,
    maxIterations = 0,
    maxFeePercentage = ethers.parseEther("1"),
    gasPrice = 0,
  }: Partial<RedeemAllCollateral> = {}) => {
    const { firstRedemptionHint, partialRedemptionHintNICR } =
      await hintHelpers.getRedemptionHints(
        baseFeeLMAamount,
        gasPrice,
        maxIterations
      );

    await troveManager
      .connect(caller)
      .redeemCollateral(
        baseFeeLMAamount,
        firstRedemptionHint,
        upperPartialRedemptionHint,
        lowerPartialRedemptionHint,
        partialRedemptionHintNICR,
        maxIterations,
        maxFeePercentage
      );
  };
  return { getRedemptionHints, redeemCollateral };
};
