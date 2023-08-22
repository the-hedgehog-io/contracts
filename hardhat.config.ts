import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
require("@nomiclabs/hardhat-truffle5");

import * as dotenv from "dotenv";
dotenv.config();

const packageJson = require("./package.json");

const accountsNew =
  process.env.PK_DEPLOYER !== undefined
    ? [process.env.PK_DEPLOYER as string]
    : [];

const fs = require("fs");
const accounts = require("./hardhatAccountsList2k.js");
const accountsList = accounts.accountsList;

const getSecret = (secretKey: any, defaultValue = "") => {
  const SECRETS_FILE = "./secrets.js";
  let secret = defaultValue;
  if (fs.existsSync(SECRETS_FILE)) {
    const { secrets } = require(SECRETS_FILE);
    if (secrets[secretKey]) {
      secret = secrets[secretKey];
    }
  }

  return secret;
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.4.23",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
      {
        version: "0.5.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
      {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      accounts: accountsList,
      gas: 10000000, // tx gas limit
      blockGasLimit: 15000000,
      gasPrice: 20000000000,
      initialBaseFeePerGas: 0,
    },
  },

  mocha: { timeout: 12000000 },

  // gasReporter: {
  //   enabled: process.env.REPORT_GAS ? true : false,
  // },

  namedAccounts: {
    deployer: 0,
  },
};

export default config;
