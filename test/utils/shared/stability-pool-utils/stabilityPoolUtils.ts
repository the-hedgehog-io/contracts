import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { getSigners } from "../..";
import { BaseFeeLMAToken, StabilityPool } from "../../../../typechain-types";

export type ProvideParams = {
  caller: SignerWithAddress;
  amount: BigNumberish;
};

export type ProvideToStabilityPool =
  ({}: Partial<ProvideParams>) => Promise<void>;

export const getStabilityPoolMethods = async ({
  baseFeeLMAToken,
  stabilityPool,
}: {
  baseFeeLMAToken: BaseFeeLMAToken;
  stabilityPool: StabilityPool;
}) => {
  const [, , , , bob] = await getSigners({
    fork: false,
  });

  const provideToStabilityPool: ProvideToStabilityPool = async ({
    caller = bob,
    amount = ethers.parseEther("0"),
  }: Partial<ProvideParams> = {}) => {
    await baseFeeLMAToken.connect(caller).approve(stabilityPool.target, amount);
    await stabilityPool.connect(caller).provideToSP(amount);
  };
  return { provideToStabilityPool };
};
