// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ITapeOutCPU} from "../../src/interfaces/ITapeOutCPU.sol";

/// @notice Read-only regression pin for the FAB-Genisis Keccak-256 IP Core.
/// @dev Run with: RUN_FORK=true forge test --match-path test/fork/KeccakCore.t.sol -vv
contract KeccakCoreForkTest is Test {
    address internal constant KECCAK_CORE = 0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb;
    uint256 internal constant CIRCUIT_ID = 3;
    bytes32 internal constant NETLIST_HASH =
        0x998f29f1ad8dfab25871559ff695af7e6e7d0580cd73e6f1b07edeb10830600b;

    function setUp() public {
        if (!vm.envOr("RUN_FORK", false)) vm.skip(true);
        vm.createSelectFork(vm.envOr("XLAYER_RPC", string("https://rpc.xlayer.tech")));
    }

    function testPin() public view {
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gates) =
            ITapeOutCPU(KECCAK_CORE).circuitInfo(CIRCUIT_ID);
        assertEq(nIn, 24);
        assertEq(nOut, 24);
        assertEq(nState, 0);
        assertEq(gates, 1488);

        bytes memory netlist = ITapeOutCPU(KECCAK_CORE).netlist(CIRCUIT_ID);
        assertEq(netlist.length, 10_416);
        assertEq(keccak256(netlist), NETLIST_HASH);

        bytes memory out = ITapeOutCPU(KECCAK_CORE).eval(CIRCUIT_ID, hex"123456");
        assertEq(out, hex"f6ec15");
    }
}
