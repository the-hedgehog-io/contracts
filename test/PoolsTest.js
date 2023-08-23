const StabilityPool = artifacts.require("./StabilityPool.sol");
const ActivePool = artifacts.require("./ActivePool.sol");
const DefaultPool = artifacts.require("./DefaultPool.sol");
const NonPayable = artifacts.require("./NonPayable.sol");

const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;

const _minus_1_Ether = web3.utils.toWei("-1", "ether");

contract("StabilityPool", async (accounts) => {
  /* mock* are EOA’s, temporarily used to call protected functions.
  TODO: Replace with mock contracts, and later complete transactions from EOA
  */
  let stabilityPool;

  const [owner, alice] = accounts;

  beforeEach(async () => {
    stabilityPool = await StabilityPool.new();
    const mockActivePoolAddress = (await NonPayable.new()).address;
    const dumbContractAddress = (await NonPayable.new()).address;
    await stabilityPool.setAddresses(
      dumbContractAddress,
      dumbContractAddress,
      mockActivePoolAddress,
      dumbContractAddress,
      dumbContractAddress,
      dumbContractAddress,
      dumbContractAddress
    );
  });

  it("getETH(): gets the recorded StETH balance", async () => {
    const recordedETHBalance = await stabilityPool.getETH();
    assert.equal(recordedETHBalance, 0);
  });

  it("getTotalBaseFeeLMADeposits(): gets the recorded BaseFeeLMA balance", async () => {
    const recordedETHBalance = await stabilityPool.getTotalBaseFeeLMADeposits();
    assert.equal(recordedETHBalance, 0);
  });
});

