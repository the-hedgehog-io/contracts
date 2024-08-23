import { BaseFeeLMAToken } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { getSigners, setupContracts } from "../utils";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";

type ProvideParams = {
  caller: SignerWithAddress;
  amount: BigNumberish;
};

export const correct = async (_baseFeeLMAToken: BaseFeeLMAToken) => {
  const [bob] = await getSigners({
    fork: false,
  });
  const [, , , , stabilityPool] = await setupContracts();

  const approve = async ({
    caller = bob,
    amount = ethers.parseEther("0"),
  }: Partial<ProvideParams> = {}) => {
    await _baseFeeLMAToken.approve(
      await stabilityPool.connect(caller).getAddress(),
      amount
    );
    console.log("amount approve", amount);
    console.log("caller", caller);
  };

  const provide = async ({
    caller = bob,
    amount = ethers.parseEther("0"),
  }: Partial<ProvideParams> = {}) => {
    console.log("balance caller", await _baseFeeLMAToken.balanceOf(caller));
    console.log("amount", amount);
    await stabilityPool.connect(caller).provideToSP(amount);
  };
  return { approve, provide };
};
