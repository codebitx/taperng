import { bls12_381 } from "@noble/curves/bls12-381.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, type Hex } from "viem";

/** drand quicknet public parameters (unchained, BLS12-381, 3s). */
export const DRAND_QUICKNET = {
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey:
    "0x83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a" as Hex,
  genesisTime: 1_692_803_367,
  period: 3,
  scheme: "bls-unchained-g1-rfc9380",
  dst: "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
} as const;

export const DRAND_ENDPOINTS = [
  "https://api.drand.sh",
  "https://api2.drand.sh",
  "https://api3.drand.sh",
  "https://drand.cloudflare.com",
] as const;

export interface DrandBeacon {
  round: number;
  randomness: Hex;
  signature: Hex;
}

export interface DrandVerification {
  ok: boolean;
  randomness: Hex;
  error?: string;
}

export function roundTime(round: number | bigint): number {
  return (
    DRAND_QUICKNET.genesisTime +
    Number(BigInt(round) * BigInt(DRAND_QUICKNET.period))
  );
}

export function roundAt(timestamp: number | bigint): number {
  const ts = Number(timestamp);
  if (ts < DRAND_QUICKNET.genesisTime) return 0;
  return Math.floor((ts - DRAND_QUICKNET.genesisTime) / DRAND_QUICKNET.period);
}

function roundBytes(round: number | bigint): Uint8Array {
  const out = new Uint8Array(8);
  let value = BigInt(round);
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  if (value !== 0n) throw new Error("round does not fit uint64");
  return out;
}

/**
 * Verify a drand quicknet beacon entirely offline.
 * Message = sha256(uint64_be(round)); randomness = sha256(signature).
 */
export function verifyBeacon(beacon: DrandBeacon): DrandVerification {
  try {
    if (!Number.isSafeInteger(beacon.round) || beacon.round < 0) {
      return { ok: false, randomness: "0x", error: "invalid round" };
    }
    if (hexToBytes(beacon.signature).length !== 48) {
      return { ok: false, randomness: "0x", error: "signature must be 48 bytes" };
    }
    const message = sha256(roundBytes(beacon.round));
    const messagePoint = bls12_381.shortSignatures.hash(
      message,
      DRAND_QUICKNET.dst,
    );
    const ok = bls12_381.shortSignatures.verify(
      hexToBytes(beacon.signature),
      messagePoint,
      hexToBytes(DRAND_QUICKNET.publicKey),
    );
    const randomness = bytesToHex(sha256(hexToBytes(beacon.signature)));
    if (!ok) return { ok: false, randomness, error: "invalid BLS signature" };
    if (randomness.toLowerCase() !== beacon.randomness.toLowerCase()) {
      return { ok: false, randomness, error: "randomness does not match sha256(signature)" };
    }
    return { ok: true, randomness };
  } catch (error) {
    return {
      ok: false,
      randomness: "0x",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchBeacon(
  round: number | bigint | "latest",
  endpoints: readonly string[] = DRAND_ENDPOINTS,
): Promise<DrandBeacon> {
  const path = round === "latest" ? "public/latest" : `public/${round.toString()}`;
  const errors: string[] = [];
  for (const endpoint of endpoints) {
    const url = `${endpoint.replace(/\/$/, "")}/${DRAND_QUICKNET.chainHash}/${path}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`);
        continue;
      }
      const json = (await response.json()) as Record<string, unknown>;
      const beacon: DrandBeacon = {
        round: Number(json.round),
        randomness: (`0x${String(json.randomness).replace(/^0x/, "")}`) as Hex,
        signature: (`0x${String(json.signature).replace(/^0x/, "")}`) as Hex,
      };
      if (!Number.isSafeInteger(beacon.round) || beacon.round < 0) {
        errors.push(`${url}: invalid round`);
        continue;
      }
      return beacon;
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`unable to fetch drand beacon: ${errors.join("; ")}`);
}

export function validateBeaconShape(value: unknown): value is DrandBeacon {
  if (!value || typeof value !== "object") return false;
  const beacon = value as Record<string, unknown>;
  return (
    typeof beacon.round === "number" &&
    Number.isSafeInteger(beacon.round) &&
    beacon.round >= 0 &&
    typeof beacon.randomness === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(beacon.randomness) &&
    typeof beacon.signature === "string" &&
    /^0x[0-9a-fA-F]{96}$/.test(beacon.signature)
  );
}
