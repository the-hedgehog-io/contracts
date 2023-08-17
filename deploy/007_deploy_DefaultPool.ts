import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("DefaultPool", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "DefaultPool"];

export default deploy;
