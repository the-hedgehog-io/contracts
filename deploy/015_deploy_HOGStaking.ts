import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("HOGStaking", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "HOGStaking"];

export default deploy;
