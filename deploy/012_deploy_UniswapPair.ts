import { DeployFunction } from "hardhat-deploy/types";
import { deployConfig } from "../deploy-helpers/deployConfig";
import { deployments, ethers } from "hardhat";

const deploy: DeployFunction = async ({
  deployments: { deploy, get },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();
  const BaseFeeLMAToken = await get("BaseFeeLMAToken");

  const uniswapV2Factory = await ethers.getContractAt(
    "UniswapV2Factory",
    deployConfig.uniswapV2Factory
  );

  // Check Uniswap Pair LUSD-ETH pair before pair creation
  let BaseFeeLMAStEthPairAddr = await uniswapV2Factory.getPair(
    BaseFeeLMAToken.address,
    deployConfig.stEth
  );
  let StEthBaseFeeLMAPairAddr = await uniswapV2Factory.getPair(
    deployConfig.stEth,
    BaseFeeLMAToken.address
  );
  if (BaseFeeLMAStEthPairAddr != StEthBaseFeeLMAPairAddr) {
    throw console.error("Uniswap pair addresses are not equal");
  }

  if (BaseFeeLMAStEthPairAddr == ethers.constants.AddressZero) {
    console.log("deploying a uniswap pair");
    // Deploy Uniswap paid for StEth - BaseFeeLMA
    await uniswapV2Factory.createPair(
      deployConfig.stEth,
      BaseFeeLMAToken.address
    );
  }

  BaseFeeLMAStEthPairAddr = await uniswapV2Factory.getPair(
    BaseFeeLMAToken.address,
    deployConfig.stEth
  );

  StEthBaseFeeLMAPairAddr = await uniswapV2Factory.getPair(
    deployConfig.stEth,
    BaseFeeLMAToken.address
  );
  if (BaseFeeLMAStEthPairAddr === ethers.constants.AddressZero) {
    throw console.error("Uniswap pair is missing");
  }
  if (BaseFeeLMAStEthPairAddr != StEthBaseFeeLMAPairAddr) {
    throw console.error("Uniswap pair addresses are not equal");
  }
};

deploy.tags = ["main", "UniswapPair"];

export default deploy;
