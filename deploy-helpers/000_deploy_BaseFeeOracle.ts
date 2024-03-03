import { DeployFunction } from "hardhat-deploy/types";
import { deployConfig } from "./deployConfig";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("BaseFeeOracle", {
    from: deployer,
    log: true,
    args: [deployer, deployer],
  });
};

deploy.tags = ["main", "BaseFeeOracle"];

export default deploy;
