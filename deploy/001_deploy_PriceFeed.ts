import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  console.log("Starting deployment process...");
  const { deployer } = await getNamedAccounts();

  await deploy("PriceFeed", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "PriceFeed"];

export default deploy;
