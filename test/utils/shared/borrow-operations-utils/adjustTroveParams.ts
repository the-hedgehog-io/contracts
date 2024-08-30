import { BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { BorrowerOperations, TERC20 } from "../../../../typechain-types";
import { getDefaultSigners } from "../stability-pool-utils";
import { ethers } from "hardhat";

export type AdjustTroveParams = {
  caller: SignerWithAddress;
  amount: string | BigNumberish;
  maxFeePercentage: BigNumberish;
  collIncrease?: string | BigNumberish;
  upperHint: string;
  lowerHint: string;
};
export type AdjustTroveParamsToBorrowerOperations =
  ({}: Partial<AdjustTroveParams>) => Promise<void>;

export const getAdjustTroveParams = async ({
  borrowerOperations,
  payToken,
}: {
  borrowerOperations: BorrowerOperations;
  payToken: TERC20;
}) => {
  const { bob } = await getDefaultSigners();

  const troveDebtIncrease: AdjustTroveParamsToBorrowerOperations = async ({
    caller = bob,
    amount = 0,
    maxFeePercentage = ethers.parseEther("1"),
    collIncrease = 0,
  }: Partial<AdjustTroveParams> = {}) => {
    await payToken
      .connect(caller)
      .approve(await borrowerOperations.getAddress(), collIncrease);
    await borrowerOperations
      .connect(caller)
      .adjustTrove(
        maxFeePercentage,
        0,
        collIncrease,
        amount,
        true,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
  };

  const troveCollIncrease: AdjustTroveParamsToBorrowerOperations = async ({
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

  const decreaseDebt: AdjustTroveParamsToBorrowerOperations = async ({
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

  return { troveDebtIncrease, troveCollIncrease, decreaseDebt };
};
