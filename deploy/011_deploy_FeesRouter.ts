import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("FeesRouter", {
    from: deployer,
    log: true,
    args: [deployer, deployer],
  });
};

deploy.tags = ["main", "FeesRouter"];

export default deploy;
