import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("HDGStaking", {
    from: deployer,
    log: true,
  });
};

// TODO: Have HDG staking instead of LQTY Staking

deploy.tags = ["main", "HDGStaking"];

export default deploy;
