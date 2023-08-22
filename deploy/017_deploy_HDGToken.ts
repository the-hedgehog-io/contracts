import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  // TODO: Add proper HOG token params
  await deploy("HOGToken", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "HOGToken"];

export default deploy;
