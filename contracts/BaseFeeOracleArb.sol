//SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
}

error OutdatedRequest();

contract BaseFeeOracleArb is AccessControl {
    struct Response {
        int256 answer;
        uint256 blockNumber;
        uint256 currentChainBN;
        uint80 roundId;
    }

    mapping(uint256 => Response) public responseById;
    uint80 public latestRound;

    bytes32 internal constant SETTER = keccak256("SETTER");
    bytes32 internal constant ULTIMATE_ADMIN = keccak256("ULTIMATE_ADMIN");

    uint256 public constant decimals = 18;

    event BaseFeeSet(int256 newValue, uint80 roundId, uint256 blockNumber);

    ArbSys constant arbsys = ArbSys(address(100));

    constructor(address _admin, address _ultimateAdmin) {
        _grantRole(ULTIMATE_ADMIN, _ultimateAdmin);
        _setRoleAdmin(SETTER, ULTIMATE_ADMIN);
        _grantRole(SETTER, _admin);
    }

    function feedBaseFeeValue(
        int256 _newValue,
        uint64 _blockNumber
    ) external onlyRole(SETTER) {
        uint80 round = latestRound + 1;
        (, , uint256 blockNumber, , ) = getRoundData(latestRound);

        if (_blockNumber <= blockNumber) {
            revert OutdatedRequest();
        }
        responseById[round] = Response({
            answer: _newValue,
            blockNumber: _blockNumber,
            currentChainBN: arbsys.arbBlockNumber(),
            roundId: round
        });

        latestRound++;

        emit BaseFeeSet(_newValue, round, arbsys.arbBlockNumber());
    }

    function getRoundData(
        uint80 _roundId
    ) public view returns (uint80, int256, uint256, uint256, uint80) {
        Response memory response = responseById[_roundId];
        return (
            response.roundId,
            response.answer,
            response.blockNumber,
            response.currentChainBN,
            response.roundId
        );
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return getRoundData(latestRound);
    }
}
