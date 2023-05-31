//SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract BaseFeeOracle is AccessControl {
    struct Response {
        int256 answer;
        uint256 timestamp;
        uint80 roundId;
    }

    mapping(uint256 => Response) public responseById;

    bytes32 internal constant SETTER = keccak256("SETTER");
    bytes32 internal constant ULTIMATE_ADMIN = keccak256("ULTIMATE_ADMIN");

    uint256 constant decimals = 18;

    event BaseFeeSet(int256 newValue);

    constructor(address _admin, address _ultimateAdmin) {
        _grantRole(ULTIMATE_ADMIN, _ultimateAdmin);
        _setRoleAdmin(SETTER, ULTIMATE_ADMIN);
        _grantRole(SETTER, _admin);
    }

    function setBaseFee(int256 _newValue) external onlyRole(SETTER) {
        // TODO: Update Round
        responseById[0] = Response({
            answer: _newValue,
            timestamp: block.timestamp,
            roundId: 0 // TODO: UPDATE
        });

        emit BaseFeeSet(_newValue);
    }
}
