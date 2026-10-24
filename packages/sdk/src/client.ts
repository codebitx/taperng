import {
  parseEventLogs,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { tapeOutCpuAbi, tapeRngAbi } from "./abi";
import {
  commitment,
  circuitInput,
  preSeed,
  verifyDerivation,
  type DeriveCheck,
  type DeriveRequest,
  type DeriveResult,
} from "./derive";
import { fetchBeacon, roundTime } from "./drand";
import { evalNetlist, load } from "./netlist";
import { randomSeed } from "./protocol";

export interface TapeRNGAddresses {
  tapeRng: Address;
  /** 默认 TapeOut CPU；createRequest 里可显式覆盖。 */
  cpu?: Address;
}

export interface TapeRNGConfig {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  addresses: TapeRNGAddresses;
  chainId: number;
  chain?: Chain;
  beaconMode?: "drand" | "none";
  circuitMode?: "tapeout" | "mock";
}

export interface OnChainRequest {
  requester: Address;
  revealer: Address;
  commit: Hex;
  contextHash: Hex;
  specHash: Hex;
  revealBlock: bigint;
  beaconRound: bigint;
  cpu: Address;
  circuitId: bigint;
  netlistHash: Hex;
  nIn: number;
  nOut: number;
  gateCount: number;
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
}

export interface CreateRequestInput {
  /** context 摘要（消费者生成，SDK 当盲值不做解释）。 */
  contextHash: Hex;
  specHash: Hex;
  seed?: Hex;
  revealBlock?: bigint;
  beaconRound?: bigint;
  circuitId: bigint;
  cpu?: Address;
  /** 默认取 wallet account。 */
  revealer?: Address;
  account?: Address;
}

export interface CreateRequestResult {
  hash: Hex;
  requestId: bigint;
  commit: Hex;
  seed: Hex;
  contextHash: Hex;
  specHash: Hex;
  revealBlock: bigint;
  beaconRound: bigint;
  beaconTime: number;
}

export interface PlanRevealResult {
  beaconRound: bigint;
  beaconTime: number;
  revealBlock: bigint;
}

export interface CoreProof {
  version: string;
  chainId: number;
  requestId: string;
  contracts: { tapeRng: Address; cpu?: Address };
  context: { hash: Hex };
  specHash: Hex;
  request: Record<string, unknown>;
  circuit?: {
    output?: Hex | null;
    used?: boolean;
    cpu?: Address;
    circuitId?: string;
    netlistHash?: Hex;
    nIn?: number;
    nOut?: number;
    netlist?: Hex | null;
    input?: Hex;
    mode?: string;
  };
  beacon?: { signature?: Hex; randomness?: Hex } | null;
  derivation: DeriveResult;
  [key: string]: unknown;
}

export interface VerifyProofResult {
  ok: boolean;
  checks: DeriveCheck[];
  derivation: DeriveResult;
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = jsonSafe(item);
    }
    return output;
  }
  return value;
}

function number(value: unknown): number {
  return Number(value);
}

function bigint(value: unknown): bigint {
  return BigInt(value as string | number | bigint);
}

function hex(value: unknown): Hex {
  return value as Hex;
}

function toDeriveRequest(request: OnChainRequest): DeriveRequest {
  return {
    revealer: request.revealer,
    commit: request.commit,
    contextHash: request.contextHash,
    revealBlock: request.revealBlock,
    beaconRound: request.beaconRound,
    cpu: request.cpu,
    circuitId: request.circuitId,
    netlistHash: request.netlistHash,
    nIn: request.nIn,
    seedMissing: request.seedMissing,
    fallbackBlockhash: request.fallbackBlockhash,
    beaconUsed: request.beaconUsed,
    circuitUsed: request.circuitUsed,
    organizerSeed: request.organizerSeed,
    blockHash: request.blockHash,
    beaconRandomness: request.beaconRandomness,
    circuitMix: request.circuitMix,
    preSeed: request.preSeed,
    finalSeed: request.finalSeed,
  };
}

/**
 * 轮询收据。不用 viem 的 waitForTransactionReceipt：它在替换交易检测时会调用
 * eth_getBlockByNumber(receipt.blockNumber, true)；X Layer 的 Flashblock 预确认块号
 * 可能暂时领先 canonical 链头，RPC 返回 "block is out of range" 导致等待直接失败。
 * 这里只轮询 eth_getTransactionReceipt，对瞬时节点差异更宽容。
 */
