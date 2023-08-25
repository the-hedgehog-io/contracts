import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy, get },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();
  const TroveManager = await get("TroveManager");
  const SortedTroves = await get("SortedTroves");

  await deploy("MultiTroveGetter", {
    from: deployer,
    log: true,
    args: [TroveManager.address, SortedTroves.address],
  });
};

deploy.tags = ["main", "MultiTroveGetter"];

export default deploy;
