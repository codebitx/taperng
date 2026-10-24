import type { Hex } from "viem";

export const DRAND_QUICKNET = {
  chainHash:
    "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesisTime: 1_692_803_367,
  period: 3,
} as const;

const ENDPOINTS = [
  "https://api.drand.sh",
  "https://api2.drand.sh",
  "https://api3.drand.sh",
  "https://drand.cloudflare.com",
] as const;

export interface Beacon {
  round: number;
  randomness: Hex;
  signature: Hex;
}

export function roundTime(round: number): number {
  return DRAND_QUICKNET.genesisTime + round * DRAND_QUICKNET.period;
}

export function roundAt(timestamp: number): number {
  if (timestamp < DRAND_QUICKNET.genesisTime) return 0;
  return Math.floor(
    (timestamp - DRAND_QUICKNET.genesisTime) / DRAND_QUICKNET.period,
  );
}

export async function fetchBeacon(
  round: number | "latest",
): Promise<Beacon> {
  const path = round === "latest" ? "public/latest" : `public/${round}`;
  const errors: string[] = [];
  for (const endpoint of ENDPOINTS) {
    const url = `${endpoint}/${DRAND_QUICKNET.chainHash}/${path}`;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`);
        continue;
      }
      const json = (await response.json()) as Record<string, unknown>;
      const parsed = {
        round: Number(json.round),
        randomness: `0x${String(json.randomness).replace(/^0x/, "")}` as Hex,
        signature: `0x${String(json.signature).replace(/^0x/, "")}` as Hex,
      };
      if (
        !Number.isSafeInteger(parsed.round) ||
        parsed.round < 0 ||
        !/^0x[0-9a-fA-F]{64}$/.test(parsed.randomness) ||
        !/^0x[0-9a-fA-F]{96}$/.test(parsed.signature)
      ) {
        errors.push(`${url}: malformed beacon`);
        continue;
      }
      return parsed;
    } catch (error) {
      errors.push(
        `${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(`unable to fetch drand beacon: ${errors.join("; ")}`);
}
