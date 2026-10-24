// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBeaconAdapter} from "../interfaces/IBeaconAdapter.sol";

/// @notice Test/local beacon adapter.  Proofs are ignored and randomness is
///         configured explicitly with `setBeacon`.
contract MockBeaconAdapter is IBeaconAdapter {
    bytes32 public constant MOCK_CHAIN_HASH = keccak256("TapeRNG/mock-beacon");

    uint64 public immutable genesis;
    uint32 public immutable period;
    mapping(uint64 round => bytes32 randomness) public randomness;

    constructor(uint64 genesis_, uint32 period_) {
        require(period_ > 0, "period=0");
        genesis = genesis_;
        period = period_;
    }

    function setBeacon(uint64 round, bytes32 value) external {
        randomness[round] = value;
    }

    function verify(uint64 round, bytes calldata) external view returns (bool ok, bytes32 value) {
        value = randomness[round];
        ok = value != bytes32(0);
    }

    function roundAt(uint64 timestamp) external view returns (uint64) {
        if (timestamp < genesis) return 0;
        return (timestamp - genesis) / uint64(period);
    }

    function roundTime(uint64 round) external view returns (uint64) {
        return genesis + uint64(round) * uint64(period);
    }

    function chainHash() external pure returns (bytes32) {
        return MOCK_CHAIN_HASH;
    }
}
