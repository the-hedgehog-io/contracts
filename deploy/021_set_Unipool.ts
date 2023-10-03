import { DeployFunction } from "hardhat-deploy/types";
import {
  createExecuteWithLog,
  isOwnershipRenounced,
  timeValues,
} from "../deploy-helpers";
import { deployConfig } from "../deploy-helpers/deployConfig";
import { ethers } from "hardhat";

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts();
  const executeWithLog = createExecuteWithLog(deployments.execute);

  const BaseFeeLMAToken = await deployments.get("BaseFeeLMAToken");
  const HOGToken = await deployments.get("HOGToken");
  const Unipool = await deployments.get("Unipool");

  // TODO: Get Move that to 21st step
  if (!(await isOwnershipRenounced(Unipool.address))) {
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
    if (BaseFeeLMAStEthPairAddr === ethers.ZeroAddress) {
      throw console.error("Uniswap pair is missing");
    }
    if (BaseFeeLMAStEthPairAddr != StEthBaseFeeLMAPairAddr) {
      throw console.error("Uniswap pair addresses are not equal");
    }

    console.log(
      "Params: ",
      Unipool.address,
      HOGToken.address,
      BaseFeeLMAStEthPairAddr,
      timeValues.SECONDS_IN_SIX_WEEKS
    );
    await executeWithLog(
      "Unipool",
      { from: deployer },
      "setParams",
      HOGToken.address,
      BaseFeeLMAStEthPairAddr,
      timeValues.SECONDS_IN_SIX_WEEKS
    );
  }
};
deploy.tags = ["main", "setUnipool"];
deploy.dependencies = ["UniswapV2Factory", "Unipool"];

export default deploy;
