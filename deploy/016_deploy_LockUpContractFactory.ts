import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("LockUpContractFactory", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "LockUpContractFactory"];

export default deploy;
