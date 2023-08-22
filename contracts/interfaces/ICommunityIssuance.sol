// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

interface ICommunityIssuance {
    // --- Events ---

    event HOGTokenAddressSet(address _hogTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalHOGIssuedUpdated(uint _totalHOGIssued);

    // --- Functions ---

    function setAddresses(
        address _hogTokenAddress,
        address _stabilityPoolAddress
    ) external;

    function issueHOG() external returns (uint);

    function sendHOG(address _account, uint _HOGamount) external;
}