export async function waitForReceipt(
  publicClient: PublicClient,
  hash: Hex,
  { timeoutMs = 180_000, intervalMs = 1_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch {
      // 尚未确认或 RPC 瞬时错误，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Transaction not confirmed yet");
}

export function createTapeRNG(config: TapeRNGConfig) {
  const { publicClient, walletClient, addresses, chainId } = config;
  const beaconMode = config.beaconMode ?? "drand";
  const circuitMode = config.circuitMode ?? "tapeout";
  const defaultCpu = addresses.cpu;

  function requireWallet(account?: Address) {
    if (!walletClient) throw new Error("walletClient is required");
    const configured = walletClient.account;
    const sender =
      account ??
      (typeof configured === "string" ? configured : configured?.address);
    if (!sender) throw new Error("wallet account is required");
    return { walletClient, account: sender };
  }

  async function getRequest(requestId: bigint): Promise<OnChainRequest> {
    const result = (await publicClient.readContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "getRequest",
      args: [requestId],
    })) as unknown as OnChainRequest;
    return {
      ...result,
      nIn: number(result.nIn),
      nOut: number(result.nOut),
      gateCount: number(result.gateCount),
      status: number(result.status),
    };
  }

  async function planReveal(
    currentBlock: bigint,
    now = Math.floor(Date.now() / 1000),
  ): Promise<PlanRevealResult> {
    // 紧凑参数：beacon 前瞻 +22 round(≈66s，满足合约硬下界 beaconTime > now+60)。
    // revealBlock 取 beaconTime 之后 +10s 并切块；下界 20 块防极端时序。
    const BEACON_ADVANCE_ROUNDS = 22;
    const REVEAL_BUFFER_SEC = 10;
    if (beaconMode === "none") {
      const beaconTime = now + 90;
      return {
        beaconRound: 0n,
        beaconTime,
        revealBlock:
          currentBlock +
          BigInt(Math.max(20, beaconTime - now + REVEAL_BUFFER_SEC)),
      };
    }
    const latest = await fetchBeacon("latest");
    const beaconRound = latest.round + BEACON_ADVANCE_ROUNDS;
    const beaconTime = roundTime(beaconRound);
    return {
      beaconRound: BigInt(beaconRound),
      beaconTime,
      revealBlock:
        currentBlock +
        BigInt(Math.max(20, beaconTime - now + REVEAL_BUFFER_SEC)),
    };
  }

  /** 发起一条随机数请求（commit + createRequest 一笔交易）。 */
  async function createRequest(
    input: CreateRequestInput,
  ): Promise<CreateRequestResult> {
    const { walletClient: wallet, account } = requireWallet(input.account);
    const revealer = input.revealer ?? account;
    const cpu = input.cpu ?? defaultCpu;
    if (!cpu) throw new Error("cpu address is required (addresses.cpu or input.cpu)");
    if (input.circuitId === undefined) {
      throw new Error("circuitId is required");
    }

    const currentBlock = await publicClient.getBlockNumber();
    const plan = await planReveal(currentBlock);
    const revealBlock = input.revealBlock ?? plan.revealBlock;
    const beaconRound = input.beaconRound ?? plan.beaconRound;
    const seed = input.seed ?? randomSeed();
    const commit = commitment(seed, input.contextHash, revealer, chainId, addresses.tapeRng);

    const hash = await wallet.writeContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "createRequest",
      args: [
        commit,
        input.contextHash,
        input.specHash,
        revealBlock,
        beaconRound,
        cpu,
        input.circuitId,
        revealer,
      ],
      account,
      chain: config.chain,
    });
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt.status !== "success") throw new Error("publish reverted");
    const logs = parseEventLogs({
      abi: tapeRngAbi,
      eventName: "RequestCreated",
      logs: receipt.logs,
    });
    const args = logs[0]?.args as { requestId?: bigint } | undefined;
    if (!args || args.requestId === undefined) {
      throw new Error("RequestCreated event missing");
    }
    return {
      hash,
      requestId: args.requestId,
      commit,
      seed,
      contextHash: input.contextHash,
      specHash: input.specHash,
      revealBlock,
      beaconRound,
      beaconTime: plan.beaconTime,
    };
  }

  async function reveal(requestId: bigint, seed: Hex, account?: Address): Promise<Hex> {
    const { walletClient: wallet, account: sender } = requireWallet(account);
    const hash = await wallet.writeContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "reveal",
      args: [requestId, seed],
      account: sender,
      chain: config.chain,
    });
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt.status !== "success") throw new Error("reveal reverted");
    return hash;
  }

  async function finalize(
    requestId: bigint,
    beaconSignature?: Hex,
    account?: Address,
  ): Promise<Hex> {
    const { walletClient: wallet, account: sender } = requireWallet(account);
    let signature = beaconSignature ?? ("0x" as Hex);
    if (beaconMode === "drand" && !beaconSignature) {
      const req = await getRequest(requestId);
      if (req.beaconRound !== 0n) {
        signature = (await fetchBeacon(Number(req.beaconRound))).signature;
      }
    }
    const hash = await wallet.writeContract({
      address: addresses.tapeRng,
      abi: tapeRngAbi,
      functionName: "finalize",
      args: [requestId, signature],
      account: sender,
      chain: config.chain,
    });
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt.status !== "success") throw new Error("finalize reverted");
    return hash;
  }

  async function getProof(requestId: bigint): Promise<CoreProof> {
    const request = await getRequest(requestId);
    const pre = preSeed({
      chainId,
      tapeRng: addresses.tapeRng,
      requestId,
      context: request.contextHash,
      request: toDeriveRequest(request),
    });
    const mixIn = circuitInput(pre, request.nIn);
    let output: Hex | undefined;
    if (request.circuitUsed) {
      output = (await publicClient.readContract({
        address: request.cpu,
        abi: tapeOutCpuAbi,
        functionName: "eval",
        args: [request.circuitId, mixIn],
      })) as Hex;
    }
    let signature: Hex | undefined;
    if (request.beaconUsed && request.beaconRound !== 0n) {
      try {
        signature = (await fetchBeacon(Number(request.beaconRound))).signature;
      } catch {
        signature = undefined;
      }
    }
    let netlist: Hex | undefined;
    if (request.circuitUsed) {
      try {
        netlist = (await publicClient.readContract({
          address: request.cpu,
          abi: tapeOutCpuAbi,
          functionName: "netlist",
          args: [request.circuitId],
        })) as Hex;
      } catch {
        netlist = undefined;
      }
    }
    const derivation = verifyDerivation({
      chainId,
      tapeRng: addresses.tapeRng,
      requestId,
      revealer: request.revealer,
      contextHash: request.contextHash,
      request: toDeriveRequest(request),
      circuitOutput: output,
      beaconSignature: signature,
    });
    return {
      version: "taperng-rng-proof-v1",
      chainId,
      requestId: requestId.toString(),
      contracts: {
        tapeRng: addresses.tapeRng,
        cpu: request.cpu,
      },
      context: { hash: request.contextHash },
      specHash: request.specHash,
      request: jsonSafe(request) as Record<string, unknown>,
      circuit: {
        cpu: request.cpu,
        circuitId: request.circuitId.toString(),
        netlistHash: request.netlistHash,
        nIn: request.nIn,
        nOut: request.nOut,
        netlist: netlist ?? null,
        input: mixIn,
        output: output ?? null,
        used: request.circuitUsed,
        mode: circuitMode,
      },
      beacon: signature
        ? { signature, randomness: request.beaconRandomness }
        : null,
      derivation,
    };
  }

  function verifyProof(proof: CoreProof): VerifyProofResult {
    const request = proof.request as Record<string, unknown>;
    const deriveRequest: DeriveRequest = {
      revealer: hex(request.revealer) as Address,
      commit: hex(request.commit),
      contextHash: hex(request.contextHash),
      revealBlock: bigint(request.revealBlock),
      beaconRound: bigint(request.beaconRound),
      cpu: hex(request.cpu) as Address,
      circuitId: bigint(request.circuitId),
      netlistHash: hex(request.netlistHash),
      nIn: number(request.nIn),
      seedMissing: Boolean(request.seedMissing),
      fallbackBlockhash: Boolean(request.fallbackBlockhash),
      beaconUsed: Boolean(request.beaconUsed),
      circuitUsed: Boolean(request.circuitUsed),
      organizerSeed: hex(request.organizerSeed),
      blockHash: hex(request.blockHash),
      beaconRandomness: hex(request.beaconRandomness),
      circuitMix: hex(request.circuitMix),
      preSeed: hex(request.preSeed),
      finalSeed: hex(request.finalSeed),
    };
    const derivation = verifyDerivation({
      chainId: proof.chainId,
      tapeRng: proof.contracts.tapeRng,
      requestId: bigint(proof.requestId),
      revealer: deriveRequest.revealer,
      contextHash: proof.context.hash,
      request: deriveRequest,
      circuitOutput: proof.circuit?.output ?? undefined,
      beaconSignature: proof.beacon?.signature ?? undefined,
    });
    const checks = [...derivation.checks];
    // 可选：TAP-02 netlist 离线复算（proof 携带 netlist 时）。
    if (
      proof.circuit?.mode === "tapeout" &&
      proof.circuit.netlist &&
      proof.circuit.input &&
      proof.circuit.nIn !== undefined &&
      proof.circuit.nOut !== undefined
    ) {
      try {
        const netlist = load(
          proof.circuit.netlist,
          proof.circuit.nIn,
          proof.circuit.nOut,
        );
        const localOutput = evalNetlist(netlist, proof.circuit.input);
        checks.push({
          name: "TAP-02 netlist replay",
          ok:
            localOutput.toLowerCase() ===
            String(proof.circuit.output ?? "").toLowerCase(),
        });
      } catch (error) {
        checks.push({
          name: "TAP-02 netlist replay",
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { ok: checks.every((check) => check.ok), checks, derivation };
  }

  return {
    addresses,
    chainId,
    beaconMode,
    planReveal,
    createRequest,
    reveal,
    finalize,
    getRequest,
    getProof,
    verifyProof,
  };
}

export type TapeRNGClient = ReturnType<typeof createTapeRNG>;