const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const assertRevert = th.assertRevert;
const toBN = th.toBN;
const dec = th.dec;

contract(
  "Deploying the HOG contracts: LCF, CI, HOGStaking, and HOGToken ",
  async (accounts) => {
    const [liquityAG, A, B] = accounts;
    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(
      997,
      1000
    );

    let HOGContracts;

    const oneMillion = toBN(1000000);
    const digits = toBN(1e18);
    const thirtyTwo = toBN(32);
    const expectedCISupplyCap = thirtyTwo.mul(oneMillion).mul(digits);

    beforeEach(async () => {
      // Deploy all contracts from the first account
      HOGContracts = await deploymentHelper.deployHOGContracts(
        bountyAddress,
        lpRewardsAddress,
        multisig
      );
      await deploymentHelper.connectHOGContracts(HOGContracts);

      hogStaking = HOGContracts.hogStaking;
      hogToken = HOGContracts.hogToken;
      communityIssuance = HOGContracts.communityIssuance;
      lockupContractFactory = HOGContracts.lockupContractFactory;

      //HOG Staking and CommunityIssuance have not yet had their setters called, so are not yet
      // connected to the rest of the system
    });

    describe("CommunityIssuance deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await communityIssuance.owner();

        assert.equal(liquityAG, storedDeployerAddress);
      });
    });

    describe("HOGStaking deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await hogStaking.owner();

        assert.equal(liquityAG, storedDeployerAddress);
      });
    });

    describe("HOGToken deployment", async (accounts) => {
      it("Stores the multisig's address", async () => {
        const storedMultisigAddress = await hogToken.multisigAddress();

        assert.equal(multisig, storedMultisigAddress);
      });

      it("Stores the CommunityIssuance address", async () => {
        const storedCIAddress = await hogToken.communityIssuanceAddress();

        assert.equal(communityIssuance.address, storedCIAddress);
      });

      it("Stores the LockupContractFactory address", async () => {
        const storedLCFAddress = await hogToken.lockupContractFactory();

        assert.equal(lockupContractFactory.address, storedLCFAddress);
      });

      it("Mints the correct HOG amount to the multisig's address: (64.66 million)", async () => {
        const multisigHOGEntitlement = await hogToken.balanceOf(multisig);

        const twentyThreeSixes = "6".repeat(23);
        const expectedMultisigEntitlement = "64"
          .concat(twentyThreeSixes)
          .concat("7");
        assert.equal(multisigHOGEntitlement, expectedMultisigEntitlement);
      });

      it("Mints the correct HOG amount to the CommunityIssuance contract address: 32 million", async () => {
        const communityHOGEntitlement = await hogToken.balanceOf(
          communityIssuance.address
        );
        // 32 million as 18-digit decimal
        const _32Million = dec(32, 24);

        assert.equal(communityHOGEntitlement, _32Million);
      });

      it("Mints the correct HOG amount to the bountyAddress EOA: 2 million", async () => {
        const bountyAddressBal = await hogToken.balanceOf(bountyAddress);
        // 2 million as 18-digit decimal
        const _2Million = dec(2, 24);

        assert.equal(bountyAddressBal, _2Million);
      });

      it("Mints the correct HOG amount to the lpRewardsAddress EOA: 1.33 million", async () => {
        const lpRewardsAddressBal = await hogToken.balanceOf(lpRewardsAddress);
        // 1.3 million as 18-digit decimal
        const _1pt33Million = "1".concat("3".repeat(24));

        assert.equal(lpRewardsAddressBal, _1pt33Million);
      });
    });

    describe("Community Issuance deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await communityIssuance.owner();

        assert.equal(storedDeployerAddress, liquityAG);
      });

      it("Has a supply cap of 32 million", async () => {
        const supplyCap = await communityIssuance.HOGSupplyCap();

        assert.isTrue(expectedCISupplyCap.eq(supplyCap));
      });

      it("Liquity AG can set addresses if CI's HOG balance is equal or greater than 32 million ", async () => {
        const HOGBalance = await hogToken.balanceOf(communityIssuance.address);
        assert.isTrue(HOGBalance.eq(expectedCISupplyCap));

        // Deploy core contracts, just to get the Stability Pool address
        const coreContracts = await deploymentHelper.deployLiquityCore();

        const tx = await communityIssuance.setAddresses(
          hogToken.address,
          coreContracts.stabilityPool.address,
          { from: liquityAG }
        );
        assert.isTrue(tx.receipt.status);
      });

      it("Liquity AG can't set addresses if CI's HOG balance is < 32 million ", async () => {
        const newCI = await CommunityIssuance.new();

        const HOGBalance = await hogToken.balanceOf(newCI.address);
        assert.equal(HOGBalance, "0");

        // Deploy core contracts, just to get the Stability Pool address
        const coreContracts = await deploymentHelper.deployLiquityCore();

        await th.fastForwardTime(
          timeValues.SECONDS_IN_ONE_YEAR,
          web3.currentProvider
        );
        await hogToken.transfer(newCI.address, "31999999999999999999999999", {
          from: multisig,
        }); // 1e-18 less than CI expects (32 million)

        try {
          const tx = await newCI.setAddresses(
            hogToken.address,
            coreContracts.stabilityPool.address,
            { from: liquityAG }
          );

          // Check it gives the expected error message for a failed Solidity 'assert'
        } catch (err) {
          console.log(err.message);
          // HEDGEHOG CHANGES: Updated error name as >0.8 pragma does not return "invalid opcode" anymore
          assert.include(err.message, "CI: Ballance is not enough");
        }
      });
    });

    describe("Connecting HOGToken to LCF, CI and HOGStaking", async (accounts) => {
      it("sets the correct HOGToken address in HOGStaking", async () => {
        // Deploy core contracts and set the HOGToken address in the CI and HOGStaking
        const coreContracts = await deploymentHelper.deployLiquityCore();
        await deploymentHelper.connectHOGContractsToCore(
          HOGContracts,
          coreContracts
        );

        const hogTokenAddress = hogToken.address;

        const recordedHOGTokenAddress = await hogStaking.hogToken();
        assert.equal(hogTokenAddress, recordedHOGTokenAddress);
      });

      it("sets the correct HOGToken address in LockupContractFactory", async () => {
        const hogTokenAddress = hogToken.address;

        const recordedHOGTokenAddress =
          await lockupContractFactory.hogTokenAddress();
        assert.equal(hogTokenAddress, recordedHOGTokenAddress);
      });

      it("sets the correct HOGToken address in CommunityIssuance", async () => {
        // Deploy core contracts and set the HOGToken address in the CI and HOGStaking
        const coreContracts = await deploymentHelper.deployLiquityCore();
        await deploymentHelper.connectHOGContractsToCore(
          HOGContracts,
          coreContracts
        );

        const hogTokenAddress = hogToken.address;

        const recordedHOGTokenAddress = await communityIssuance.hogToken();
        assert.equal(hogTokenAddress, recordedHOGTokenAddress);
      });
    });
  }
);
