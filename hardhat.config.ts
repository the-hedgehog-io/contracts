import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "hardhat-abi-exporter";
import exportDeployment from "./tasks/export";

import * as dotenv from "dotenv";
dotenv.config();

const packageJson = require("./package.json");

const accountsNew =
  process.env.PK_DEPLOYER !== undefined
    ? [process.env.PK_DEPLOYER as string]
    : [];

task("deploy:export", "Export deployment data", async (_, hre, runSuper) => {
  console.log("Exporting deployment data...");
  await exportDeployment(hre);
  console.log("Deployment data exported!");
});

task("deploy", "Export deployment data", async (_, hre, runSuper) => {
  await runSuper();
  console.log("Exporting deployment data...");
  await exportDeployment(hre);
  console.log("Deployment data exported!");
});

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
        version: "0.5.16",
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
    mumbai: {
      accounts: [process.env.PK_DEPLOYER || ""],
      url: "https://rpc.ankr.com/polygon_mumbai",
    },
  },

  mocha: { timeout: 12000000 },

  // gasReporter: {
  //   enabled: process.env.REPORT_GAS ? true : false,
  // },

  namedAccounts: {
    deployer: 0,
  },

  paths: {
    deployments: `deployments/${packageJson.version}`,
  },
  abiExporter: {
    path: "./dist",
    runOnCompile: true,
    clear: true,
    flat: false,
    pretty: false,
  },
};

export default config;
