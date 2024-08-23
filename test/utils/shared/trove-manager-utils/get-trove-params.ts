import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { TroveManager } from "../../../../typechain-types";
import { getDefaultSigners } from "../stability-pool-utils";

export type GetCRParams = {
  owner: SignerWithAddress;
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

  const getUnreliableTroveCollateralRatio: CollateralRatioParams = async ({
    owner = bob,
  }: Partial<GetCRParams> = {}) => {
    return await troveManager.getUnreliableTroveICR(owner.address);
  };

  const getEntireCollAndDebt: GetEntireCollAndDebtParams = async ({
    owner = bob,
  }) => {
    const { debt, coll, pendingBaseFeeLMADebtReward, pendingWStETHReward } =
      await troveManager.getEntireDebtAndColl(owner.address);

    return {
      debt,
      coll,
      pendingBaseFeeLMADebtReward,
      pendingWStETHReward,
    };
  };
  return { getUnreliableTroveCollateralRatio, getEntireCollAndDebt };
};
