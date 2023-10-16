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
