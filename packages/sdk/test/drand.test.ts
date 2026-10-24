import { describe, expect, it } from "vitest";
import {
  DRAND_QUICKNET,
  roundAt,
  roundTime,
  validateBeaconShape,
  verifyBeacon,
  type DrandBeacon,
} from "../src/drand.js";
import type { Hex } from "viem";

const ROUND_ONE: DrandBeacon = {
  round: 1,
  randomness: "0x1466a6cd24e327188770752f6134001c64d6efcc590ccc26b721611ad96f165a",
  signature:
    "0xb55e7cb2d5c613ee0b2e28d6750aabbb78c39dcc96bd9d38c2c2e12198df95571de8e8e402a0cc48871c7089a2b3af4b" as Hex,
};

describe("drand quicknet offline verification", () => {
  it("verifies the known round 1 vector and derives sha256(signature)", () => {
    const result = verifyBeacon(ROUND_ONE);
    expect(result.ok).toBe(true);
    expect(result.randomness).toBe(ROUND_ONE.randomness);
  });

  it("rejects a tampered signature", () => {
    const tampered = {
      ...ROUND_ONE,
      signature: (`0x${ROUND_ONE.signature.slice(2, -2)}00`) as Hex,
    };
    expect(verifyBeacon(tampered).ok).toBe(false);
  });

  it("rejects a mismatched randomness field", () => {
    const bad = {
      ...ROUND_ONE,
      randomness: `0x${"00".repeat(32)}` as Hex,
    };
    expect(verifyBeacon(bad).ok).toBe(false);
  });

  it("uses the quicknet genesis and 3-second period", () => {
    expect(DRAND_QUICKNET.genesisTime).toBe(1_692_803_367);
    expect(DRAND_QUICKNET.period).toBe(3);
    expect(roundTime(1)).toBe(1_692_803_370);
    expect(roundAt(1_692_803_370)).toBe(1);
    expect(roundAt(DRAND_QUICKNET.genesisTime - 1)).toBe(0);
  });

  it("validates beacon JSON shape", () => {
    expect(validateBeaconShape(ROUND_ONE)).toBe(true);
    expect(validateBeaconShape({ round: 1 })).toBe(false);
    expect(validateBeaconShape({ ...ROUND_ONE, signature: "0x00" })).toBe(false);
  });
});
