// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TapeRNG} from "../src/TapeRNG.sol";
import {LotteryDemo} from "../src/LotteryDemo.sol";
import {DrandQuicknetAdapter} from "../src/beacon/DrandQuicknetAdapter.sol";
import {MockBeaconAdapter} from "../src/beacon/MockBeaconAdapter.sol";
import {MockTapeOutCPU} from "../src/mocks/MockTapeOutCPU.sol";
import {ITapeOutCPU} from "../src/interfaces/ITapeOutCPU.sol";

/// @notice Deploy TapeRNG + LotteryDemo.
/// @dev Env:
///   CPU_MODE=mock|real
///   BEACON_MODE=mock|drand|none
///   CPU_ADDRESS + CIRCUIT_ID (real mode)
///   MOCK_BEACON_GENESIS / MOCK_BEACON_PERIOD (mock mode; defaults now/60)
contract Deploy is Script {
    function run() external returns (TapeRNG rng, LotteryDemo lottery) {
        string memory cpuMode = vm.envOr("CPU_MODE", string("mock"));
        string memory beaconMode = vm.envOr("BEACON_MODE", string("mock"));

        vm.startBroadcast();

        address beaconAddress;
        if (keccak256(bytes(beaconMode)) == keccak256("drand")) {
            beaconAddress = address(new DrandQuicknetAdapter());
        } else if (keccak256(bytes(beaconMode)) == keccak256("mock")) {
            uint64 genesis = uint64(vm.envOr("MOCK_BEACON_GENESIS", block.timestamp));
            uint32 period = uint32(vm.envOr("MOCK_BEACON_PERIOD", uint256(60)));
            beaconAddress = address(new MockBeaconAdapter(genesis, period));
        } else {
            beaconAddress = address(0);
        }

        address cpu;
        uint256 circuitId;
        bytes32 netlistHash;
        if (keccak256(bytes(cpuMode)) == keccak256("mock")) {
            MockTapeOutCPU mockCpu = new MockTapeOutCPU();
            cpu = address(mockCpu);
            circuitId = 1;
            netlistHash = keccak256(mockCpu.netlist(1));
        } else {
            cpu = vm.envAddress("CPU_ADDRESS");
            circuitId = vm.envUint("CIRCUIT_ID");
            netlistHash = keccak256(ITapeOutCPU(cpu).netlist(circuitId));
        }

        rng = new TapeRNG(beaconAddress);
        lottery = new LotteryDemo(address(rng), cpu, circuitId, netlistHash);

        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("cpuMode", cpuMode);
        console2.log("beaconMode", beaconMode);
        console2.log("cpu", cpu);
        console2.log("circuitId", circuitId);
        console2.log("beaconAdapter", beaconAddress);
        console2.log("tapeRng", address(rng));
        console2.log("lottery", address(lottery));

        vm.createDir("deployments", true);
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeString(obj, "cpuMode", cpuMode);
        vm.serializeString(obj, "beaconMode", beaconMode);
        vm.serializeAddress(obj, "cpu", cpu);
        vm.serializeUint(obj, "circuitId", circuitId);
        vm.serializeBytes32(obj, "netlistHash", netlistHash);
        vm.serializeAddress(obj, "beaconAdapter", beaconAddress);
        vm.serializeAddress(obj, "tapeRng", address(rng));
        string memory json = vm.serializeAddress(obj, "lottery", address(lottery));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
