// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal TapeOut processor interface used by TapeRNG.
/// @dev The real FAB-Genisis Keccak-256 IP Core and the testnet mock both
///      implement this interface.  `eval` is only valid for stateless
///      circuits (`nState == 0`); TapeRNG requires that in createRequest.
interface ITapeOutCPU {
    function eval(uint256 circuitId, bytes calldata inputs) external view returns (bytes memory);

    function step(uint256 circuitId, bytes calldata state, bytes calldata inputs)
        external
        view
        returns (bytes memory newState, bytes memory outputs);

    function circuitInfo(uint256 circuitId)
        external
        view
        returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);

    function netlist(uint256 circuitId) external view returns (bytes memory);
}
