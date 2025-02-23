//SPDX-License-Identifier: MIT
/*
pragma solidity 0.8.19;

import "./BaseFeeOracle.sol";

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
}

contract BaseFeeOracleArb is BaseFeeOracle {

    ArbSys constant arbsys = ArbSys(address(100));

    constructor(address _admin, address _ultimateAdmin) 
        BaseFeeOracle(_admin, _ultimateAdmin) {
    }

    function feedBaseFeeValue(
        int256 _newValue,
        uint64 _blockNumber
    ) external override onlyRole(SETTER) {
        uint256 round = latestRound + 1;
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
}
*/
