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
  let BaseFeeLMAWStEthPairAddr = await uniswapV2Factory.getPair(
    BaseFeeLMAToken.address,
    deployConfig.wwstETH
  );
  let WStEthBaseFeeLMAPairAddr = await uniswapV2Factory.getPair(
    deployConfig.wwstETH,
    BaseFeeLMAToken.address
  );
  if (BaseFeeLMAWStEthPairAddr != WStEthBaseFeeLMAPairAddr) {
    throw console.error("Uniswap pair addresses are not equal");
  }

  if (BaseFeeLMAWStEthPairAddr == ethers.ZeroAddress) {
    console.log("deploying a uniswap pair");
    // Deploy Uniswap paid for WStEth - BaseFeeLMA
    await uniswapV2Factory.createPair(
      deployConfig.wwstETH,
      BaseFeeLMAToken.address
    );
  }

  BaseFeeLMAWStEthPairAddr = await uniswapV2Factory.getPair(
    BaseFeeLMAToken.address,
    deployConfig.wwstETH
  );

  WStEthBaseFeeLMAPairAddr = await uniswapV2Factory.getPair(
    deployConfig.wwstETH,
    BaseFeeLMAToken.address
  );
  if (BaseFeeLMAWStEthPairAddr === ethers.ZeroAddress) {
    throw console.error("Uniswap pair is missing");
  }
  if (BaseFeeLMAWStEthPairAddr != WStEthBaseFeeLMAPairAddr) {
    throw console.error("Uniswap pair addresses are not equal");
  }
};

deploy.tags = ["main", "UniswapPair"];

export default deploy;
