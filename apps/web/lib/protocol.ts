import {
  concat,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";

export type Locale = "en" | "zh";

export interface PrizeInput {
  name: string;
  quantity: number;
}

export interface Participant {
  index: number;
  name: string;
}

export interface FlattenedPrize {
  slot: number;
  name: string;
}

export interface BuildDrawInput {
  name: string;
  participantCount: number;
  prizes: PrizeInput[];
  locale: Locale;
  chainId: number;
  lottery: Address;
}

export interface BuiltDraw {
  participants: Participant[];
  leaves: Hex[];
  participantsRoot: Hex;
  prizes: FlattenedPrize[];
  winnerCount: number;
  prizeSpecHash: Hex;
  specHash: Hex;
  spec: Record<string, unknown>;
  canonicalSpec: string;
}

/** Deterministic JSON: object keys sorted recursively, arrays preserved. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      output[key] = sortValue(input[key]);
    }
    return output;
  }
  return value;
}

export function hashCanonical(value: unknown): Hex {
  return keccak256(toBytes(canonicalJson(value)));
}

export function generateParticipants(
  count: number,
  // 参与者 id 固定为 ASCII 技术标识（不含语言/中文），使同 count 下的叶子与 root 跨语言一致。
  // 语言仍由 buildDraw 的 locale 控制展示层；此处不随语言变化。
  _locale: Locale,
): Participant[] {
  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    throw new Error("participant count must be an integer in [1, 5000]");
  }
  return Array.from({ length: count }, (_, index) => ({
    index,
    name: `Participant ${String(index + 1).padStart(3, "0")}`,
  }));
}

export function participantLeaf(participant: Participant): Hex {
  return keccak256(
    toBytes(
      canonicalJson({ i: participant.index, name: participant.name }),
    ),
  );
}

/** Sorted-pair Merkle root; an odd node is promoted unchanged. */
export function merkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) {
    return keccak256(new Uint8Array());
  }
  let layer = [...leaves];
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i]!;
      const b = layer[i + 1];
      if (b === undefined) {
        next.push(a);
        continue;
      }
      const [left, right] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
      next.push(keccak256(concat([left, right])));
    }
    layer = next;
  }
  return layer[0]!;
}

export function flattenPrizes(prizes: PrizeInput[]): FlattenedPrize[] {
  const flattened: FlattenedPrize[] = [];
  for (const prize of prizes) {
    if (!prize.name.trim() || prize.quantity < 1) continue;
    for (let i = 0; i < prize.quantity; i += 1) {
      flattened.push({ slot: flattened.length, name: prize.name.trim() });
    }
  }
  return flattened;
}

export function buildDraw(input: BuildDrawInput): BuiltDraw {
  const participants = generateParticipants(
    input.participantCount,
    input.locale,
  );
  const leaves = participants.map(participantLeaf);
  const participantsRoot = merkleRoot(leaves);
  const prizes = flattenPrizes(input.prizes);
  const winnerCount = prizes.length;

  if (winnerCount < 1) throw new Error("add at least one prize");
  if (winnerCount > input.participantCount) {
    throw new Error("prize slots cannot exceed participant count");
  }
  if (winnerCount > 100) {
    throw new Error("the demo supports at most 100 winners");
  }

  const prizeSpec = {
    version: "taperng-prizes-v1",
    prizes,
  };
  const prizeSpecHash = hashCanonical(prizeSpec);

  const spec = {
    version: "taperng-draw-v1",
    chainId: input.chainId,
    lottery: input.lottery,
    name: input.name.trim(),
    participantsRoot,
    participantCount: input.participantCount,
    winnerCount,
    prizes,
    rules: "One prize per winner. Prizes are metadata only; no on-chain settlement.",
  };
  const specHash = hashCanonical(spec);

  return {
    participants,
    leaves,
    participantsRoot,
    prizes,
    winnerCount,
    prizeSpecHash,
    specHash,
    spec,
    canonicalSpec: canonicalJson(spec),
  };
}

export function randomSeed(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export function shortHash(value: string, size = 6): string {
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function prizeLabel(prize: FlattenedPrize): string {
  return prize.name;
}
