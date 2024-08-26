import { ethers } from "hardhat";
import { BaseFeeOracle } from "../../../../typechain-types";
import { TestPriceFeed } from "../../../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { latestBlock } = time;

export const setNewParamsToBaseFee = async ({
  mainOracle,
  secondaryOracle,
  priceFeed,
}: {
  mainOracle: BaseFeeOracle;
  secondaryOracle: BaseFeeOracle;
  priceFeed: TestPriceFeed;
}) => {
  const setNewBaseFeePrice = async (_amount: number) => {
    const amount = ethers.parseUnits(_amount.toString(), "gwei");
    const block = await latestBlock();
    await mainOracle.feedBaseFeeValue(amount, block);
    await secondaryOracle.feedBaseFeeValue(amount, block);
    await priceFeed.fetchPrice();
  };
  return { setNewBaseFeePrice };
};
