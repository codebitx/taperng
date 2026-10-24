import {
  parseEventLogs,
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import LotteryDemoAbiJson from "./abi/LotteryDemo.json";
import TapeRNGAbiJson from "./abi/TapeRNG.json";
import { chain, lotteryAddress, tapeRngAddress } from "./config";
import { publicClient } from "./chain";

export const lotteryAbi = LotteryDemoAbiJson as Abi;
export const tapeRngAbi = TapeRNGAbiJson as Abi;

export interface Draw {
  organizer: Address;
  requestId: bigint;
  participantsRoot: Hex;
  participantCount: number;
  winnerCount: number;
  prizeSpecHash: Hex;
  specHash: Hex;
  organizerCommit: Hex;
  revealBlock: bigint;
  beaconRound: bigint;
  status: number;
  fallbackUsed: boolean;
  finalSeed: Hex;
  winners: readonly number[];
  prizeSlots: readonly number[];
}

export interface RequestState {
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

export const DRAW_STATUS = [
  "None",
  "Created",
  "Revealed",
  "Finalized",
] as const;

export const REQUEST_STATUS = [
  "None",
  "Committed",
  "Revealed",
  "Finalized",
] as const;

export function requireAddresses(): {
  lottery: Address;
  tapeRng: Address;
} {
  if (!lotteryAddress || !tapeRngAddress) {
    throw new Error("TapeRNG contracts are not configured");
  }
  return { lottery: lotteryAddress, tapeRng: tapeRngAddress };
}

export async function readDraw(
  drawId: bigint,
  blockNumber?: bigint,
): Promise<Draw> {
  const { lottery } = requireAddresses();
  const result = (await publicClient.readContract({
    address: lottery,
    abi: lotteryAbi,
    functionName: "getDraw",
    args: [drawId],
    // 固定到某一块可避免 X Layer Flashblock 预确认与 canonical 状态之间的
    // 竞态：刚拿到 receipt 时 latest 可能还没应用该交易。
    ...(blockNumber === undefined ? {} : { blockNumber }),
  })) as unknown as Draw;
  return {
    ...result,
    participantCount: Number(result.participantCount),
    winnerCount: Number(result.winnerCount),
    status: Number(result.status),
    winners: result.winners.map(Number),
    prizeSlots: result.prizeSlots.map(Number),
  };
}

export async function readRequest(
  requestId: bigint,
  blockNumber?: bigint,
): Promise<RequestState> {
  const { tapeRng } = requireAddresses();
  const result = (await publicClient.readContract({
    address: tapeRng,
    abi: tapeRngAbi,
    functionName: "getRequest",
    args: [requestId],
    ...(blockNumber === undefined ? {} : { blockNumber }),
  })) as unknown as RequestState;
  return {
    ...result,
    nIn: Number(result.nIn),
    nOut: Number(result.nOut),
    gateCount: Number(result.gateCount),
    status: Number(result.status),
  };
}

export async function readWinners(
  drawId: bigint,
): Promise<{ winners: number[]; prizeSlots: number[] }> {
  const { lottery } = requireAddresses();
  const result = (await publicClient.readContract({
    address: lottery,
    abi: lotteryAbi,
    functionName: "getWinners",
    args: [drawId],
  })) as unknown as readonly [readonly number[], readonly number[]];
  return {
    winners: result[0].map(Number),
    prizeSlots: result[1].map(Number),
  };
}

export async function publishDraw(
  walletClient: WalletClient,
  account: Address,
  args: {
    participantsRoot: Hex;
    participantCount: number;
    prizeSpecHash: Hex;
    specHash: Hex;
    winnerCount: number;
    revealBlock: bigint;
    beaconRound: bigint;
    seed: Hex;
  },
): Promise<Hex> {
  const { lottery } = requireAddresses();
  return walletClient.writeContract({
    address: lottery,
    abi: lotteryAbi,
    functionName: "createDrawAndReveal",
    args: [
      args.participantsRoot,
      args.participantCount,
      args.prizeSpecHash,
      args.specHash,
      args.winnerCount,
      args.revealBlock,
      args.beaconRound,
      args.seed,
    ],
    account,
    chain,
  });
}

export async function finalizeDraw(
  walletClient: WalletClient,
  account: Address,
  drawId: bigint,
  beaconSignature: Hex,
): Promise<Hex> {
  const { lottery } = requireAddresses();
  return walletClient.writeContract({
    address: lottery,
    abi: lotteryAbi,
    functionName: "finalizeDraw",
    args: [drawId, beaconSignature],
    account,
    chain,
  });
}

export function parseDrawCreated(
  receipt: TransactionReceipt,
): { drawId: bigint; requestId: bigint } | undefined {
  const logs = parseEventLogs({
    abi: lotteryAbi,
    eventName: "DrawCreated",
    logs: receipt.logs,
  });
  const first = logs[0];
  if (!first) return undefined;
  const args = first.args as { drawId?: bigint; requestId?: bigint };
  if (args.drawId === undefined || args.requestId === undefined) {
    return undefined;
  }
  return { drawId: args.drawId, requestId: args.requestId };
}
