import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { BorrowerOperationsLiquidationsTest } from "../../../typechain-types";
import { getSigners } from "../../utils";
import { expect } from "chai";
import timestring from "timestring";

const { latestBlock, increase } = time;

describe("Hedgehog Core Contracts Smoke tests", () => {
  context("Base functionality and Access Control. Flow #1", () => {
    let alice: SignerWithAddress;
    let liquidationTest;

    before(async () => {
      [, , , alice, ,] = await getSigners({
        fork: false,
        liquidationTest = await (
          await ethers.getContractFactory("BorrowerOperationsLiquidationsTest")
        ).deploy(),
      });
    });
  });
});
