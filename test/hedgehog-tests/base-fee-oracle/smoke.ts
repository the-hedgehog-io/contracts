import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BaseFeeOracle } from "../../../typechain-types";
import { etheredValue } from "../../utils";

const { latestBlock } = time;

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control", () => {
    let deployer: SignerWithAddress, //ultimate admin
      setter: SignerWithAddress,
      hacker: SignerWithAddress;
    let oracle: BaseFeeOracle;
    before(async () => {
      [deployer, setter, hacker] = await ethers.getSigners();
      oracle = await (
        await (
          await ethers.getContractFactory("BaseFeeOracle")
        ).deploy(setter.address, deployer.address)
      ).waitForDeployment();
    });

    let currentRoundAndValue: number = 1;

    const feed = async ({
      value = currentRoundAndValue,
      customBlock = 0,
      caller = setter,
    } = {}) => {
      const block = customBlock !== 0 ? customBlock : (await latestBlock()) + 3;

      await oracle.connect(caller).feedBaseFeeValue(etheredValue(value), block);
      currentRoundAndValue++;
    };

    const round = async (roundId: number) => {
      const [answer, block, round] = await oracle.getRoundData(roundId);

      return { answer, block, round };
    };

    const latestRound = async () => {
      const [answer, block, round] = await oracle.latestRoundData();

      return { answer, block, round };
    };

    it("should let admin feed new base fee value", async () => {
      expect(await feed()).not.to.be.reverted;
    });
    it("should retrieve correct round", async () => {
      const blockNumber = (await latestBlock()) + 5;
      expect(await feed({ customBlock: blockNumber })).not.to.be.reverted;

      expect(
        (await latestRound()).block,
        "Block number is incorrect"
      ).to.be.equal(blockNumber);
      expect(
        (await latestRound()).round,
        "Round number is incorrect"
      ).to.be.equal(186391447); // 3 for local network
    });
    it("should set answer correctly", async () => {
      expect(
        (await latestRound()).answer,
        "Answer number is incorrect"
      ).to.be.equal(etheredValue(2));
    });
    it("should not let non-admin feed new base fee value", async () => {
      await expect(feed({ caller: hacker })).to.be.revertedWith(
        `AccessControl: account ${hacker.address.toLowerCase()} is missing role ${ethers.solidityPackedKeccak256(
          ["string"],
          ["SETTER"]
        )}`
      );
    });
    it("should not let ultimate admin feed new base fee value", async () => {
      await expect(feed({ caller: deployer })).to.be.revertedWith(
        `AccessControl: account ${deployer.address.toLowerCase()} is missing role ${ethers.solidityPackedKeccak256(
          ["string"],
          ["SETTER"]
        )}`
      );
    });
    it("should set new fed value into a new round", async () => {
      const customValue = 228;
      expect((await latestRound()).answer).not.to.be.equal(
        etheredValue(customValue)
      );

      // expect(await feed({ value: customValue })).not.to.be.reverted;
      await feed({ value: customValue });

      expect((await latestRound()).answer).to.be.equal(
        etheredValue(customValue)
      );
    });

    it("should return latest round data on latestRoundData call", async () => {
      expect(await oracle.latestRound()).to.be.equal(currentRoundAndValue - 1);
    });
    it("should set correct latest round upon each feed", async () => {
      const currentRound = currentRoundAndValue;

      expect(await oracle.latestRound()).to.be.equal(currentRound - 1);
      await feed();
      expect(await oracle.latestRound()).to.be.equal(currentRound);
    });
  });
});
