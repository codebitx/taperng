import type { Abi } from "viem";
import TapeOutCPUAbiJson from "./abi/TapeOutCPU.json";
import TapeRNGAbiJson from "./abi/TapeRNG.json";

export const tapeRngAbi = TapeRNGAbiJson as Abi;
export const tapeOutCpuAbi = TapeOutCPUAbiJson as Abi;