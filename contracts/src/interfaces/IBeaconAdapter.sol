// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pluggable external randomness beacon.
/// @dev `roundTime` and `roundAt` use Unix seconds.  A protocol may set
///      `beaconRound = 0` to disable the beacon entirely.
interface IBeaconAdapter {
    /// @return ok whether `proof` is a valid beacon proof for `round`
    /// @return randomness the beacon output (for drand quicknet: sha256(signature))
    function verify(uint64 round, bytes calldata proof) external view returns (bool ok, bytes32 randomness);

    function roundAt(uint64 timestamp) external view returns (uint64);

    function roundTime(uint64 round) external view returns (uint64);

    function chainHash() external view returns (bytes32);
}
