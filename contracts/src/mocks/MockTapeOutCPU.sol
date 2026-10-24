// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITapeOutCPU} from "../interfaces/ITapeOutCPU.sol";

/// @notice Testnet/E2E mock of the FAB-Genisis Keccak-256 IP Core interface.
/// @dev `eval` is a deterministic, documented mock: keccak256(input)[0:3].
///      It is NOT a TAP-02 netlist evaluation.  Proofs must label
///      circuit.mode = "mock" and must not claim a real TapeOut execution.
contract MockTapeOutCPU is ITapeOutCPU {
    uint32 public constant N_IN = 24;
    uint32 public constant N_OUT = 24;
    uint32 public constant GATES = 1488;
    bytes private _netlist = hex"6d6f636b"; // "mock"

    function eval(uint256, bytes calldata inputs) external pure override returns (bytes memory) {
        bytes32 h = keccak256(inputs);
        return abi.encodePacked(h[0], h[1], h[2]);
    }

    function step(uint256, bytes calldata, bytes calldata)
        external
        pure
        override
        returns (bytes memory, bytes memory)
    {
        revert("mock: stateless only");
    }

    function circuitInfo(uint256)
        external
        pure
        override
        returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)
    {
        return (N_IN, N_OUT, 0, GATES);
    }

    function netlist(uint256) external view override returns (bytes memory) {
        return _netlist;
    }
}
