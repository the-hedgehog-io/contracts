import {
  impersonateAccount,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { parseEther } from "ethers";

const { latestBlock } = time;

export const setupContractsForLiquid = async () => {
  const [deployer, setter, hacker, alice, bob, carol] = await getSigners({
    fork: false,
  });

  // const payToken = await ethers.getContractAt(
  //   "ERC20Mock",
  //   "0x5979D7b546E38E414F7E9822514be443A4800529" // WSTETH
  // );

  // DEPLOYMENT OF TEST TOKEN IN CASE OF TESTS ON A LOCAL NETWORK
  const payToken = await (
    await ethers.getContractFactory("ERC20Mock")
  ).deploy(
    "name",
    "symbol",
    deployer.address,
    ethers.parseEther("1000000000000000000000000000")
  );
  await payToken.transfer(
    setter.address,
    ethers.parseEther("100000000000000000000000000")
  );
  await payToken.transfer(
    hacker.address,
    ethers.parseEther("100000000000000000000000000")
  );
  await payToken.transfer(
    alice.address,
    ethers.parseEther("100000000000000000000000000")
  );
  await payToken.transfer(
    bob.address,
    ethers.parseEther("100000000000000000000000000")
  );

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
    await (await ethers.getContractFactory("PriceFeed"))
      .connect(deployer)
      .deploy(50)
  ).waitForDeployment();

  const sortedTroves = await (
    await (await ethers.getContractFactory("SortedTroves"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const troveManager = await (
    await (await ethers.getContractFactory("TroveManager"))
      .connect(deployer)
      .deploy(0)
  ).waitForDeployment();

  const activePool = await (
    await (await ethers.getContractFactory("ActivePool"))
      .connect(deployer)
      .deploy()
  ).waitForDeployment();

  const stabilityPool = await (
    await (await ethers.getContractFactory("StabilityPool"))
      .connect(deployer)
      .deploy()
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
    await (
      await ethers.getContractFactory("BorrowerOperationsLiquidationsTest")
    )
      .connect(deployer)
      .deploy(activePool.target, payToken.target)
  ).waitForDeployment();

  const hintHelpers = await (
    await (await ethers.getContractFactory("HintHelpers"))
      .connect(deployer)
      .deploy()
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

  const hogToken = await (
    await (await ethers.getContractFactory("HOGToken"))
      .connect(deployer)
      .deploy(deployer.address)
  ).waitForDeployment();

  for (let i = 0; i <= 100; i = i + 5) {
    await feesRouter
      .connect(deployer)
      .setFeeConfigs(
        i,
        34,
        33,
        33,
        carol.address,
        carol.address,
        carol.address
      );
  }

  const maxBytes32 = "0x" + "f".repeat(64);

  await priceFeed
    .connect(deployer)
    .setAddresses(mainOracle.target, secondaryOracle.target);

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

  await communityIssuance
    .connect(deployer)
    .setAddresses(
      await hogToken.getAddress(),
      await stabilityPool.getAddress(),
      deployer.address,
      deployer.address
    );
  await feesRouter
    .connect(deployer)
    .setAddresses(
      await activePool.getAddress(),
      await baseFeeLMAToken.getAddress(),
      await borrowerOperations.getAddress(),
      await troveManager.getAddress()
    );

  return {
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
    hogToken,
    payToken,
    mainOracle,
    secondaryOracle,
    feesRouter,
  } as const;
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
    dave: SignerWithAddress,
    eric: SignerWithAddress;
  if (fork) {
    const deployerAddress = "0xbb0b4642492b275f154e415fc52dacc931103fd9";
    const setterAddress = "0xd26d87bcd992d89954fb33ce316e1b9acab30ed5";
    const hackerAddress = "0xcef9cdd466d03a1cedf57e014d8f6bdc87872189";
    const aliceAddress = "0x12723917e1437a5a08f887f8765130db8814ecb3";
    const bobAddress = "0x9be9cd9c9b2dc0a7b47478e4ba14b08b1f640cc7";
    const carolAddress = "0x36a5732960513ad26a99e2bd6159dff2ab94a678";
    const daveAddress = "0x59a661f1c909ca13ba3e9114bfdd81e5a420705d";

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
