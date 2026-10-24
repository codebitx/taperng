import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import fixture from "./fixtures/parity.json";
import {
  circuitInput,
  circuitMix,
  commitment,
  finalSeed,
  preSeed,
  type DeriveRequest,
} from "../src/derive";

/**
 * SolidWorks 对拍：核心派生（commitment → preSeed → circuitMix → finalSeed）
 * 必须与 Solidity TapeRNGLib 一致。人工生成 contextHash 作为盲值传入（领域层
 * 生成的摘要，本测试直接采用 fixture 里的 contextHash）。
 */
describe("Solidity parity fixture", () => {
  const context = fixture.contextHash as Hex;
  const requestId = 1n;

  const request: DeriveRequest = {
    revealer: fixture.organizer as Address,
    commit: fixture.commitment as Hex,
    contextHash: fixture.contextHash as Hex,
    revealBlock: 0n,
    beaconRound: BigInt(fixture.beaconRound),
    cpu: fixture.cpu as Address,
    circuitId: 3n,
    netlistHash: fixture.netlistHash as Hex,
    nIn: 24,
    seedMissing: false,
    fallbackBlockhash: false,
    beaconUsed: true,
    circuitUsed: true,
    organizerSeed: fixture.organizerSeed as Hex,
    blockHash: fixture.blockHash as Hex,
    beaconRandomness: fixture.beaconRandomness as Hex,
    circuitMix: fixture.circuitMix as Hex,
    preSeed: fixture.preSeed as Hex,
    finalSeed: fixture.finalSeed as Hex,
  };

  it("commitment matches Solidity (context passed as blind hash)", () => {
    expect(
      commitment(
        fixture.organizerSeed as Hex,
        context,
        fixture.organizer as Address,
        fixture.chainId,
        fixture.tapeRng as Address,
      ),
    ).toBe(fixture.commitment);
  });

  it("pre-seed, circuit input/mix and final seed match Solidity", () => {
    expect(
      preSeed({
        chainId: fixture.chainId,
        tapeRng: fixture.tapeRng as Address,
        requestId,
        context,
        request,
      }),
    ).toBe(fixture.preSeed);
    expect(circuitInput(fixture.preSeed as Hex, 24)).toBe(
      fixture.circuitInput,
    );
    expect(
      circuitMix(3n, fixture.netlistHash as Hex, "0xf6ec15"),
    ).toBe(fixture.circuitMix);
    expect(
      finalSeed(
        fixture.preSeed as Hex,
        fixture.circuitMix as Hex,
        true,
        false,
        false,
        true,
      ),
    ).toBe(fixture.finalSeed);
  });
});