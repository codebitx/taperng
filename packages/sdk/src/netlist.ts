import { bytesToHex, hexToBytes, type Hex } from "viem";

/**
 * TAP-02 circuit netlist decoder and evaluator.
 * Strict TypeScript port of `.refs/TAPs/assets/tap-02/reference.py`.
 * Record fields are big-endian; packed bits are LSB-first.
 */

export const NAND = 0x00;
export const LATCH = 0x01;
export const REF = 0x02;

export const MAX_SIGNALS = 2 ** 24;
export const MAX_PINS = 2 ** 16;
export const MAX_GATES = 2 ** 32 - 1;

export type Op = typeof NAND | typeof LATCH | typeof REF;

export interface NetlistElement {
  op: Op;
  ins: number[];
  /** REF only: 20-byte processor address */
  cpu?: Hex;
  /** REF only */
  circuitId?: bigint;
  nOut: number;
  firstOut: number;
}

export interface Netlist {
  nIn: number;
  nOut: number;
  elements: NetlistElement[];
  nSignals: number;
  subs: Map<string, Netlist>;
  nState: number;
  nGates: number;
  stateBase: number[];
}

export class IllFormedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllFormedError";
  }
}

type BytesLike = Hex | Uint8Array;

function asBytes(data: BytesLike): Uint8Array {
  return typeof data === "string" ? hexToBytes(data) : data;
}

