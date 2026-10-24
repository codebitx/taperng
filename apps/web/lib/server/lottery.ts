import {
  encodeAbiParameters,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import type { Draw } from "../contracts";

/**
 * 抽奖领域层（apps/web demo 消费者）——放在前端，不进通用 SDK。
 *
 * 只有两件事：
 * - 抽奖 context 摘要（把 draw 的 participantsRoot/人数/中奖名额/奖池/spec 绑定成
 *   喂给核心 TapeRNG 的盲 contextHash，让随机数请求绑定这场抽奖）；
 * - 由 finalSeed 派生出 winners / prizeSlots 并核对链上结果。
 *
 * 核心随机数推导（commitment → preSeed → circuitMix → finalSeed）已由
 * taperng-sdk 提供，这里不复刻。
 */
const D_CONTEXT = keccak256(toBytes("TapeRNG-v1/context"));
const D_SHUFFLE = keccak256(toBytes("TapeRNG-v1/shuffle"));
const D_PRIZE = keccak256(toBytes("TapeRNG-v1/prize"));

export interface LotteryDeriveCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

/** 抽奖 context：把 draw 字段绑定进随机数请求的盲摘要。 */
export function lotteryContextHash(
  chainId: number,
  lottery: Address,
  draw: Pick<
    Draw,
    | "participantsRoot"
    | "participantCount"
    | "winnerCount"
    | "prizeSpecHash"
    | "specHash"
  >,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "uint32" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        D_CONTEXT,
        BigInt(chainId),
        lottery,
        draw.participantsRoot,
        draw.participantCount,
        draw.winnerCount,
        draw.prizeSpecHash,
        draw.specHash,
      ],
    ),
  );
}

function uniform(
  domain: Hex,
  seed: Hex,
  index: number,
  range: number,
): number {
  const max = 2n ** 256n - 1n;
  const limit = max - (max % BigInt(range));
  let attempt = 0;
  while (true) {
    const word = BigInt(
      keccak256(
        encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "bytes32" },
            { type: "uint32" },
            { type: "uint32" },
          ],
          [domain, seed, index, attempt],
        ),
      ),
    );
    if (word < limit) return Number(word % BigInt(range));
    attempt += 1;
    if (attempt > 1_000_000) {
      throw new Error("rejection sampling did not converge");
    }
  }
}

export function shuffleWinners(
  seed: Hex,
  participantCount: number,
  winnerCount: number,
): number[] {
  if (winnerCount > participantCount) {
    throw new Error("winnerCount > participantCount");
  }
  const arr = Array.from({ length: participantCount }, (_, i) => i);
  const winners: number[] = [];
  for (let i = 0; i < winnerCount; i += 1) {
    const range = participantCount - i;
    const j = i + uniform(D_SHUFFLE, seed, i, range);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    winners.push(arr[i]!);
  }
  return winners;
}

export function shufflePrizeSlots(seed: Hex, winnerCount: number): number[] {
  const slots = Array.from({ length: winnerCount }, (_, i) => i);
  if (winnerCount <= 1) return slots;
  for (let i = winnerCount - 1; i > 0; i -= 1) {
    const range = i + 1;
    const j = uniform(D_PRIZE, seed, i, range);
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  return slots;
}

function sameArray(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export interface LotteryChecksInput {
  finalSeed: Hex;
  participantCount: number;
  winnerCount: number;
  winners: readonly number[];
  prizeSlots: readonly number[];
}

/** 由最终随机数派生 winners / prizeSlots，与链上结果比对（抽奖领域校验）。 */
export function lotteryChecks(input: LotteryChecksInput): LotteryDeriveCheck[] {
  const winners = shuffleWinners(
    input.finalSeed,
    input.participantCount,
    input.winnerCount,
  );
  const prizeSlots = shufflePrizeSlots(input.finalSeed, input.winnerCount);
  return [
    {
      name: "winner selection",
      ok: sameArray(winners, input.winners),
    },
    {
      name: "prize slot permutation",
      ok: sameArray(prizeSlots, input.prizeSlots),
    },
  ];
}