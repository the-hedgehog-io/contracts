import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  deploy("TroveManager", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "TroveManager"];

export default deploy;
