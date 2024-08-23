import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { getDefaultSigners } from "../stability-pool-utils";
import { BorrowerOperations, TERC20 } from "../../../../typechain-types";

export type OpenTroveParams = {
  caller: SignerWithAddress;
  maxFeePercentage: number;
  baseFeeLMAAmount: string | BigNumberish;
  collAmount: string | BigNumberish;
  upperHint: string;
  lowerHint: string;
};

export type OpenTroveToBorrowerOperations =
  ({}: Partial<OpenTroveParams>) => Promise<void>;

export const getOpenTrove = async ({
  payToken,
  borrowerOperations,
}: {
  payToken: TERC20;
  borrowerOperations: BorrowerOperations;
}) => {
  const { bob } = await getDefaultSigners();

  const openTroveToBorrowerOperations: OpenTroveToBorrowerOperations = async ({
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
  return { openTroveToBorrowerOperations };
};
