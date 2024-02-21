import {
  impersonateAccount,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { parseEther } from "ethers";

const { latestBlock } = time;

export const setupContracts = async () => {
  const [deployer, setter, hacker, alice, bob, carol] = await getSigners({
    fork: true,
  });

  const payToken = await ethers.getContractAt(
    "ERC20Mock",
    "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb"
  );

  // console.log(
  //   "balance at deply: ",
  //   await payToken.balanceOf(bob.address),
  //   bob.address
  // );

  // DEPLOYMENT OF TEST TOKEN IN CASE OF TESTS ON A LOCAL NETWORK
  // const payToken = await (
  //   await ethers.getContractFactory("ERC20Mock")
  // ).deploy("name", "symbol", deployer.address, ethers.parseEther("1000000000"));
  // await payToken.transfer(hacker.address, ethers.parseEther("10000"));
  // await payToken.transfer(alice.address, ethers.parseEther("10000"));
  // await payToken.transfer(bob.address, ethers.parseEther("10000"));
  // await payToken.transfer(carol.address, ethers.parseEther("10000"));

  const mainOracle = await (
    await (await ethers.getContractFactory("BaseFeeOracle"))
      .connect(deployer)
      .deploy(deployer.address, deployer.address)
  ).waitForDeployment();

  const secondaryOracle = await (
    await (await ethers.getContractFactory("BaseFeeOracle"))
      .connect(deployer)
      .deploy(deployer.address, deployer.address)
  ).waitForDeployment();

  await mainOracle
    .connect(deployer)
    .feedBaseFeeValue("28000000000", await latestBlock());
  await secondaryOracle
    .connect(deployer)
    .feedBaseFeeValue("28000000000", await latestBlock());
  await mainOracle
    .connect(deployer)
    .feedBaseFeeValue("29000000000", await latestBlock());
  await secondaryOracle
    .connect(deployer)
    .feedBaseFeeValue("29000000000", await latestBlock());
  await mainOracle
    .connect(deployer)
    .feedBaseFeeValue("30000000000", await latestBlock());
  await secondaryOracle
    .connect(deployer)
    .feedBaseFeeValue("30000000000", await latestBlock());

  const priceFeed = await (
    await (await ethers.getContractFactory("TestPriceFeed"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const sortedTroves = await (
    await (await ethers.getContractFactory("SortedTroves"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const troveManager = await (
    await (await ethers.getContractFactory("TroveManager"))
      .connect(deployer)
      .deploy("50000", "50000")
  ).waitForDeployment();

  const activePool = await (
    await (await ethers.getContractFactory("ActivePool"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const stabilityPool = await (
    await (await ethers.getContractFactory("StabilityPool"))
      .connect(deployer)
      .deploy("50000", "50000")
  ).waitForDeployment();

  const defaultPool = await (
    await (await ethers.getContractFactory("DefaultPool"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const gasPool = await (
    await (await ethers.getContractFactory("GasPool"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const collSurplusPool = await (
    await (await ethers.getContractFactory("CollSurplusPool"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const borrowerOperations = await (
    await (await ethers.getContractFactory("BorrowerOperations"))
      .connect(deployer)
      .deploy("50000", "50000")
  ).waitForDeployment();

  const hintHelpers = await (
    await (await ethers.getContractFactory("HintHelpers"))
      .connect(deployer)
      .deploy("50000", "50000")
  ).waitForDeployment();

  const feesRouter = await (
    await (await ethers.getContractFactory("FeesRouter"))
      .connect(deployer)
      .deploy(deployer.address, deployer.address)
  ).waitForDeployment();

  const baseFeeLMAToken = await (
    await (await ethers.getContractFactory("BaseFeeLMAToken"))
      .connect(deployer)
      .deploy(
        await troveManager.getAddress(),
        await stabilityPool.getAddress(),
        await borrowerOperations.getAddress(),
        await feesRouter.getAddress()
      )
  ).waitForDeployment();

  const communityIssuance = await (
    await (await ethers.getContractFactory("CommunityIssuance"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const lockupContractFactory = await (
    await (await ethers.getContractFactory("LockupContractFactory"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const hogToken = await (
    await (await ethers.getContractFactory("HOGToken"))
      .connect(deployer)
      .deploy(await communityIssuance.getAddress(), deployer.address)
  ).waitForDeployment();

  for (let i = 0; i < 100; i = i + 5) {
    await feesRouter
      .connect(deployer)
      .setFeeConfigs(
        i,
        100,
        0,
        0,
        setter.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
  }

  const maxBytes32 = "0x" + "f".repeat(64);

  await priceFeed
    .connect(deployer)
    .setAddresses(
      await mainOracle.getAddress(),
      await secondaryOracle.getAddress()
    );

  await sortedTroves
    .connect(deployer)
    .setParams(
      maxBytes32,
      await troveManager.getAddress(),
      await borrowerOperations.getAddress()
    );

  await troveManager
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      await activePool.getAddress(),
      await defaultPool.getAddress(),
      await stabilityPool.getAddress(),
      await gasPool.getAddress(),
      await collSurplusPool.getAddress(),
      await priceFeed.getAddress(),
      await baseFeeLMAToken.getAddress(),
      await sortedTroves.getAddress(),
      await hogToken.getAddress(),
      await feesRouter.getAddress()
    );

  await borrowerOperations
    .connect(deployer)
    .setAddresses(
      await troveManager.getAddress(),
      await activePool.getAddress(),
      await defaultPool.getAddress(),
      await stabilityPool.getAddress(),
      await gasPool.getAddress(),
      await collSurplusPool.getAddress(),
      await priceFeed.getAddress(),
      await sortedTroves.getAddress(),
      await baseFeeLMAToken.getAddress(),
      await payToken.getAddress(),
      await feesRouter.getAddress()
    );

  await stabilityPool
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
      await activePool.getAddress(),
      await baseFeeLMAToken.getAddress(),
      await sortedTroves.getAddress(),
      await priceFeed.getAddress(),
      await communityIssuance.getAddress(),
      await payToken.getAddress()
    );

  await activePool
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
      await stabilityPool.getAddress(),
      await defaultPool.getAddress(),
      await payToken.getAddress(),
      await feesRouter.getAddress()
    );

  await defaultPool
    .connect(deployer)
    .setAddresses(
      await troveManager.getAddress(),
      await activePool.getAddress(),
      await payToken.getAddress()
    );

  await collSurplusPool
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
      await activePool.getAddress(),
      await payToken.getAddress()
    );

  await hintHelpers
    .connect(deployer)
    .setAddresses(
      await sortedTroves.getAddress(),
      await troveManager.getAddress()
    );

  await lockupContractFactory
    .connect(deployer)
    .setHOGTokenAddress(await hogToken.getAddress());

  await communityIssuance
    .connect(deployer)
    .setAddresses(
      await hogToken.getAddress(),
      await stabilityPool.getAddress()
    );
  await feesRouter
    .connect(deployer)
    .setAddresses(
      await activePool.getAddress(),
      await baseFeeLMAToken.getAddress(),
      await borrowerOperations.getAddress(),
      await troveManager.getAddress()
    );

  return [
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
    lockupContractFactory,
    hogToken,
    payToken,
    mainOracle,
    secondaryOracle,
  ] as const;
};

export const etheredValue = (value: string | number) => {
  return ethers.parseEther(
    typeof value === "number" ? value.toString() : value
  );
};

export const getSigners = async ({ fork }: { fork?: boolean } = {}) => {
  let deployer: SignerWithAddress, //ultimate admin
    setter: SignerWithAddress,
    hacker: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    carol: SignerWithAddress,
    dave: SignerWithAddress;
  if (fork) {
    const deployerAddress = "0x63f6D9E7d3953106bCaf98832BD9C88A54AfCc9D";
    const setterAddress = "0x63f6D9E7d3953106bCaf98832BD9C88A54AfCc9D";
    const hackerAddress = "0xe944646Bb5F26B0d058C736638F5387F882Bf30a";
    const aliceAddress = "0xdD06d01966688B4efBe18d789e8E1DDBa7Bc31F8";
    const bobAddress = "0x5a60d345FB510A6Cc230Febc83C7Ff7016eCa0bf";
    const carolAddress = "0x6C413690c19CFC80c3db3211c80993BF642C6456";
    const daveAddress = "0xbb0b4642492b275F154e415fc52Dacc931103fD9";

    const [ethGiver] = await ethers.getSigners();

    await impersonateAccount(deployerAddress);
    deployer = await ethers.getImpersonatedSigner(deployerAddress);
    setter = await ethers.getImpersonatedSigner(setterAddress);

    await impersonateAccount(hackerAddress);
    hacker = await ethers.getImpersonatedSigner(hackerAddress);

    await impersonateAccount(aliceAddress);
    alice = await ethers.getImpersonatedSigner(aliceAddress);
    await impersonateAccount(bobAddress);
    bob = await ethers.getImpersonatedSigner(bobAddress);

    await impersonateAccount(carolAddress);
    carol = await ethers.getImpersonatedSigner(carolAddress);
    await impersonateAccount(daveAddress);
    dave = await ethers.getImpersonatedSigner(daveAddress);

    await ethGiver.sendTransaction({
      to: deployer.address,
      value: parseEther("25"),
    });
    await ethGiver.sendTransaction({
      to: setter.address,
      value: parseEther("25"),
    });
    await ethGiver.sendTransaction({
      to: hacker.address,
      value: parseEther("25"),
    });
    await ethGiver.sendTransaction({
      to: alice.address,
      value: parseEther("25"),
    });
    await ethGiver.sendTransaction({
      to: bob.address,
      value: parseEther("25"),
    });
    await ethGiver.sendTransaction({
      to: carol.address,
      value: parseEther("25"),
    });
    await ethGiver.sendTransaction({
      to: dave.address,
      value: parseEther("25"),
    });
  } else {
    [deployer, setter, hacker, alice, bob, carol, dave] =
      await ethers.getSigners();
  }
  return [deployer, setter, hacker, alice, bob, carol, dave] as const;
};