function readU24(data: Uint8Array, p: number): number {
  if (p + 3 > data.length) throw new IllFormedError(`truncated u24 at byte ${p}`);
  return (data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]!;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function u24(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new IllFormedError(`u24 out of range: ${value}`);
  }
  return new Uint8Array([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

export function decode(data: BytesLike, nIn: number): NetlistElement[] {
  const bytes = asBytes(data);
  let p = 0;
  let next = 2 + nIn;
  const elements: NetlistElement[] = [];

  const take = (k: number): Uint8Array => {
    if (p + k > bytes.length) throw new IllFormedError(`truncated record at byte ${p}`);
    const out = bytes.slice(p, p + k);
    p += k;
    return out;
  };

  while (p < bytes.length) {
    const op = take(1)[0]!;
    if (op === NAND) {
      const a = readU24(bytes, p);
      const b = readU24(bytes, p + 3);
      p += 6;
      elements.push({ op, ins: [a, b], nOut: 1, firstOut: next });
    } else if (op === LATCH) {
      const d = readU24(bytes, p);
      p += 3;
      elements.push({ op, ins: [d], nOut: 1, firstOut: next });
    } else if (op === REF) {
      const cpu = bytesToHex(take(20));
      const circuitId = bytesToBigInt(take(8));
      const nIns = take(1)[0]!;
      const nOuts = take(1)[0]!;
      const ins: number[] = [];
      for (let i = 0; i < nIns; i++) {
        ins.push(readU24(bytes, p));
        p += 3;
      }
      elements.push({ op, ins, cpu, circuitId, nOut: nOuts, firstOut: next });
    } else {
      throw new IllFormedError(
        `unknown opcode 0x${op.toString(16).padStart(2, "0")} at byte ${p - 1}`,
      );
    }
    next += elements[elements.length - 1]!.nOut;
  }
  return elements;
}

export function encode(elements: NetlistElement[]): Hex {
  const chunks: Uint8Array[] = [];
  for (const element of elements) {
    chunks.push(new Uint8Array([element.op]));
    if (element.op === REF) {
      if (!element.cpu || element.circuitId === undefined) {
        throw new IllFormedError("REF element missing cpu/circuitId");
      }
      const cpu = hexToBytes(element.cpu);
      if (cpu.length !== 20) throw new IllFormedError("REF cpu must be 20 bytes");
      let id = element.circuitId;
      const idBytes = new Uint8Array(8);
      for (let i = 7; i >= 0; i--) {
        idBytes[i] = Number(id & 0xffn);
        id >>= 8n;
      }
      chunks.push(cpu, idBytes, new Uint8Array([element.ins.length, element.nOut]));
    }
    for (const signal of element.ins) chunks.push(u24(signal));
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return bytesToHex(out);
}

export function circuitKey(cpu: Hex | string, circuitId: bigint | number): string {
  return `${cpu.toLowerCase()}:${circuitId.toString()}`;
}

export function load(
  data: BytesLike,
  nIn: number,
  nOut: number,
  resolve?: (cpu: Hex, circuitId: bigint) => Netlist | undefined,
): Netlist {
  const elements = decode(data, nIn);
  const nSignals = 2 + nIn + elements.reduce((sum, element) => sum + element.nOut, 0);

  if (nSignals > MAX_SIGNALS) throw new IllFormedError("more than 2^24 signals");
  if (!(nIn >= 0 && nIn <= MAX_PINS)) throw new IllFormedError("nIn out of range");
  if (!(nOut >= 1 && nOut <= MAX_PINS)) throw new IllFormedError("nOut out of range");
  if (nSignals - 2 - nIn < nOut) throw new IllFormedError("too few signals for outputs");

  const circuit: Netlist = {
    nIn,
    nOut,
    elements,
    nSignals,
    subs: new Map(),
    nState: 0,
    nGates: 0,
    stateBase: [],
  };

  for (const element of elements) {
    for (const signal of element.ins) {
      const limit = element.op === LATCH ? nSignals : element.firstOut;
      if (signal >= limit) {
        throw new IllFormedError(
          `signal ${signal} referenced by element at ${element.firstOut} is not available`,
        );
      }
    }
    circuit.stateBase.push(circuit.nState);
    if (element.op === LATCH) {
      circuit.nState += 1;
    } else if (element.op === REF) {
      if (!resolve) throw new IllFormedError("REF without a resolver");
      const sub = resolve(element.cpu!, element.circuitId!);
      if (!sub) throw new IllFormedError("REF target is not a registered circuit");
      if (sub.nIn !== element.ins.length || sub.nOut !== element.nOut) {
        throw new IllFormedError("REF arity does not match the target circuit");
      }
      if (sub.nState > MAX_SIGNALS) throw new IllFormedError("REF size");
      circuit.subs.set(circuitKey(element.cpu!, element.circuitId!), sub);
      circuit.nState += sub.nState;
      circuit.nGates += sub.nGates;
    }
  }
  circuit.nGates += elements.filter((element) => element.op !== REF).length;
  if (circuit.nState > MAX_SIGNALS || circuit.nGates > MAX_GATES) {
    throw new IllFormedError("size overflow");
  }
  return circuit;
}

export function beat(
  circuit: Netlist,
  state: number[],
  inputs: number[],
): { newState: number[]; outputs: number[] } {
  if (state.length !== circuit.nState) throw new Error("bad state length");
  if (inputs.length !== circuit.nIn) throw new Error("bad input length");

  const a: number[] = [0, 1, ...inputs];
  const newState = [...state];

  for (let i = 0; i < circuit.elements.length; i++) {
    const element = circuit.elements[i]!;
    const base = circuit.stateBase[i]!;
    if (element.op === NAND) {
      a.push(1 - (a[element.ins[0]!]! & a[element.ins[1]!]!));
    } else if (element.op === LATCH) {
      a.push(state[base]!);
    } else {
      const sub = circuit.subs.get(circuitKey(element.cpu!, element.circuitId!))!;
      const subResult = beat(
        sub,
        state.slice(base, base + sub.nState),
        element.ins.map((signal) => a[signal]!),
      );
      newState.splice(base, sub.nState, ...subResult.newState);
      a.push(...subResult.outputs);
    }
  }

  for (let i = 0; i < circuit.elements.length; i++) {
    const element = circuit.elements[i]!;
    if (element.op === LATCH) {
      newState[circuit.stateBase[i]!] = a[element.ins[0]!]!;
    }
  }

  return { newState, outputs: a.slice(a.length - circuit.nOut) };
}

export function pack(bits: number[]): Hex {
  const out = new Uint8Array((bits.length + 7) >> 3);
  bits.forEach((bit, i) => {
    if (bit) out[i >> 3]! |= 1 << (i & 7);
  });
  return bytesToHex(out);
}

export function unpack(data: BytesLike, n: number): number[] {
  const bytes = asBytes(data);
  const bits: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const byte = bytes[i >> 3] ?? 0;
    bits[i] = (byte >> (i & 7)) & 1;
  }
  return bits;
}

export function evalNetlist(circuit: Netlist, input: BytesLike): Hex {
  if (circuit.nState !== 0) throw new Error("circuit has state; use stepNetlist");
  return pack(beat(circuit, [], unpack(input, circuit.nIn)).outputs);
}

export function stepNetlist(
  circuit: Netlist,
  state: BytesLike,
  input: BytesLike,
): { newState: Hex; outputs: Hex } {
  const result = beat(circuit, unpack(state, circuit.nState), unpack(input, circuit.nIn));
  return { newState: pack(result.newState), outputs: pack(result.outputs) };
}
