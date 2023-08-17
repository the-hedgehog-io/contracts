import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  // TODO: Add proper HDG token params
  await deploy("HDGToken", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "HDGToken"];

export default deploy;
