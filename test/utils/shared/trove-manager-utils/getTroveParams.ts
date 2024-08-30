import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { TroveManager } from "../../../../typechain-types";
import { getDefaultSigners } from "../stability-pool-utils";
import { expect } from "chai";
import { ethers } from "hardhat";

export type GetCRParams = {
  owner: SignerWithAddress;
  expectedColl: bigint | string;
  expectedDebt: bigint | string;
};

export type CollateralRatioParams =
  ({}: Partial<GetCRParams>) => Promise<bigint>;

export type GetEntireCollAndDebtParams = ({}: Partial<GetCRParams>) => Promise<{
  debt: bigint;
  coll: bigint;
  pendingBaseFeeLMADebtReward: bigint;
  pendingWStETHReward: bigint;
}>;

export const getCollRatioParams = async ({
  troveManager,
}: {
  troveManager: TroveManager;
}) => {
  const { bob } = await getDefaultSigners();

  const getCR: CollateralRatioParams = async ({
    owner = bob,
  }: Partial<GetCRParams> = {}) => {
    return await troveManager.getUnreliableTroveICR(owner.address);
  };

  const getTroveAndCheck = async ({
    owner = bob,
    expectedColl = ethers.parseEther("0"),
    expectedDebt = ethers.parseEther("0"),
  }) => {
    const { debt, coll } = await troveManager.getEntireDebtAndColl(
      owner.address
    );

    expect(debt).to.be.equal(expectedDebt);
    expect(coll).to.be.equal(expectedColl);
  };

  const getTrove: GetEntireCollAndDebtParams = async ({ owner = bob }) => {
    const { debt, coll, pendingBaseFeeLMADebtReward, pendingWStETHReward } =
      await troveManager.getEntireDebtAndColl(owner.address);
    return {
      debt,
      coll,
      pendingBaseFeeLMADebtReward,
      pendingWStETHReward,
    };
  };
  return { getCR, getTroveAndCheck, getTrove };
};
