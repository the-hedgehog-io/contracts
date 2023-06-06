import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";

import * as dotenv from "dotenv";
dotenv.config();

const packageJson = require("./package.json");

const accounts =
  process.env.PK_DEPLOYER !== undefined
    ? [process.env.PK_DEPLOYER as string]
    : [];

const config: HardhatUserConfig = {
  solidity: "0.8.19",

  paths: {
    deployments: `deployments/${packageJson.version}`,
  },

  networks: {
    mumbai: { url: "https://rpc.ankr.com/polygon_mumbai", accounts: accounts },
  },

  namedAccounts: {
    deployer: 0,
  },
};

export default config;
