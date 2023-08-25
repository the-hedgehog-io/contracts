import { DeployFunction } from "hardhat-deploy/types";
import {
  createExecuteWithLog,
  isOwnershipRenounced,
  timeValues,
} from "./utils";
import { deployConfig } from "./deployConfig";
import { ethers } from "hardhat";

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts();
  const executeWithLog = createExecuteWithLog(deployments.execute);

  const BaseFeeLMAToken = await deployments.get("BaseFeeLMAToken");
  const HOGToken = await deployments.get("HOGToken");
  const Unipool = await deployments.get("Unipool");

  // TODO: Get Move that to 21st step
  if (!isOwnershipRenounced(Unipool.address)) {
    console.log("Setting up Unipool...");
    const uniswapV2Factory = await ethers.getContractAt(
      "UniswapV2Factory",
      deployConfig.uniswapV2Factory
    );
    const BaseFeeLMAStEthPairAddr = await uniswapV2Factory.getPair(
      BaseFeeLMAToken.address,
      deployConfig.stEth
    );

    const StEthBaseFeeLMAPairAddr = await uniswapV2Factory.getPair(
      deployConfig.stEth,
      BaseFeeLMAToken.address
    );
    if (BaseFeeLMAStEthPairAddr === ethers.constants.AddressZero) {
      throw console.error("Uniswap pair is missing");
    }
    if (BaseFeeLMAStEthPairAddr != StEthBaseFeeLMAPairAddr) {
      throw console.error("Uniswap pair addresses are not equal");
    }
    await executeWithLog("Unipool", { from: deployer }, "setAddresses", [
      HOGToken.address,
      BaseFeeLMAStEthPairAddr,
      timeValues.SECONDS_IN_SIX_WEEKS,
    ]);
  }
  console.log("Unipool is set");
};
deploy.tags = ["main", "setUnipool"];
deploy.dependencies = ["UniswapV2Factory", "Unipool"];

export default deploy;
