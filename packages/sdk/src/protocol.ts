import { concat, keccak256, toBytes, type Hex } from "viem";

/**
 * 通用工具：确定性 canonical JSON、Merkle root、安全随机数。
 * 不含任何领域（抽奖/spec）语义。
 */

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

/** 32 字节 CSPRNG 随机数（用于 commit 前的秘密 seed）。 */
export function randomSeed(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}