import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { getSigners } from "../../index";
import { BorrowerOperations, TERC20 } from "../../../../typechain-types";

export type OpenTroveParams = {
  caller: SignerWithAddress;
  maxFeePercentage: number;
  baseFeeLMAAmount: string | BigNumberish;
  collAmount: string | BigNumberish;
  upperHint: string;
  lowerHint: string;
};

export type OpenTrove = ({}: Partial<OpenTroveParams>) => Promise<void>;

export const getOpenTrove = async ({
  payToken,
  borrowerOperations,
}: {
  payToken: TERC20;
  borrowerOperations: BorrowerOperations;
}) => {
  const [, , , , bob] = await getSigners({
    fork: false,
  });

  const openTrove: OpenTrove = async ({
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
  return { openTrove };
};
