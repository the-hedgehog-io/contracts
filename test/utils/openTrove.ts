import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { getSigners, setupContracts } from "../utils";
import { TERC20, BorrowerOperations } from "../../typechain-types";

type OpenTroveParams = {
  caller: SignerWithAddress;
  maxFeePercentage: number;
  baseFeeLMAAmount: string | BigInt;
  collAmount: string | BigInt;
  upperHint: string;
  lowerHint: string;
};
let caller: SignerWithAddress;
let payToken: TERC20;
let borrowerOperations: BorrowerOperations;

export const openTrove = async ({
  caller: SignerWithAddress,
  baseFeeLMAAmount: _baseFeeLMAAmount,
  collAmount: _collAmount,
}: Partial<OpenTroveParams> = {}) => {
  [caller] = await getSigners({
    fork: false,
  });

  await payToken
    .connect(caller)
    .approve(await borrowerOperations.getAddress(), _collAmount);
  await borrowerOperations
    .connect(caller)
    .openTrove(
      ethers.parseEther("1".toString()),
      _baseFeeLMAAmount,
      _collAmount,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
};
