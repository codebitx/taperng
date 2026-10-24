import { NextResponse } from "next/server";
import {
  beaconMode,
  chain,
  chainId,
  circuitMode,
  isConfigured,
  lotteryAddress,
  rpcUrl,
  tapeRngAddress,
} from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    chainId,
    chainName: chain.name,
    rpcUrl,
    lotteryAddress: lotteryAddress ?? null,
    tapeRngAddress: tapeRngAddress ?? null,
    beaconMode,
    circuitMode,
    isConfigured,
  });
}
