import { describe, expect, it } from "vitest";
import vectors from "./fixtures/tap02-vectors.json";
import {
  decode,
  encode,
  evalNetlist,
  IllFormedError,
  load,
  pack,
  stepNetlist,
  unpack,
  type Netlist,
} from "../src/netlist.js";
import type { Hex } from "viem";

type RefVector = {
  cpu: Hex;
  id: number;
  nIn: number;
  nOut: number;
  netlist: Hex;
};

/** TAP-02 vectors use bare hex; viem requires 0x. */
function toHex(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function bare(value: string): string {
  return value.replace(/^0x/, "");
}

function resolverFor(refs: RefVector[]) {
  const cache = new Map<string, Netlist>();
  const resolve = (cpu: Hex, id: bigint): Netlist | undefined => {
    const key = `${cpu.toLowerCase()}:${id.toString()}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const ref = refs.find((entry) => entry.cpu.toLowerCase() === cpu.toLowerCase() && BigInt(entry.id) === id);
    if (!ref) return undefined;
    const sub = load(ref.netlist, ref.nIn, ref.nOut, resolve);
    cache.set(key, sub);
    return sub;
  };
  return resolve;
}

describe("TAP-02 netlist interpreter", () => {
  it("decodes and re-encodes every valid vector byte-for-byte", () => {
    for (const vector of vectors.valid) {
      const elements = decode(vector.netlist as Hex, vector.nIn);
      expect(encode(elements)).toBe(vector.netlist);
    }
  });

  it("evaluates every valid combinational truth table", () => {
    for (const vector of vectors.valid) {
      const circuit = load(
        vector.netlist as Hex,
        vector.nIn,
        vector.nOut,
        resolverFor(vector.refs as RefVector[]),
      );
      expect(circuit.nState).toBe(vector.nState);
      for (const row of vector.truthTable ?? []) {
        expect(bare(evalNetlist(circuit, toHex(row.inputs)))).toBe(row.outputs);
      }
    }
  });

  it("evaluates every valid stateful beat", () => {
    for (const vector of vectors.valid) {
      if (!("beats" in vector) || !vector.beats) continue;
      const circuit = load(
        vector.netlist as Hex,
        vector.nIn,
        vector.nOut,
        resolverFor(vector.refs as RefVector[]),
      );
      expect(circuit.nState).toBe(vector.nState);
      for (const beat of vector.beats) {
        const result = stepNetlist(circuit, toHex(beat.state), toHex(beat.inputs));
        expect(bare(result.newState)).toBe(beat.newState);
        expect(bare(result.outputs)).toBe(beat.outputs);
      }
    }
  });

  it("matches the packing edge cases", () => {
    const vector = vectors.valid.find((entry) => entry.name === "nand")!;
    const circuit = load(vector.netlist as Hex, vector.nIn, vector.nOut);
    for (const testCase of vectors.packingEdgeCases.cases) {
      expect(bare(evalNetlist(circuit, toHex(testCase.inputs)))).toBe(testCase.outputs);
    }
  });

  it("packs and unpacks LSB-first", () => {
    expect(unpack("0x03", 2)).toEqual([1, 1]);
    expect(unpack("0xff", 2)).toEqual([1, 1]);
    expect(unpack("0x03aa", 2)).toEqual([1, 1]);
    expect(unpack("0x", 2)).toEqual([0, 0]);
    expect(pack([1, 1])).toBe("0x03");
    expect(pack([1, 0, 1])).toBe("0x05");
  });

  it("rejects ill-formed netlists", () => {
    for (const vector of vectors.illFormed) {
      expect(() =>
        load(vector.netlist as Hex, vector.nIn, vector.nOut, resolverFor((vector.refs ?? []) as RefVector[])),
      ).toThrow(IllFormedError);
    }
  });
});
