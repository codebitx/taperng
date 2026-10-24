/**
 * ⚠️ 已随 SDK 解耦而停用（2026-10-21）：本脚本是「抽奖」域的 fork 集成测试，
 * 依赖已被移除的 lotteryAbi / buildDraw / createDrawAndReveal / proof.draw。
 * 通用 SDK 不再包含抽奖语义；抽奖域集成测试应迁移到 apps/web（复用 lib/contracts
 * 与 lib/server/lottery）后再运行。留档不参与 typecheck/vitest（tsconfig include 仅 src/test）。
 *
 * X Layer mainnet-fork end-to-end integration test.
 *
 * Prerequisites:
 *   1. Anvil forked from X Layer mainnet at a pinned block, chain-id 31337,
 *      hardfork osaka (EIP-2537), at http://127.0.0.1:8545.
 *   2. Deploy.s.sol already broadcast with CPU_MODE=real / BEACON_MODE=drand;
 *      deployments/31337.json points at the fork deployment.
 *
 * Run (from packages/sdk):
 *   node_modules/.bin/tsx scripts/e2e-fork.mts
 *
 * The Anvil default private key below is public knowledge and only valid on a
 * local fork.  Never use it on a real network.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseEventLogs,
  toBytes,
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildDraw,
  commitment as commitmentLib,
  createTapeRNG,
  fetchBeacon,
  lotteryAbi,
  randomSeed,
  roundTime,
  tapeOutCpuAbi,
  tapeRngAbi,
  verifyBeacon,
  type ProofLike,
  type PrizeInput,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const ANVIL_KEY = process.env.ANVIL_PRIVATE_KEY;
if (!ANVIL_KEY) {
  throw new Error(
    "Set ANVIL_PRIVATE_KEY to the Anvil default dev key (local fork only)",
  );
}
const PROOF_DIR = process.env.PROOF_DIR ?? "/tmp";

interface Deployment {
  chainId: number;
  cpuMode: string;
  beaconMode: string;
  cpu: Address;
  circuitId: number;
  netlistHash: Hex;
  beaconAdapter: Address;
  tapeRng: Address;
  lottery: Address;
}

const deployment = JSON.parse(
  readFileSync(resolve(ROOT, "contracts/deployments/31337.json"), "utf8"),
) as Deployment;

assert.equal(deployment.chainId, 31337, "deployment must be a chain-31337 deployment");
assert.equal(deployment.cpuMode, "real", "CPU_MODE must be real");
assert.equal(deployment.beaconMode, "drand", "BEACON_MODE must be drand");
assert.equal(deployment.circuitId, 3, "circuit id must be the Keccak core #3");

const chain = defineChain({
  id: 31337,
  name: "X Layer mainnet fork (Anvil)",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const account = privateKeyToAccount(ANVIL_KEY as Hex);
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ chain, account, transport: http(RPC) });

const addresses = {
  lottery: deployment.lottery,
  tapeRng: deployment.tapeRng,
};

const sdk = createTapeRNG({
  publicClient,
  walletClient,
  addresses,
  chainId: deployment.chainId,
  chain,
  beaconMode: "drand",
  circuitMode: "tapeout",
});

let rpcId = 1;
async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (payload.error) throw new Error(`${method}: ${payload.error.message}`);
  return payload.result as T;
}

async function mine(count: number): Promise<void> {
  if (count <= 0) return;
  await rpc("anvil_mine", [`0x${count.toString(16)}`]);
}

async function setNextTimestamp(timestamp: number): Promise<void> {
  await rpc("evm_setNextBlockTimestamp", [timestamp]);
}

/** viem caches getBlockNumber for a few seconds; tests need the live head. */
async function currentBlockNumber(): Promise<bigint> {
  return BigInt(await rpc<string>("eth_blockNumber"));
}

async function latestBlockInfo(): Promise<{
  number: bigint;
  timestamp: bigint;
}> {
  const raw = await rpc<{ number: string; timestamp: string }>(
    "eth_getBlockByNumber",
    ["latest", false],
  );
  return { number: BigInt(raw.number), timestamp: BigInt(raw.timestamp) };
}