contract("ActivePool", async (accounts) => {
  let activePool, mockBorrowerOperations;

  const [owner, alice] = accounts;
  beforeEach(async () => {
    activePool = await ActivePool.new();
    mockBorrowerOperations = await NonPayable.new();
    const dumbContractAddress = (await NonPayable.new()).address;
    await activePool.setAddresses(
      mockBorrowerOperations.address,
      dumbContractAddress,
      dumbContractAddress,
      dumbContractAddress
    );
  });

  it("getETH(): gets the recorded StETH balance", async () => {
    const recordedETHBalance = await activePool.getETH();
    assert.equal(recordedETHBalance, 0);
  });

  it("getBaseFeeLMADebt(): gets the recorded BaseFeeLMA balance", async () => {
    const recordedETHBalance = await activePool.getBaseFeeLMADebt();
    assert.equal(recordedETHBalance, 0);
  });

  it("increaseBaseFeeLMA(): increases the recorded BaseFeeLMA balance by the correct amount", async () => {
    const recordedBaseFeeLMA_balanceBefore =
      await activePool.getBaseFeeLMADebt();
    assert.equal(recordedBaseFeeLMA_balanceBefore, 0);

    // await activePool.increaseBaseFeeLMADebt(100, { from: mockBorrowerOperationsAddress })
    const increaseBaseFeeLMADebtData = th.getTransactionData(
      "increaseBaseFeeLMADebt(uint256)",
      ["0x64"]
    );
    const tx = await mockBorrowerOperations.forward(
      activePool.address,
      increaseBaseFeeLMADebtData
    );
    assert.isTrue(tx.receipt.status);
    const recordedBaseFeeLMA_balanceAfter =
      await activePool.getBaseFeeLMADebt();
    assert.equal(recordedBaseFeeLMA_balanceAfter, 100);
  });
  // Decrease
  it("decreaseBaseFeeLMA(): decreases the recorded BaseFeeLMA balance by the correct amount", async () => {
    // start the pool on 100 wei
    //await activePool.increaseBaseFeeLMADebt(100, { from: mockBorrowerOperationsAddress })
    const increaseBaseFeeLMADebtData = th.getTransactionData(
      "increaseBaseFeeLMADebt(uint256)",
      ["0x64"]
    );
    const tx1 = await mockBorrowerOperations.forward(
      activePool.address,
      increaseBaseFeeLMADebtData
    );
    assert.isTrue(tx1.receipt.status);

    const recordedBaseFeeLMA_balanceBefore =
      await activePool.getBaseFeeLMADebt();
    assert.equal(recordedBaseFeeLMA_balanceBefore, 100);

    //await activePool.decreaseBaseFeeLMADebt(100, { from: mockBorrowerOperationsAddress })
    const decreaseBaseFeeLMADebtData = th.getTransactionData(
      "decreaseBaseFeeLMADebt(uint256)",
      ["0x64"]
    );
    const tx2 = await mockBorrowerOperations.forward(
      activePool.address,
      decreaseBaseFeeLMADebtData
    );
    assert.isTrue(tx2.receipt.status);
    const recordedBaseFeeLMA_balanceAfter =
      await activePool.getBaseFeeLMADebt();
    assert.equal(recordedBaseFeeLMA_balanceAfter, 0);
  });

  // send raw eth
  it("sendETH(): decreases the recorded StETH balance by the correct amount", async () => {
    // setup: give pool 2 eth
    const activePool_initialBalance = web3.utils.toBN(
      await web3.eth.getBalance(activePool.address)
    );
    assert.equal(activePool_initialBalance, 0);
    // start pool with 2 eth
    //await web3.eth.sendTransaction({ from: mockBorrowerOperationsAddress, to: activePool.address, value: dec(2, 'eth') })
    const tx1 = await mockBorrowerOperations.forward(activePool.address, "0x", {
      from: owner,
      value: dec(2, "ether"),
    });
    assert.isTrue(tx1.receipt.status);

    const activePool_BalanceBeforeTx = web3.utils.toBN(
      await web3.eth.getBalance(activePool.address)
    );
    const alice_Balance_BeforeTx = web3.utils.toBN(
      await web3.eth.getBalance(alice)
    );

    assert.equal(activePool_BalanceBeforeTx, dec(2, "ether"));

    // send eth from pool to alice
    //await activePool.sendETH(alice, dec(1, 'eth'), { from: mockBorrowerOperationsAddress })
    const sendETHData = th.getTransactionData("sendETH(address,uint256)", [
      alice,
      web3.utils.toHex(dec(1, "ether")),
    ]);
    const tx2 = await mockBorrowerOperations.forward(
      activePool.address,
      sendETHData,
      { from: owner }
    );
    assert.isTrue(tx2.receipt.status);

    const activePool_BalanceAfterTx = web3.utils.toBN(
      await web3.eth.getBalance(activePool.address)
    );
    const alice_Balance_AfterTx = web3.utils.toBN(
      await web3.eth.getBalance(alice)
    );

    const alice_BalanceChange = alice_Balance_AfterTx.sub(
      alice_Balance_BeforeTx
    );
    const pool_BalanceChange = activePool_BalanceAfterTx.sub(
      activePool_BalanceBeforeTx
    );
    assert.equal(alice_BalanceChange, dec(1, "ether"));
    assert.equal(pool_BalanceChange, _minus_1_Ether);
  });
});

