import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  deploy("SortedTroves", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "SortedTroves"];

export default deploy;
