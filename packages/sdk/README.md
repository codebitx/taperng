# taperng-sdk

**Verifiable randomness on X Layer, driven by a TapeOut circuit.**

`taperng-sdk` is a small, request-centered TypeScript SDK for the
[TapeRNG](https://tape.futool.com) on-chain randomness primitive. It lets you
request a random value on X Layer, reveal a secret seed, finalize it against a
drand quicknet beacon and a TapeOut circuit, and — most importantly —
**re-derive and prove** every step offline so the final random seed can be
independently verified.

The SDK is deliberately **generic**: it has no opinion about lotteries, draws,
winners or prize selection. A caller supplies a `contextHash` (e.g. to bind the
request to a specific consumer domain); the SDK treats it as an opaque
`bytes32`, mixes it into the derivation, and verifies that what was registered
on-chain matches what the caller expects. Any domain logic downstream of
`finalSeed` (shuffling, ranking, …) is yours to build on top.

---

## Highlights

- **Commit–reveal** with an organization commitment.
- **Hybrid entropy**: drand **quicknet** beacon + X Layer **blockhash**, further
  mixed through a **TapeOut circuit** (Keccak netlist replayed on a real CPU).
- **Nine-check proof**: `getProof(requestId)` assembles the full request,
  circuit output, beacon and derivation; `verifyProof(proof)` replays every step,
  including offline **TAP-02 netlist** evaluation.
- **Flashblock-safe receipt waiting**: polls `eth_getTransactionReceipt` instead
  of viem's `waitForTransactionReceipt`, which can fail on X Layer's ~200 ms
  pre-confirmations with `block is out of range`.
- **Zero chain-write side effects** when verifying — everything can be checked
  read-only against public state.

---

## Install

```bash
pnpm add taperng-sdk
# or
npm install taperng-sdk
```

> **Transition note (unpublished):** until the package is on npm, the web demo
> links the local package via `workspace:*`. The API below is identical either
> way; once published, only the version string changes.

### Requirements

- **Node.js** — the SDK ships TypeScript source (`main` → `src/index.ts`). To
  import it directly you need a TS-capable runtime/bundler:
  - **Next.js**: add `taperng-sdk` to `transpilePackages` in
    `next.config.mjs`, or
  - Node 22+ with `--experimental-strip-types` / `--import tsx`.
- **viem** (`^2`) as a peer — you pass in `PublicClient` / `WalletClient`
  instances; the SDK does not manage the provider.

---

## Quick start

> Requires a `TapeRNG` contract address on an X Layer-compatible chain. See
> [Addresses](#mainnet-contract-addresses).

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createTapeRNG } from "taperng-sdk";
import { xlayerMainnet } from "./your-chain";

const account = privateKeyToAccount("0x…yourPrivateKey…");

const rng = createTapeRNG({
  publicClient: createPublicClient({
    chain: xlayerMainnet,
    transport: http("https://rpc.xlayer.tech"),
  }),
  walletClient: createWalletClient({
    account,
    chain: xlayerMainnet,
    transport: http("https://rpc.xlayer.tech"),
  }),
  addresses: { tapeRng: "0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce" },
  chainId: 196,
});
```

### 1. Create a request

```ts
const { requestId, seed, commit, revealBlock, beaconRound } =
  await rng.createRequest({
    contextHash, // opaque bytes32, e.g. bind to your consumer domain
    specHash,    // optional reference to an external spec (also opaque)
    revealBlock,
    beaconRound,
    circuitId: 3n,       // TapeOut Keccak circuit
    cpu: "0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb", // optional override
    revealer: account.address, // defaults to wallet account
  });
```

`createRequest` computes the commitment, sends `TapeRNG.createRequest` (the
commit and the request are one transaction) and returns the parsed
`RequestCreated` event. `revealBlock` / `beaconRound` default to a tight,
viable schedule via `planReveal` — or pass your own.

### 2. Reveal the seed

```ts
await rng.reveal(requestId, seed);
```

### 3. Finalize

```ts
await rng.finalize(requestId); // fetches the beacon automatically if needed
```

`finalize` calls `TapeRNG.finalize`, which mixes the blockhash + drand beacon
through the TapeOut circuit and persists `finalSeed`.

### 4. Prove / verify (read-only)

```ts
const proof = await rng.getProof(requestId);   // page-proof JSON
const { ok, checks } = rng.verifyProof(proof); // offline replay
console.log(ok, checks.map((c) => `${c.name}: ${c.ok ? "PASS" : "FAIL"}`));
```

---

## API reference

All methods below come from `createTapeRNG(config)` and are collected on the
returned `TapeRNGClient`.

### Config

```ts
createTapeRNG({
  publicClient,      // viem PublicClient
  walletClient?,     // viem WalletClient — required to write (create/reveal/finalize)
  addresses: { tapeRng, cpu? },
  chainId,
  chain?,            // chain passed to wallet writes
  beaconMode?,       // "drand" (default) | "none"
  circuitMode?,      // "tapeout" (default) | "mock"
})
```

### `planReveal(currentBlock, now?) → PlanRevealResult`

Computes a tight, viable reveal schedule from the latest drand quicknet beacon:
picks a future beacon round (respecting the on-chain `beaconTime > now + 60`
floor) and returns the matching `revealBlock`.

```ts
{ beaconRound: bigint; beaconTime: number; revealBlock: bigint }
```

### `createRequest(input) → CreateRequestResult`

Creates and reveals a randomness request in one transaction.

```ts
createRequest({
  contextHash: Hex,     // opaque bytes32; mixed into pre-seed & verified
  specHash?: Hex,       // opaque reference
  seed?: Hex,           // defaults to a fresh random seed
  revealBlock?: bigint, // defaults to planReveal().revealBlock
  beaconRound?: bigint, // defaults to planReveal().beaconRound
  cpu?: Address,        // default addresses.cpu
  circuitId: bigint,
  revealer?: Address,   // default wallet account
  account?: Address,
})
// → { hash, requestId, commit, seed, contextHash, specHash, revealBlock, beaconRound, beaconTime }
```

### `reveal(requestId, seed, account?) → Hex`

Submits `TapeRNG.reveal(requestId, seed)`. Returns the transaction hash.

### `finalize(requestId, beaconSignature?, account?) → Hex`

Calls `TapeRNG.finalize`. When `beaconMode` is `"drand"` and no signature is
passed, it fetches the required beacon round automatically. Returns the
transaction hash. Note the on-chain **reveal window**: finalize must happen
before `revealBlock + 256` blocks (~4 min), or the request expires.

### `getRequest(requestId) → OnChainRequest`

Reads the full request struct from `TapeRNG.getRequest`, normalized to
JS-friendly numbers. Fields include `commit`, `contextHash`, `revealBlock`,
`beaconRound`, `cpu`, `circuitId`, `netlistHash`, `nIn`, `seedMissing`,
`fallbackBlockhash`, `beaconUsed`, `circuitUsed`, `organizerSeed`, `blockHash`,
`beaconRandomness`, `circuitMix`, `preSeed`, `finalSeed`, `status`.

### `getProof(requestId) → CoreProof`

Reads on-chain state and assembles an offline-verifiable proof (`taperng-rng-proof-v1`):

```ts
{
  version, chainId, requestId,
  contracts: { tapeRng, cpu? },
  context: { hash },          // the request's registered contextHash
  specHash,
  request,                     // normalized OnChainRequest
  circuit: { cpu, circuitId, netlistHash, nIn, nOut, netlist?, input?, output?, used, mode },
  beacon: { signature?, randomness? } | null,
  derivation,                  // DeriveResult (see below)
}
```

### `verifyProof(proof) → VerifyProofResult`

Replays the entire derivation offline and returns:

```ts
{ ok: boolean; checks: DeriveCheck[]; derivation: DeriveResult }
```

Checks (subset depends on the request state):
`context hash` · `organizer commitment` · `pre-seed` · `TapeOut circuit eval` ·
`TapeOut circuit skipped` · `final seed` · `drand randomness = sha256(signature)`
· `TAP-02 netlist replay` (when the proof carries the netlist, evaluated
entirely offline).

---

## Lower-level exports

Beyond the client, the SDK exports the core derivation and utilities in case you
want to build custom tooling.

### Derivation (`./derive`)

Pure re-implementations of the on-chain Solidity derivation, byte-for-byte. Do
**not** change the ABI-encode field order — the parity test locks them to the
chain.

| Export | Signature → Result | What it is |
|---|---|---|
| `commitment` | `(seed, context, provider, chainId, tapeRng)` → `Hex` | organization commitment for `seed + context`. |
| `preSeed` | `({chainId, tapeRng, requestId, context, request})` → `Hex` | mixes chain-id, request-id, context, blockhash, beacon, circuit into the pre-seed. |
| `circuitInput` | `(pre, nIn)` → `Hex` | truncates the pre-seed hash into the circuit's input bus. |
| `circuitMix` | `(circuitId, netlistHash, output)` → `Hex` | binds the circuit output + identity. |
| `finalSeed` | `(pre, mix, circuitUsed, seedMissing, fallbackBlockhash, beaconUsed)` → `Hex` | the final verifiable randomness. |
| `verifyDerivation` | `({chainId, tapeRng, requestId, revealer, contextHash, request, circuitOutput?, beaconSignature?})` → `DeriveResult` | re-derives and compares every step against the on-chain request. |

`DeriveResult` returns `{ ok, checks, contextHash, preSeed, circuitInput,
circuitOutput?, circuitMix, finalSeed }`.

`request` is a `DeriveRequest` — the subset of `getRequest` fields that
participate in derivation (`revealer`, `commit`, `contextHash`, `revealBlock`,
`beaconRound`, `cpu`, `circuitId`, `netlistHash`, `nIn`, `seedMissing`,
`fallbackBlockhash`, `beaconUsed`, `circuitUsed`, `organizerSeed`, `blockHash`,
`beaconRandomness`, `circuitMix`, `preSeed`, `finalSeed`).

### drand (`./drand`)

| Export | Notes |
|---|---|
| `DRAND_QUICKNET` | quicknet public parameters (BLS12-381, 3 s period). |
| `DRAND_ENDPOINTS` | default beacon API endpoints. |
| `roundTime(round)` / `roundAt(ts)` | round ↔ unix-time conversion. |
| `verifyBeacon(beacon)` | fully offline BLS verification; `randomness = sha256(signature)`. |
| `fetchBeacon(roundOrLatest, endpoints?)` | fetch a beacon with automatic endpoint fallback. |

### netlist (`./netlist`)

| Export | Notes |
|---|---|
| `load(data, nIn, nOut?)` / `encode`/`decode` | TAP-02 netlist parse/serialize. |
| `beat(circuit, inputs, state?)` | evaluate/step the circuit. |
| `evalNetlist` / `stepNetlist` | combinational / stateful evaluation helpers. |
| `pack`/`unpack` | bit indexing helpers. |

### protocol (`./protocol`)

| Export | Notes |
|---|---|
| `randomSeed()` → `Hex` | fresh cryptographically-random seed. |
| `canonicalJson(v)` / `hashCanonical(v)` | content-addressing helper. |
| `merkleRoot(leaves)` | Keccak Merkle root (e.g. for a participants list). |

### CLI (built-in `cli` script)

The proof verifier is exposed as an npm script rather than a binary (there is no
`bin` field yet — add one if you want a global `taperng` command):

```bash
# from the package / workspace root
pnpm cli verify ./proof.json            # human-readable check-by-check report
pnpm cli verify ./proof.json --json     # machine-readable JSON output
```

`verify` re-plays the proof offline (read-only; needs no keys and makes no
network reads beyond the proof file itself) and exits non-zero on failure.

---

## Mainnet contract addresses

| Contract | Address |
|---|---|
| **TapeRNG** (core) | `0x3fad14280A850dd31De8c7A83172Ded8BE717Ce` |
| **TapeOut CPU** (Keccak) | `0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb` (circuitId `3`, nIn `24`) |
| **drand beacon** | `0xa9c170404CaAa16BEff7bBc2AF8c2d0D428d7289` |

Chain: **X Layer** mainnet (chainId `196`), RPC `https://rpc.xlayer.tech`.

---

## Security & trust model

- X Layer TapeOut factory / beacon / hub are **not sealed** and have not been
  independently audited. Verify chain state before relying on it.
- This SDK does not ship a hardware/chain RNG by itself — it mixes public
  sources (blockhash + drand) through a deterministic circuit. It is designed
  for **public, verifiable randomness**, not for private-unpredictability
  randomness.
- When cross-checking, always re-derive from the **on-chain request struct**
  (`finalSeed`) rather than trusting a served proof blindly; `verifyProof` is the
  offline golden path.

---

## Pre-publish checklist

Before this package ships to npm:

- [ ] **Set `"private": false`** (it is currently `true`, which blocks `publish`).
- [ ] **Move `viem` to `peerDependencies`** (the consumer provides
      `PublicClient`/`WalletClient`; it should not be a hard dependency).
- [ ] **Decide the publish target**: either
      - ship `src` (TS source) as-is and document the TS-node/transpile
        requirement, or
      - add a compile step emitting `dist/` and point `main`/`types` at
        `./dist/index.js` / `./dist/index.d.ts`.
- [ ] **Add metadata**: `license`, `repository`, `keywords`, `description`.
- [ ] **Add a `files` allowlist** (e.g. `src`, `dist`) to keep the tarball small,
      and confirm `README.md` is included so the npm package page is populated.
- [ ] Publish with `npm publish` (or `pnpm publish`).

## License

Apache-2.0 (to be finalized in `package.json`). Not for production use until the
audit checklist above is complete.