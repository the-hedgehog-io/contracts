import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("CollSurplas", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "CollSurplas"];

export default deploy;
