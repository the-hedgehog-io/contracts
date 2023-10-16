import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("LockupContractFactory", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "LockupContractFactory"];

export default deploy;
