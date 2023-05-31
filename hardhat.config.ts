import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";

import * as dotenv from "dotenv";
dotenv.config();

const packageJson = require("./package.json");

const config: HardhatUserConfig = {
  solidity: "0.8.19",

  paths: {
    deployments: `deployments/${packageJson.version}`,
  },

  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
};

export default config;
