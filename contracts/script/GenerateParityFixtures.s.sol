// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TapeRNGLib} from "../src/libraries/TapeRNGLib.sol";
import {TapeRNG} from "../src/TapeRNG.sol";
import {LotteryDemo} from "../src/LotteryDemo.sol";
import {MockTapeOutCPU} from "../src/mocks/MockTapeOutCPU.sol";
import {MockBeaconAdapter} from "../src/beacon/MockBeaconAdapter.sol";
import {SeedHarness} from "../src/test/SeedHarness.sol";

/// @notice Generate deterministic derivation fixtures for the TypeScript SDK.
/// @dev Run without --broadcast:
///      forge script script/GenerateParityFixtures.s.sol:GenerateParityFixtures
///      Output: contracts/deployments/parity.json
contract GenerateParityFixtures is Script {
    function run() external {
        SeedHarness h = new SeedHarness();
        MockTapeOutCPU cpuMock = new MockTapeOutCPU();
        MockBeaconAdapter beacon = new MockBeaconAdapter(uint64(block.timestamp), 60);
        TapeRNG rng = new TapeRNG(address(beacon));
        LotteryDemo lotteryDemo =
            new LotteryDemo(address(rng), address(cpuMock), 1, keccak256(cpuMock.netlist(1)));

        uint256 chainId = 196;
        address lottery = address(0x1000000000000000000000000000000000000001);
        bytes32 root = keccak256("parity-participants-root");
        uint32 participantCount = 100;
        uint32 winnerCount = 7;
        bytes32 prizeSpecHash = keccak256("parity-prize-spec");
        bytes32 specHash = keccak256("parity-spec");
        bytes32 context = h.contextHash(
            chainId, lottery, root, participantCount, winnerCount, prizeSpecHash, specHash
        );

        address organizer = address(0x2000000000000000000000000000000000000002);
        address tapeRng = address(0x3000000000000000000000000000000000000003);
        bytes32 organizerSeed = keccak256("parity-organizer-seed");
        bytes32 commitment = h.commitment(organizerSeed, context, organizer, chainId, tapeRng);

        address cpu = address(0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb);
        bytes32 netlistHash =
            0x998f29f1ad8dfab25871559ff695af7e6e7d0580cd73e6f1b07edeb10830600b;
        bytes32 blockHash = keccak256("parity-blockhash");
        bytes32 beaconRandomness = keccak256("parity-beacon");

        TapeRNGLib.Entropy memory e = TapeRNGLib.Entropy({
            chainId: chainId,
            tapeRng: tapeRng,
            requestId: 1,
            contextHash: context,
            organizerSeed: organizerSeed,
            blockHash: blockHash,
            beaconRandomness: beaconRandomness,
            cpu: cpu,
            circuitId: 3,
            netlistHash: netlistHash,
            beaconRound: 123,
            seedMissing: false,
            fallbackBlockhash: false
        });

        bytes32 pre = h.preSeed(e);
        bytes memory input = h.circuitInput(pre, 24);
        bytes32 mix = h.circuitMix(3, netlistHash, hex"f6ec15");
        bytes32 finalSeed = h.finalSeed(pre, mix, true, false, false, true);
        uint32[] memory winners = lotteryDemo.shuffleWinners(finalSeed, participantCount, winnerCount);
        uint32[] memory slots = lotteryDemo.shufflePrizeSlots(finalSeed, winnerCount);

        uint256[] memory winners256 = new uint256[](winners.length);
        uint256[] memory slots256 = new uint256[](slots.length);
        for (uint256 i; i < winners.length; ++i) {
            winners256[i] = winners[i];
            slots256[i] = slots[i];
        }

        string memory obj = "parity";
        vm.serializeUint(obj, "chainId", chainId);
        vm.serializeAddress(obj, "lottery", lottery);
        vm.serializeAddress(obj, "organizer", organizer);
        vm.serializeAddress(obj, "tapeRng", tapeRng);
        vm.serializeAddress(obj, "cpu", cpu);
        vm.serializeBytes32(obj, "participantsRoot", root);
        vm.serializeUint(obj, "participantCount", participantCount);
        vm.serializeUint(obj, "winnerCount", winnerCount);
        vm.serializeBytes32(obj, "prizeSpecHash", prizeSpecHash);
        vm.serializeBytes32(obj, "specHash", specHash);
        vm.serializeBytes32(obj, "contextHash", context);
        vm.serializeBytes32(obj, "organizerSeed", organizerSeed);
        vm.serializeBytes32(obj, "commitment", commitment);
        vm.serializeBytes32(obj, "blockHash", blockHash);
        vm.serializeBytes32(obj, "beaconRandomness", beaconRandomness);
        vm.serializeUint(obj, "beaconRound", 123);
        vm.serializeBytes32(obj, "netlistHash", netlistHash);
        vm.serializeBytes32(obj, "preSeed", pre);
        vm.serializeBytes(obj, "circuitInput", input);
        vm.serializeBytes32(obj, "circuitMix", mix);
        vm.serializeBytes32(obj, "finalSeed", finalSeed);
        vm.serializeUint(obj, "winners", winners256);
        string memory json = vm.serializeUint(obj, "prizeSlots", slots256);

        vm.createDir("deployments", true);
        vm.writeJson(json, "deployments/parity.json");
        console2.log("wrote deployments/parity.json");
        console2.logBytes32(finalSeed);
    }
}
