import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy, get },

  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();
  const TroveManager = await get("TroveManager");
  const StabilityPool = await get("StabilityPool");
  const BorrowerOperations = await get("BorrowerOperations");

  await deploy("BaseFeeLMAToken", {
    from: deployer,
    log: true,
    args: [
      TroveManager.address,
      StabilityPool.address,
      BorrowerOperations.address,
    ],
  });
};

deploy.tags = ["main", "BaseFeeLMAToken"];

export default deploy;