async function snapshot(): Promise<string> {
  return rpc<string>("evm_snapshot", []);
}

async function revert(id: string): Promise<void> {
  await rpc("evm_revert", [id]);
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

function check(label: string, condition: boolean, detail?: unknown): void {
  if (!condition) {
    throw new Error(
      `${label}${detail === undefined ? "" : `: ${stringify(detail)}`}`,
    );
  }
  console.log(`  ✓ ${label}`);
}

async function write(
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
  options: { gas?: bigint } = {},
): Promise<TransactionReceipt> {
  const hash = await walletClient.writeContract({
    address,
    abi,
    functionName: functionName as never,
    args: args as never,
    account,
    chain,
    ...(options.gas ? { gas: options.gas } : {}),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.status || receipt.status !== "success") {
    throw new Error(`${functionName} reverted (${hash})`);
  }
  return receipt;
}

async function expectRevert(
  label: string,
  promise: Promise<unknown>,
  needle: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(`${label} → ${needle}`, message.includes(needle), message.slice(0, 400));
    return;
  }
  throw new Error(`${label}: expected a revert containing "${needle}"`);
}

function uniqueInRange(winners: readonly number[], count: number): boolean {
  if (new Set(winners).size !== winners.length) return false;
  return winners.every((value) => Number.isInteger(value) && value >= 0 && value < count);
}

function isPermutation(values: readonly number[]): boolean {
  return (
    values.length === new Set(values).size &&
    values.every((value, index) => values.includes(index))
  );
}

function eventArg<T>(receipt: TransactionReceipt, abi: Abi, eventName: string, key: string): T {
  const logs = parseEventLogs({ abi, eventName, logs: receipt.logs });
  const first = logs[0] as unknown as { args?: Record<string, unknown> } | undefined;
  if (!first?.args) throw new Error(`${eventName} event missing`);
  return first.args[key] as T;
}

async function readDraw(drawId: bigint) {
  const draw = (await publicClient.readContract({
    address: addresses.lottery,
    abi: lotteryAbi,
    functionName: "getDraw",
    args: [drawId],
  })) as unknown as {
    organizer: Address;
    requestId: bigint;
    participantCount: number;
    winnerCount: number;
    status: number;
    fallbackUsed: boolean;
    finalSeed: Hex;
    winners: readonly number[];
    prizeSlots: readonly number[];
    revealBlock: bigint;
    beaconRound: bigint;
  };
  return {
    ...draw,
    participantCount: Number(draw.participantCount),
    winnerCount: Number(draw.winnerCount),
    status: Number(draw.status),
    winners: draw.winners.map(Number),
    prizeSlots: draw.prizeSlots.map(Number),
  };
}

async function readRequest(requestId: bigint) {
  const request = (await publicClient.readContract({
    address: addresses.tapeRng,
    abi: tapeRngAbi,
    functionName: "getRequest",
    args: [requestId],
  })) as unknown as {
    cpu: Address;
    circuitId: bigint;
    netlistHash: Hex;
    nIn: number;
    nOut: number;
    seedMissing: boolean;
    fallbackBlockhash: boolean;
    beaconUsed: boolean;
    circuitUsed: boolean;
    organizerSeed: Hex;
    blockHash: Hex;
    beaconRandomness: Hex;
    circuitMix: Hex;
    preSeed: Hex;
    finalSeed: Hex;
    status: number;
    revealBlock: bigint;
    beaconRound: bigint;
  };
  return {
    ...request,
    circuitId: BigInt(request.circuitId),
    nIn: Number(request.nIn),
    nOut: Number(request.nOut),
    status: Number(request.status),
    revealBlock: BigInt(request.revealBlock),
    beaconRound: BigInt(request.beaconRound),
  };
}

async function proofAndVerify(
  drawId: bigint,
  name: string,
): Promise<ProofLike> {
  const proof = await sdk.getProof(drawId);
  const result = sdk.verifyProof(proof);
  check(
    `${name}: SDK proof verification`,
    result.ok,
    result.checks.filter((item) => !item.ok),
  );
  const replay = result.checks.find((item) => item.name === "TAP-02 netlist replay");
  check(`${name}: TAP-02 netlist replay`, Boolean(replay?.ok), replay);
  const file = resolve(PROOF_DIR, `taperng-proof-${name}.json`);
  writeFileSync(file, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`  · proof written to ${file}`);
  return proof;
}

const PRIZES: PrizeInput[] = [
  { name: "50 CNY Red Packet", quantity: 3 },
  { name: "100 CNY Red Packet", quantity: 2 },
  { name: "Xiaomi Laptop", quantity: 1 },
  { name: "iPhone 17", quantity: 1 },
];

async function main(): Promise<void> {
  console.log("== 0. Fork / deployment preflight ==");
  const chainId = await publicClient.getChainId();
  const block = await latestBlockInfo();
  const blockNumber = block.number;
  console.log(`  RPC=${RPC} chainId=${chainId} block=${blockNumber} ts=${block.timestamp}`);
  check("chain id is 31337", chainId === 31337);
  check("deployment cpu is the mainnet Keccak core", deployment.cpu.toLowerCase() ===
    "0xd5bc8e63950aa26f0a633d1d9851a20feacac5bb");
  const code = await publicClient.getCode({ address: deployment.cpu });
  check("Keccak CPU has code in the fork", Boolean(code && code !== "0x"));
  const info = (await publicClient.readContract({
    address: deployment.cpu,
    abi: tapeOutCpuAbi,
    functionName: "circuitInfo",
    args: [BigInt(deployment.circuitId)],
  })) as readonly [number, number, number, number];
  check(
    "circuitInfo(3) == (24,24,0,1488)",
    Number(info[0]) === 24 && Number(info[1]) === 24 && Number(info[2]) === 0 && Number(info[3]) === 1488,
    info,
  );
  const netlist = (await publicClient.readContract({
    address: deployment.cpu,
    abi: tapeOutCpuAbi,
    functionName: "netlist",
    args: [BigInt(deployment.circuitId)],
  })) as Hex;
  check("netlist is 10416 bytes", (netlist.length - 2) / 2 === 10_416);
  check(
    "netlist hash matches the pinned hash",
    keccak256(netlist).toLowerCase() === deployment.netlistHash.toLowerCase(),
  );
  const sample = (await publicClient.readContract({
    address: deployment.cpu,
    abi: tapeOutCpuAbi,
    functionName: "eval",
    args: [BigInt(deployment.circuitId), "0x123456"],
  })) as Hex;
  check("eval(3,0x123456) == 0xf6ec15", sample.toLowerCase() === "0xf6ec15", sample);

  const snapshotId = await snapshot();
  console.log(`  · snapshot ${snapshotId} taken for post-run reset`);

  // -------------------------------------------------------------------------
  console.log("\n== 1. Pick one future drand round for three concurrent requests ==");
  const latestBeacon = await fetchBeacon("latest");
  const beaconRound = latestBeacon.round + 40;
  const beaconTime = roundTime(beaconRound);
  const latestBlock = await latestBlockInfo();
  const wallNow = Math.floor(Date.now() / 1000);
  const createTimestamp = Math.max(Number(latestBlock.timestamp) + 1, wallNow + 2);
  check(
    "beacon time is > create timestamp + 60s",
    beaconTime > createTimestamp + 60,
    { beaconRound, beaconTime, createTimestamp },
  );
  console.log(`  beaconRound=${beaconRound} beaconTime=${beaconTime} createTs=${createTimestamp}`);

  const startBlock = await currentBlockNumber();
  const revealBlockHappy = startBlock + 40n;
  const revealBlockMissing = startBlock + 45n;
  const revealBlockDirect = startBlock + 50n;

  console.log("\n== 2. Create requests (same beacon, independent paths) ==");
  await setNextTimestamp(createTimestamp);
  const happySeed = randomSeed();
  const happy = await sdk.createDrawAndReveal({
    name: "Fork E2E Happy Path",
    participantCount: 100,
    prizes: PRIZES,
    locale: "en",
    seed: happySeed,
    revealBlock: revealBlockHappy,
    beaconRound: BigInt(beaconRound),
  });
  console.log(
    `  happy: drawId=${happy.drawId} requestId=${happy.requestId} tx=${happy.hash}`,
  );

  const missingBuilt = buildDraw({
    name: "Fork E2E Missing Seed",
    participantCount: 20,
    prizes: [
      { name: "First", quantity: 2 },
      { name: "Second", quantity: 1 },
    ],
    locale: "en",
    chainId: deployment.chainId,
    lottery: addresses.lottery,
  });
  const missingSeed = randomSeed();
  const missingCommit = (await publicClient.readContract({
    address: addresses.lottery,
    abi: lotteryAbi,
    functionName: "commitSeed",
    args: [
      missingSeed,
      account.address,
      missingBuilt.participantsRoot,
      20,
      missingBuilt.winnerCount,
      missingBuilt.prizeSpecHash,
      missingBuilt.specHash,
    ],
  })) as Hex;
  const missingReceipt = await write(addresses.lottery, lotteryAbi, "createDraw", [
    missingBuilt.participantsRoot,
    20,
    missingBuilt.prizeSpecHash,
    missingBuilt.specHash,
    missingBuilt.winnerCount,
    revealBlockMissing,
    BigInt(beaconRound),
    missingCommit,
  ]);
  const missingDrawId = eventArg<bigint>(missingReceipt, lotteryAbi, "DrawCreated", "drawId");
  const missingRequestId = eventArg<bigint>(missingReceipt, lotteryAbi, "DrawCreated", "requestId");
  console.log(
    `  missing: drawId=${missingDrawId} requestId=${missingRequestId} (no reveal tx)`,
  );

  const directContext = keccak256(toBytes("taperng-fork-e2e/direct-context"));
  const directSpec = keccak256(toBytes("taperng-fork-e2e/direct-spec"));
  const directSeed = randomSeed();
  const directCommit = commitmentLib(
    directSeed,
    directContext,
    account.address,
    deployment.chainId,
    addresses.tapeRng,
  );
  const directReceipt = await write(addresses.tapeRng, tapeRngAbi, "createRequest", [
    directCommit,
    directContext,
    directSpec,
    revealBlockDirect,
    BigInt(beaconRound),
    deployment.cpu,
    BigInt(deployment.circuitId),
    account.address,
  ]);
  const directRequestId = eventArg<bigint>(
    directReceipt,
    tapeRngAbi,
    "RequestCreated",
    "requestId",
  );
  const directRevealReceipt = await write(addresses.tapeRng, tapeRngAbi, "reveal", [
    directRequestId,
    directSeed,
  ]);
  console.log(
    `  direct: requestId=${directRequestId} revealTx=${directRevealReceipt.transactionHash}`,
  );

  console.log("\n== 3. Negative checks before the beacon is published ==");
  await expectRevert(
    "reveal with a wrong seed",
    publicClient.simulateContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "reveal",
      args: [missingRequestId, randomSeed()],
      account,
    }),
    "bad commitment",
  );
  await expectRevert(
    "finalize before revealBlock",
    publicClient.simulateContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "finalize",
      args: [directRequestId, "0x"],
      account,
    }),
    "too early",
  );
  await expectRevert(
    "createRequest with a too-soon beacon",
    publicClient.simulateContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "createRequest",
      args: [
        directCommit,
        directContext,
        directSpec,
        (await currentBlockNumber()) + 10n,
        BigInt(latestBeacon.round + 10),
        deployment.cpu,
        BigInt(deployment.circuitId),
        account.address,
      ],
      account,
    }),
    "beacon too soon",
  );
  await expectRevert(
    "createDraw with winnerCount > participantCount",
    publicClient.simulateContract({
      address: addresses.lottery,
      abi: lotteryAbi,
      functionName: "createDrawAndReveal",
      args: [
        missingBuilt.participantsRoot,
        10,
        missingBuilt.prizeSpecHash,
        missingBuilt.specHash,
        11,
        (await currentBlockNumber()) + 10n,
        0n,
        randomSeed(),
      ],
      account,
    }),
    "bad winners",
  );

  // -------------------------------------------------------------------------
  console.log(`\n== 4. Wait for real drand quicknet round ${beaconRound} ==`);
  let beacon;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      beacon = await fetchBeacon(beaconRound);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  assert.ok(beacon, "drand round was not published in time");
  const offline = verifyBeacon(beacon);
  check("SDK offline BLS verification of the beacon", offline.ok, offline.error);
  check("beacon round matches", beacon.round === beaconRound);
  console.log(`  signature=${beacon.signature.slice(0, 18)}… randomness=${beacon.randomness}`);

  const latestTs = Number((await latestBlockInfo()).timestamp);
  await setNextTimestamp(Math.max(beaconTime + 5, latestTs + 1));
  const current = await currentBlockNumber();
  const target = [revealBlockHappy, revealBlockMissing, revealBlockDirect].reduce(
    (a, b) => (a > b ? a : b),
  );
  const toMine = Number(target - current) + 2;
  await mine(toMine);
  console.log(`  mined ${toMine} blocks, now at ${await currentBlockNumber()}`);

  console.log("\n== 5. Reject malformed beacon proof, then finalize all paths ==");
  await expectRevert(
    "finalize with a short beacon proof",
    publicClient.simulateContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "finalize",
      args: [directRequestId, "0x1234"],
      account,
    }),
    "bad beacon",
  );

  // TapeRNG now enforces a circuit gas floor (MIN_CIRCUIT_GAS = 5.2M), so a
  // low gas limit reverts instead of silently flipping circuitUsed=false.
  // eth_estimateGas must return at least that floor.
  const MIN_CIRCUIT_GAS = (await publicClient.readContract({
    address: addresses.tapeRng,
    abi: tapeRngAbi,
    functionName: "MIN_CIRCUIT_GAS",
  })) as bigint;
  check("MIN_CIRCUIT_GAS is 5.2M", MIN_CIRCUIT_GAS === 5_200_000n, MIN_CIRCUIT_GAS);
  await expectRevert(
    "finalize with 4M gas",
    publicClient.simulateContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "finalize",
      args: [directRequestId, beacon.signature],
      account,
      gas: 4_000_000n,
    }),
    "insufficient gas for circuit",
  );
  const directEstimate = await publicClient.estimateContractGas({
    address: addresses.tapeRng,
    abi: tapeRngAbi,
    functionName: "finalize",
    args: [directRequestId, beacon.signature],
    account,
  });
  check(
    "direct finalize estimate includes the circuit gas floor",
    directEstimate >= MIN_CIRCUIT_GAS,
    directEstimate,
  );
  const directFinalizeReceipt = await write(addresses.tapeRng, tapeRngAbi, "finalize", [
    directRequestId,
    beacon.signature,
  ]);
  console.log(`  direct finalize gas=${directFinalizeReceipt.gasUsed}`);

  const happyFinalizeHash = await sdk.finalizeDraw(happy.drawId);
  const happyFinalizeReceipt = await publicClient.waitForTransactionReceipt({
    hash: happyFinalizeHash,
  });
  console.log(`  happy finalize tx=${happyFinalizeHash} gas=${happyFinalizeReceipt.gasUsed}`);

  const missingFinalizeReceipt = await write(
    addresses.lottery,
    lotteryAbi,
    "finalizeDraw",
    [missingDrawId, beacon.signature],
    { gas: 8_000_000n },
  );
  console.log(`  missing finalize gas=${missingFinalizeReceipt.gasUsed}`);

  console.log("\n== 6. Assert on-chain state ==");
  const happyDraw = await readDraw(happy.drawId);
  const happyRequest = await readRequest(happy.requestId);
  check("happy: draw finalized", happyDraw.status === 3, happyDraw.status);
  check("happy: request finalized", happyRequest.status === 3, happyRequest.status);
  check("happy: organizer seed revealed", happyRequest.organizerSeed.toLowerCase() === happySeed.toLowerCase());
  check("happy: beacon used", happyRequest.beaconUsed);
  check("happy: circuit used", happyRequest.circuitUsed);
  check("happy: no fallback", !happyRequest.seedMissing && !happyRequest.fallbackBlockhash);
  check("happy: 7 unique winners in [0,100)", uniqueInRange(happyDraw.winners, 100), happyDraw.winners);
  check("happy: prize slots are a permutation of 0..6", isPermutation(happyDraw.prizeSlots), happyDraw.prizeSlots);
  check(
    "happy: on-chain verify()",
    (await publicClient.readContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "verify",
      args: [happy.requestId, beacon.signature],
    })) === true,
  );

  const missingDraw = await readDraw(missingDrawId);
  const missingRequest = await readRequest(missingRequestId);
  check("missing: draw finalized", missingDraw.status === 3, missingDraw.status);
  check("missing: seedMissing=true", missingRequest.seedMissing);
  check("missing: beacon used", missingRequest.beaconUsed);
  check("missing: circuit used", missingRequest.circuitUsed);
  check("missing: organizerSeed is zero", missingRequest.organizerSeed === `0x${"00".repeat(32)}`);
  check("missing: 3 unique winners in [0,20)", uniqueInRange(missingDraw.winners, 20), missingDraw.winners);
  check("missing: prize slots permutation", isPermutation(missingDraw.prizeSlots), missingDraw.prizeSlots);
  check(
    "missing: on-chain verify()",
    (await publicClient.readContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "verify",
      args: [missingRequestId, beacon.signature],
    })) === true,
  );

  const directState = await readRequest(directRequestId);
  check("direct: request finalized", directState.status === 3, directState.status);
  check("direct: beacon used", directState.beaconUsed);
  check("direct: circuit used", directState.circuitUsed);
  check(
    "direct: on-chain verify()",
    (await publicClient.readContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "verify",
      args: [directRequestId, beacon.signature],
    })) === true,
  );

  console.log("\n== 7. SDK proof + TAP-02 replay ==");
  const happyProof = await proofAndVerify(happy.drawId, "happy");
  const missingProof = await proofAndVerify(missingDrawId, "missing");
  check(
    "happy and missing proofs use the same beacon randomness",
    String(happyProof.request.beaconRandomness).toLowerCase() ===
      String(missingProof.request.beaconRandomness).toLowerCase(),
  );
  check(
    "happy and missing final seeds differ",
    String(happyProof.request.finalSeed).toLowerCase() !==
      String(missingProof.request.finalSeed).toLowerCase(),
  );

  const derivation = happyProof.derivation as { circuitInput: Hex } | undefined;
  assert.ok(derivation?.circuitInput, "happy proof has no circuit input");
  const evalGas = await publicClient.estimateContractGas({
    address: deployment.cpu,
    abi: tapeOutCpuAbi,
    functionName: "eval",
    args: [BigInt(deployment.circuitId), derivation.circuitInput],
    account,
  });
  console.log(`  real Keccak core eval gas ≈ ${evalGas} (finalize gas ${happyFinalizeReceipt.gasUsed})`);
  check("eval gas is in the documented 3.4M–3.6M range", evalGas > 3_300_000n && evalGas < 3_700_000n, evalGas);
  check("finalize gas is below the 30M block target", happyFinalizeReceipt.gasUsed < 30_000_000n);

  await expectRevert(
    "re-finalize an already finalized draw",
    publicClient.simulateContract({
      address: addresses.lottery,
      abi: lotteryAbi,
      functionName: "finalizeDraw",
      args: [happy.drawId, beacon.signature],
      account,
    }),
    "not active",
  );

  // -------------------------------------------------------------------------
  console.log("\n== 8. Expired fallback path (beaconRound=0, >256 blocks) ==");
  const fallbackSeed = randomSeed();
  const fallbackBuilt = buildDraw({
    name: "Fork E2E Expired Fallback",
    participantCount: 5,
    prizes: [{ name: "Only", quantity: 2 }],
    locale: "en",
    chainId: deployment.chainId,
    lottery: addresses.lottery,
  });
  const fallbackBlock = (await currentBlockNumber()) + 3n;
  const fallbackCreate = await write(
    addresses.lottery,
    lotteryAbi,
    "createDrawAndReveal",
    [
      fallbackBuilt.participantsRoot,
      5,
      fallbackBuilt.prizeSpecHash,
      fallbackBuilt.specHash,
      fallbackBuilt.winnerCount,
      fallbackBlock,
      0n,
      fallbackSeed,
    ],
  );
  const fallbackDrawId = eventArg<bigint>(fallbackCreate, lotteryAbi, "DrawCreated", "drawId");
  const fallbackRequestId = eventArg<bigint>(fallbackCreate, lotteryAbi, "DrawCreated", "requestId");
  const nowBlock = await currentBlockNumber();
  await mine(Number(fallbackBlock - nowBlock) + 258);
  const fallbackFinalize = await write(
    addresses.lottery,
    lotteryAbi,
    "finalizeDraw",
    [fallbackDrawId, "0x"],
    { gas: 8_000_000n },
  );
  console.log(`  fallback finalize gas=${fallbackFinalize.gasUsed}`);
  const fallbackDraw = await readDraw(fallbackDrawId);
  const fallbackRequest = await readRequest(fallbackRequestId);
  check("fallback: draw finalized", fallbackDraw.status === 3, fallbackDraw.status);
  check("fallback: draw.fallbackUsed=true", fallbackDraw.fallbackUsed);
  check("fallback: request.fallbackBlockhash=true", fallbackRequest.fallbackBlockhash);
  check("fallback: beacon not used", !fallbackRequest.beaconUsed);
  check("fallback: circuit used", fallbackRequest.circuitUsed);
  check("fallback: winners unique", uniqueInRange(fallbackDraw.winners, 5), fallbackDraw.winners);
  const fallbackProof = await proofAndVerify(fallbackDrawId, "fallback");
  check(
    "fallback proof marks fallback blockhash",
    (fallbackProof.request as Record<string, unknown>).fallbackBlockhash === true,
  );

  await expectRevert(
    "re-finalize an already finalized fallback request",
    publicClient.simulateContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "finalize",
      args: [fallbackRequestId, "0x"],
      account,
    }),
    "bad status",
  );

  console.log("\n== 8b. Core-level expired window (TapeRNG direct) ==");
  const expiredContext = keccak256(toBytes("taperng-fork-e2e/expired-context"));
  const expiredSpec = keccak256(toBytes("taperng-fork-e2e/expired-spec"));
  const expiredBlock = (await currentBlockNumber()) + 2n;
  const expiredReceipt = await write(addresses.tapeRng, tapeRngAbi, "createRequest", [
    keccak256(toBytes("taperng-fork-e2e/expired-commit")),
    expiredContext,
    expiredSpec,
    expiredBlock,
    0n,
    deployment.cpu,
    BigInt(deployment.circuitId),
    account.address,
  ]);
  const expiredRequestId = eventArg<bigint>(
    expiredReceipt,
    tapeRngAbi,
    "RequestCreated",
    "requestId",
  );
  await mine(Number(expiredBlock - (await currentBlockNumber())) + 258);
  await expectRevert(
    "TapeRNG.finalize after the 256-block window",
    publicClient.simulateContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "finalize",
      args: [expiredRequestId, "0x"],
      account,
    }),
    "blockhash expired",
  );
  const expiredFinalize = await write(
    addresses.tapeRng,
    tapeRngAbi,
    "finalizeExpired",
    [expiredRequestId, "0x"],
    { gas: 8_000_000n },
  );
  console.log(`  finalizeExpired gas=${expiredFinalize.gasUsed}`);
  const expiredState = await readRequest(expiredRequestId);
  check("expired: request finalized", expiredState.status === 3, expiredState.status);
  check("expired: fallbackBlockhash=true", expiredState.fallbackBlockhash);
  check("expired: seedMissing=true", expiredState.seedMissing);
  check("expired: circuit used", expiredState.circuitUsed);
  check(
    "expired: on-chain verify()",
    (await publicClient.readContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "verify",
      args: [expiredRequestId, "0x"],
    })) === true,
  );

  // -------------------------------------------------------------------------
  console.log("\n== 9. Post-run reset ==");
  await revert(snapshotId);
  const resetBlock = await currentBlockNumber();
  check("fork reverted to the snapshot block", resetBlock === blockNumber, {
    resetBlock,
    blockNumber,
  });
  console.log("\nALL FORK E2E CHECKS PASSED");
}

main().catch((error) => {
  console.error("\nFORK E2E FAILED");
  console.error(error);
  process.exitCode = 1;
});
