// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

interface IBaseFeeOracle {
    function decimals() external view returns (uint8);

    function version() external view returns (uint256);

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    // which could be misinterpreted as actual reported values.
    function getRoundData(
        uint256 _roundId
    )
        external
        view
        returns (
            uint256 roundId,
            int256 answer,
            uint256 blockNumber,
            uint256 currentChainBN,
            uint256 __roundId
        );

    function latestRoundData()
        external
        view
        returns (
            uint256 roundId,
            int256 answer,
            uint256 blockNumber,
            uint256 currentChainBN,
            uint256 __roundId
        );
}
