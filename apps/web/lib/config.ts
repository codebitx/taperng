import { defineChain, isAddress, type Address } from "viem";

export const xlayerMainnet = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.xlayer.tech"] },
  },
  blockExplorers: {
    default: {
      name: "X Layer Explorer",
      url: "https://www.okx.com/web3/explorer/xlayer",
    },
  },
});

export type BeaconMode = "drand" | "mock" | "none";
export type CircuitMode = "tapeout" | "mock";

// 对外发布统一以 X Layer 主网(196) 为准。anvil/testnet 仅作内部合约调试，
// 不参与前端运行（见 taperng/contracts/anvil/）。
export const chain = xlayerMainnet;
export const chainId = chain.id;

export const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.xlayer.tech";

function optionalAddress(value: string | undefined): Address | undefined {
  if (!value || !isAddress(value)) return undefined;
  if (value.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    return undefined;
  }
  return value;
}

export const lotteryAddress = optionalAddress(
  process.env.NEXT_PUBLIC_LOTTERY_ADDRESS,
);
export const tapeRngAddress = optionalAddress(
  process.env.NEXT_PUBLIC_TAPE_RNG_ADDRESS,
);
export const deployBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");
export const beaconMode = (process.env.NEXT_PUBLIC_BEACON_MODE ??
  "mock") as BeaconMode;
export const circuitMode = (process.env.NEXT_PUBLIC_CIRCUIT_MODE ??
  "mock") as CircuitMode;

export const isConfigured = Boolean(lotteryAddress && tapeRngAddress);

export const explorerBase = chain.blockExplorers?.default.url;

export function txUrl(hash: string): string | undefined {
  return explorerBase ? `${explorerBase}/tx/${hash}` : undefined;
}

export function addressUrl(address: string): string | undefined {
  return explorerBase ? `${explorerBase}/address/${address}` : undefined;
}
