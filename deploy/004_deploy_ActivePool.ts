import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("ActivePool", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "ActivePool"];

export default deploy;
