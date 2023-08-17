import { DeployFunction } from "hardhat-deploy/types";
import { createExecuteWithLog } from "./utils";

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts();

  const PromMarketplace = await deployments.get("PromMarketplace");

  const executeWithLog = createExecuteWithLog(deployments.execute);

  await executeWithLog(
    "AddressRegistry",
    { from: deployer },
    "setMarketplace",
    PromMarketplace.address
  );
};
deploy.tags = ["main", "updateBaseFeeTokens"];
deploy.dependencies = [
  "AddressRegistry",
  "PromMarketplace",
  "SafeVaultProxyFactory",
  "VaultManager",
];

export default deploy;
