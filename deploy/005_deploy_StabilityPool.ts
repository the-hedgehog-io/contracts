import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("StabilityPool", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "StabilityPool"];

export default deploy;
