import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("CollSurplus", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "CollSurplus"];

export default deploy;
