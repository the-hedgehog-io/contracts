import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  deploy("ActivePool", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "ActivePool"];

export default deploy;
