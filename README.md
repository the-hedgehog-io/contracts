# Hedgehog Protocol Contracts

Hedgehog Protocol is decentralized protocol that allows users to mint a BaseFeeLMA token - a derivative tied to a 50-Steps Logarithmic MA
price of a BaseFee on Ethereum Mainnet.
V1 is based on Liquity Protocol (https://github.com/liquity/dev) and contracts logic mostly remains unchanged.
However, there are some breaking changes implemented by Hedgehog Protocol's team:

- Borrowing and Redemption Fees are now separate entities and logic of their calculation is changed
- Collateral that is used to open a position in the system is now an ERC20 token instead of a native one
- Frontend's incentive functionality remains unchanged
- Changes to Protocols token (16.10.2023: STILL TO BE ADDED)
- Most of variables and functions are renamed
- Pragma's risen to 0.8.19
- Price Feed contract contains few minor changes to the oracle routing logic
- Completely new contract Fees Router is added that distributes dynamic fees
- Some constants values are updated

## Verifying integrity of the Liquity Fork with raised pragma and updated variable names

Code with just 2 breaking changes: Variables and Functions renames and raised pragma(with incurred minor syntax updates) can be found in liquity-to-hog-transit branch.
Tests that are stored in "test" are fully functional and few bugs found in Liquity protocol tests additionally fixed.
It can be verified that function renames and pragma raise didn't break the contract.

## Breaking Changes implemented by Hedgehog team

In the main branch latest version of contracts can be found.
At 0.2.5 version there still some minor changes expected to constants values and more tests are to be added by the team with possible minor corrections.
Moreover, updates to the protocols token are incoming as well, but they are not expected to bring logic updates.

## Setup Environment

Repo was used with node@20.11.1
If you use volta, it is already pinned in the package.json

```bash
npm i
npx hardhat compile
```

## Running tests

Currently there are written 4 smoke tests with different scenarios of participating in the system and additional Fees Router Test that
tests FeesRouter contract.
Tests are performed in hardhat environment with a forked optimism mainnet.
There is no need to update hardhat config with your own API keys - forked tests are running with a public rpc.
There is no need to update .env file to run tests

```bash
npm i
npx hardhat test
```

## Deploy

### Environment Variables

- Copy .env.example and rename into .env
- Add your private key and public address to the .env file

### Fill in the config

Fill in config in the /deploy-helpers/deployConfig.ts with your own contracts

- wstETH: address of the wstETH token on selected chain
- multisigAddress: address of the account that received minted hog tokens
- mainOracle: address of the preferred oracle contract
- backupOracle: address of the preferred mainnet
- gasComp: amount of GAS_COMPENSATION variable in HedgehogBase contract
- minNetDebt: amount of MIN_NET_DEBT variable in HedgehogBase

### Running deployment flow

Update hardhat.config.ts with a network you'd like to deploy contracts to.
Currently there are options to deploy to optimism testnet and optimism mainnet.

Note: if you wish to run ABI exporting scripts after making any changes to ABI - it's better to increase version in package.json

```bash
npx hardhat deploy --network {yourNetworkName}
```

### Exporting ABI

```bash
npx hardhat deploy:export
```
