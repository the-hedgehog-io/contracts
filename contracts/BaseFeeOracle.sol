//SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IBaseFeeOracle.sol";

error OutdatedRequest();

/**
 * HEDGEHOG UPDATES:
 * @notice Completely new contract in Hedgehog Protocol, that was never a part of Liquity Protocol
 *
 * A custom oracle that's used to feed real world (LogMA50(BaseFeePerGas) * WstETH / ETH ratio) value to the system onchain
 * A user with SETTER rights is able to update the responseById mapping via feedBaseFeeValue method
 * A user with ULTIMATE_ADMIN rights may update SETTER users
 */

contract BaseFeeOracle is AccessControl, IBaseFeeOracle {
    struct Response {
        int256 answer; // LogMA50(BaseFeePerGas) * WstETH / ETH ratio in wei
        uint256 blockNumber; // L1 block number from which the last BaseFeePerGas value was retrieved
        uint256 currentChainBN; // Current network's block number during which structure was updated
        uint256 roundId; // Round during which the structure was updated
    }

    mapping(uint256 => Response) public responseById;
    uint256 public latestRound;

    bytes32 internal constant SETTER = keccak256("SETTER");
    bytes32 internal constant ULTIMATE_ADMIN = keccak256("ULTIMATE_ADMIN");

    uint256 public constant version = 1;
    uint8 public constant decimals = 18;

    event BaseFeeSet(int256 newValue, uint256 roundId, uint256 blockNumber);

    constructor(address _admin, address _ultimateAdmin) {
        _grantRole(ULTIMATE_ADMIN, _ultimateAdmin);
        _setRoleAdmin(SETTER, ULTIMATE_ADMIN);
        _grantRole(SETTER, _admin);
    }

    /**
     * Updated responseById mapping with a new structure that holds BaseFeePerGas value
     *
     * @param _newValue New LogMA50(BaseFeePerGas) * (WstETH / ETH ratio) value in wei
     * @param _blockNumber Block number from L1 at which value get's submitted
     */
    function feedBaseFeeValue(
        int256 _newValue,
        uint64 _blockNumber
    ) external onlyRole(SETTER) {
        uint256 round = latestRound + 1;
        (, , uint256 blockNumber, , ) = getRoundData(round - 1);

        if (_blockNumber <= blockNumber) {
            revert OutdatedRequest();
        }
        responseById[round] = Response({
            answer: _newValue,
            blockNumber: _blockNumber,
            currentChainBN: block.number,
            roundId: round
        });

        latestRound++;

        emit BaseFeeSet(_newValue, round, block.number);
    }

    /**
     *  Returns a Response structure that contains a LogMA50(BaseFeePerGas) * WstETH / ETH ratio among it
     *
     * @param _roundId update round that holds the Response structure
     */
    function getRoundData(
        uint256 _roundId
    ) public view returns (uint256, int256, uint256, uint256, uint256) {
        Response memory response = responseById[_roundId];
        return (
            response.roundId, // Round during which the structure was updated
            response.answer, // LogMA50(BaseFeePerGas) * WstETH / ETH ratio in wei
            response.blockNumber, // L1 block number from which the last BaseFeePerGas value was retrieved
            response.currentChainBN, // Current network's block.number during which structure was updated
            response.roundId // Round during which the structure was update. Keeping that to be compatibale with Chainlink's API
        );
    }

    /**
     * Returns the latest round Response structure that contains a LogMA50(BaseFeePerGas) * WstETH / ETH ratio among it
     */
    function latestRoundData()
        external
        view
        returns (uint256, int256, uint256, uint256, uint256)
    {
        return getRoundData(latestRound);
    }
}
