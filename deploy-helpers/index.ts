import { ethers } from "hardhat";
import { DeploymentsExtension } from "hardhat-deploy/types";

export const createExecuteWithLog =
  (execute: DeploymentsExtension["execute"]) =>
  async (...args: Parameters<DeploymentsExtension["execute"]>) => {
    const [contractName, , methodName] = args;

    console.log(`executing "${contractName}.${methodName}"`);

    const receipt = await execute.apply(execute, args);

    console.log(
      `tx "${contractName}.${methodName}": ${receipt.transactionHash}`
    );

    return receipt;
  };

export const isOwnershipRenounced = async (contract: any) => {
  const contractFactory = await ethers.getContractAt(
    "OwnableContract",
    contract
  );
  const owner = await contractFactory.owner();

  return owner == ethers.ZeroAddress;
};

export const timeValues = {
  SECONDS_IN_ONE_MINUTE: 60,
  SECONDS_IN_ONE_HOUR: 60 * 60,
  SECONDS_IN_ONE_DAY: 60 * 60 * 24,
  SECONDS_IN_ONE_WEEK: 60 * 60 * 24 * 7,
  SECONDS_IN_SIX_WEEKS: 60 * 60 * 24 * 7 * 6,
  SECONDS_IN_ONE_MONTH: 60 * 60 * 24 * 30,
  SECONDS_IN_ONE_YEAR: 60 * 60 * 24 * 365,
  MINUTES_IN_ONE_WEEK: 60 * 24 * 7,
  MINUTES_IN_ONE_MONTH: 60 * 24 * 30,
  MINUTES_IN_ONE_YEAR: 60 * 24 * 365,
};