contract("DefaultPool", async (accounts) => {
  let defaultPool, mockTroveManager, mockActivePool;

  const [owner, alice] = accounts;
  beforeEach(async () => {
    defaultPool = await DefaultPool.new();
    mockTroveManager = await NonPayable.new();
    mockActivePool = await NonPayable.new();
    await defaultPool.setAddresses(
      mockTroveManager.address,
      mockActivePool.address
    );
  });

  it("getETH(): gets the recorded BaseFeeLMA balance", async () => {
    const recordedETHBalance = await defaultPool.getETH();
    assert.equal(recordedETHBalance, 0);
  });

  it("getBaseFeeLMADebt(): gets the recorded BaseFeeLMA balance", async () => {
    const recordedETHBalance = await defaultPool.getBaseFeeLMADebt();
    assert.equal(recordedETHBalance, 0);
  });

  it("increaseBaseFeeLMA(): increases the recorded BaseFeeLMA balance by the correct amount", async () => {
    const recordedBaseFeeLMA_balanceBefore =
      await defaultPool.getBaseFeeLMADebt();
    assert.equal(recordedBaseFeeLMA_balanceBefore, 0);

    // await defaultPool.increaseBaseFeeLMADebt(100, { from: mockTroveManagerAddress })
    const increaseBaseFeeLMADebtData = th.getTransactionData(
      "increaseBaseFeeLMADebt(uint256)",
      ["0x64"]
    );
    const tx = await mockTroveManager.forward(
      defaultPool.address,
      increaseBaseFeeLMADebtData
    );
    assert.isTrue(tx.receipt.status);

    const recordedBaseFeeLMA_balanceAfter =
      await defaultPool.getBaseFeeLMADebt();
    assert.equal(recordedBaseFeeLMA_balanceAfter, 100);
  });

  it("decreaseBaseFeeLMA(): decreases the recorded BaseFeeLMA balance by the correct amount", async () => {
    // start the pool on 100 wei
    //await defaultPool.increaseBaseFeeLMADebt(100, { from: mockTroveManagerAddress })
    const increaseBaseFeeLMADebtData = th.getTransactionData(
      "increaseBaseFeeLMADebt(uint256)",
      ["0x64"]
    );
    const tx1 = await mockTroveManager.forward(
      defaultPool.address,
      increaseBaseFeeLMADebtData
    );
    assert.isTrue(tx1.receipt.status);

    const recordedBaseFeeLMA_balanceBefore =
      await defaultPool.getBaseFeeLMADebt();
    assert.equal(recordedBaseFeeLMA_balanceBefore, 100);

    // await defaultPool.decreaseBaseFeeLMADebt(100, { from: mockTroveManagerAddress })
    const decreaseBaseFeeLMADebtData = th.getTransactionData(
      "decreaseBaseFeeLMADebt(uint256)",
      ["0x64"]
    );
    const tx2 = await mockTroveManager.forward(
      defaultPool.address,
      decreaseBaseFeeLMADebtData
    );
    assert.isTrue(tx2.receipt.status);

    const recordedBaseFeeLMA_balanceAfter =
      await defaultPool.getBaseFeeLMADebt();
    assert.equal(recordedBaseFeeLMA_balanceAfter, 0);
  });

  // send raw eth
  it("sendETHToActivePool(): decreases the recorded StETH balance by the correct amount", async () => {
    // setup: give pool 2 eth
    const defaultPool_initialBalance = web3.utils.toBN(
      await web3.eth.getBalance(defaultPool.address)
    );
    assert.equal(defaultPool_initialBalance, 0);

    // start pool with 2 eth
    //await web3.eth.sendTransaction({ from: mockActivePool.address, to: defaultPool.address, value: dec(2, 'eth') })
    const tx1 = await mockActivePool.forward(defaultPool.address, "0x", {
      from: owner,
      value: dec(2, "ether"),
    });
    assert.isTrue(tx1.receipt.status);

    const defaultPool_BalanceBeforeTx = web3.utils.toBN(
      await web3.eth.getBalance(defaultPool.address)
    );
    const activePool_Balance_BeforeTx = web3.utils.toBN(
      await web3.eth.getBalance(mockActivePool.address)
    );

    assert.equal(defaultPool_BalanceBeforeTx, dec(2, "ether"));

    // send eth from pool to alice
    //await defaultPool.sendETHToActivePool(dec(1, 'eth'), { from: mockTroveManagerAddress })
    const sendETHData = th.getTransactionData("sendETHToActivePool(uint256)", [
      web3.utils.toHex(dec(1, "ether")),
    ]);
    await mockActivePool.setPayable(true);
    const tx2 = await mockTroveManager.forward(
      defaultPool.address,
      sendETHData,
      { from: owner }
    );
    assert.isTrue(tx2.receipt.status);

    const defaultPool_BalanceAfterTx = web3.utils.toBN(
      await web3.eth.getBalance(defaultPool.address)
    );
    const activePool_Balance_AfterTx = web3.utils.toBN(
      await web3.eth.getBalance(mockActivePool.address)
    );

    const activePool_BalanceChange = activePool_Balance_AfterTx.sub(
      activePool_Balance_BeforeTx
    );
    const defaultPool_BalanceChange = defaultPool_BalanceAfterTx.sub(
      defaultPool_BalanceBeforeTx
    );
    assert.equal(activePool_BalanceChange, dec(1, "ether"));
    assert.equal(defaultPool_BalanceChange, _minus_1_Ether);
  });
});

contract("Reset chain state", async (accounts) => {});
