import { time, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  ActivePool,
  BaseFeeLMAToken,
  BaseFeeOracle,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  HintHelpers,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManager,
} from "../../../typechain-types/contracts";
import { etheredValue, setupContracts } from "../../utils";
import { Contract } from "hardhat/internal/hardhat-network/stack-traces/model";
import {
  CommunityIssuance,
  ERC20Mock,
  HOGStaking,
  HOGToken,
  LockupContractFactory,
} from "../../../typechain-types";

const { latestBlock } = time;

describe("BaseFeeOracle Tests", () => {
  context("Base functionality and Access Control", () => {
    let deployer: SignerWithAddress, //ultimate admin
      setter: SignerWithAddress,
      hacker: SignerWithAddress,
      alice: SignerWithAddress,
      bob: SignerWithAddress,
      carol: SignerWithAddress;
    let oracle: BaseFeeOracle;
    let priceFeed: PriceFeed;
    let sortedTroves: SortedTroves;
    let troveManager: TroveManager;
    let activePool: ActivePool;
    let stabilityPool: StabilityPool;
    let defaultPool: DefaultPool;
    let gasPool: any;
    let collSurplusPool: CollSurplusPool;
    let borrowerOperations: BorrowerOperations;
    let hintHelpers: HintHelpers;
    let baseFeeLMAToken: BaseFeeLMAToken;
    let communityIssuance: CommunityIssuance;
    let hogStaking: HOGStaking;
    let lockupContractFactory: LockupContractFactory;
    let hogToken: HOGToken;
    let payToken: ERC20Mock;
    before(async () => {
      [deployer, setter, hacker, alice, bob, carol] = await ethers.getSigners();
      oracle = await (
        await (
          await ethers.getContractFactory("BaseFeeOracle")
        ).deploy(setter.address, deployer.address)
      ).waitForDeployment();

      const [
        priceFeed,
        sortedTroves,
        troveManager,
        activePool,
        stabilityPool,
        defaultPool,
        gasPool,
        collSurplusPool,
        borrowerOperations,
        hintHelpers,
        baseFeeLMAToken,
        communityIssuance,
        hogStaking,
        lockupContractFactory,
        hogToken,
        payToken,
      ] = await setupContracts();
    });

    let currentRoundAndValue: number = 1;

    it("Should let admin feed new base fee value", async () => {
      console.log();
    });
  });
});
