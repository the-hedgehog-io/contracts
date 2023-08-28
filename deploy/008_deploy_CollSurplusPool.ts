import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("CollSurplusPool", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "CollSurplusPool"];

export default deploy;
