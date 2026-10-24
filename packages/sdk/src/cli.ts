#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { createPublicClient, http, type Address } from "viem";
import { createTapeRNG, type CoreProof } from "./client";

const program = new Command();

program
  .name("taperng")
  .description("TapeRNG proof verification CLI")
  .version("0.1.0");

program
  .command("verify")
  .description("verify a taperng-rng-proof-v1 JSON file")
  .argument("<file>", "proof JSON file")
  .option("--json", "print machine-readable JSON", false)
  .action((file: string, options: { json?: boolean }) => {
    const proof = JSON.parse(readFileSync(file, "utf8")) as CoreProof;
    if (!proof.contracts?.tapeRng) {
      throw new Error("proof.contracts.tapeRng missing");
    }
    const dummyClient = createPublicClient({
      transport: http("http://127.0.0.1:1"),
    });
    const client = createTapeRNG({
      publicClient: dummyClient,
      addresses: {
        tapeRng: proof.contracts.tapeRng as Address,
      },
      chainId: proof.chainId,
    });
    const result = client.verifyProof(proof);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const check of result.checks) {
        console.log(`${check.ok ? "✓" : "×"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
      }
      console.log(result.ok ? "PROOF OK" : "PROOF FAILED");
    }
    if (!result.ok) process.exitCode = 1;
  });

program.parse();