# TapeRNG

[English](README.md) | [简体中文](README_zh.md)

> **Positioning** — Verifiable randomness infrastructure built on TapeOut circuits: it aggregates external entropy sources and produces random numbers and proofs that can be recomputed and verified on-chain.
>
> This is a reusable **infrastructure** (SDK / on-chain service) for developers in the X Layer / TapeOut ecosystem — **not** a lottery app. The TapeOut circuit itself produces no entropy; randomness comes from outside (organizer commit, drand beacon, future blockhash), and the circuit turns it into deterministic, recomputable, composable randomness. Unlike Chainlink VRF / Supra dVRF, it is TapeOut-native, circuit-replayable, low-cost and composable — not bound to a non-scriptable trusted party.

A verifiable randomness beacon/SDK for **X Layer**, built for the **X Layer TapeOut Developer Acceleration Program**.

**Live deployment (X Layer mainnet 196): https://tape.futool.com**

TapeRNG combines:

- **Organizer commit-reveal** — the organizer commits a 32-byte seed before the entropy is known.
- **drand quicknet** — a BLS12-381 threshold beacon, verified on-chain through X Layer's EIP-2537 precompiles.
- **Future X Layer blockhash** — a fixed `revealBlock` adds L2 entropy and a fallback path.
- **TapeOut Keccak-256 IP Core** — a deterministic, transparent mix layer whose netlist can be replayed by the SDK.
- **Unbiased multi-winner selection** — partial Fisher-Yates + rejection sampling, no duplicate winners.
- **Editable proof** — `proof.json` can be verified offline with the SDK/CLI.

The first consumer is a **metadata-only lottery demo**: prizes are display data, not escrowed or claimed on-chain. The demo is intentionally simple: one form, one publish transaction, one finalize action.

## Status

- Contracts: `TapeRNG`, `LotteryDemo`, `DrandQuicknetAdapter`, `MockTapeOutCPU`, `MockBeaconAdapter`; Foundry unit/fuzz tests and a mainnet-fork Keccak-core regression pass.
- SDK: `packages/sdk` (viem client, TAP-02 interpreter, drand offline verification, Solidity-parity derivation, proof verification, CLI). `vitest` 14 tests pass; the CLI verifies a proof exported by the local Web.
- Web: `apps/web` (Next.js App Router, SQLite via Node 24's built-in `node:sqlite`, a lightweight en/zh i18n, **RainbowKit injected-only on wagmi + viem**; no WalletConnect projectId). **Mainnet(196)-only** in production; Anvil is reserved for the contract-debug layer (see `contracts/anvil/`).
- Deployment: X Layer testnet 1952 uses `MockTapeOutCPU` (TapeOut is not deployed there); X Layer mainnet 196 can use the real Keccak Core #3.

> The Web does not use `next-intl`; the en/zh dictionaries live in `apps/web/lib/i18n.ts`. The SDK's server-side derivation is mirrored in the Web for inline proof checking; both are tested against the same Solidity parity fixture.

## Repository layout

```text
taperng/
├── contracts/          # Foundry: protocol, consumer, drand adapter, mocks, tests
├── packages/sdk/       # viem SDK, TAP-02 interpreter, drand verifier, proof CLI
├── apps/web/           # Next.js UI: publish form, draw detail, proof viewer
├── config/             # pinned chain/circuit addresses
└── package.json        # pnpm workspace
```

## Quick start (contracts)

```bash
cd taperng/contracts
forge build
forge test --match-path 'test/unit/*'

# Mainnet-fork regression against the real Keccak IP Core:
RUN_FORK=true forge test --match-path test/fork/KeccakCore.t.sol -vv

# BLS tests require an EIP-2537-capable EVM:
RUN_EIP2537=true forge test --match-path test/unit/DrandQuicknetAdapter.t.sol --evm-version osaka -vv
```

## Quick start (SDK)

`taperng-sdk` is published on npm (ships TypeScript source, viem `^2` as a peer
dependency):

```bash
npm install taperng-sdk viem
```

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { createTapeRNG } from "taperng-sdk";
import { xlayerMainnet } from "./your-chain"; // or define the chain inline

const rng = createTapeRNG({
  publicClient: createPublicClient({ chain: xlayerMainnet, transport: http("https://rpc.xlayer.tech") }),
  walletClient, // viem WalletClient of the organizer
  addresses: { tapeRng: "0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce" },
  chainId: 196,
});

// rng.createRequest(...) → reveal seed → finalize → verify the proof
```

The SDK exports `createTapeRNG`, `buildDraw`, `verifyDerivation`, `verifyBeacon`,
`load`/`evalNetlist`, and the two contract ABIs. See
`packages/sdk/README.md` for the full API, the offline proof CLI, and the
proof format. To work on the SDK itself:

```bash
cd taperng/packages/sdk
pnpm install --ignore-workspace
pnpm test   # vitest; the parity test checks TS derivation against the Solidity fixture
```

## Quick start (web)

The production web app is live at **https://tape.futool.com** (mainnet 196);
the steps below are for running a local copy.

```bash
cd taperng/apps/web
cp .env.example .env.local
# fill NEXT_PUBLIC_LOTTERY_ADDRESS / NEXT_PUBLIC_TAPE_RNG_ADDRESS
pnpm install --ignore-workspace
./node_modules/.bin/next dev
# open http://localhost:3000
```

The UI has three top-level pages:

- **`/`** — visual landing page: hero, proof terminal, metrics, five-step flow,
  feature cards, how-it-works, latest draws and roadmap.
- **`/demo`** — the live demo. The form is prefilled with the annual-party
  example; connect an injected wallet on the configured chain and click
  **Publish draw**. On testnet/mainnet the wallet must hold a little OKB for
  gas.
- **`/docs`** — SDK features, quick-start code, publish / finalize / proof /
  CLI usage, TAP-02 and drand details, and the security boundaries.

All three switch between English and Chinese with the header language button.
The wallet layer is **RainbowKit in injected-only mode**: the connect modal only
exposes the browser/injected wallet connector, with no WalletConnect projectId.
Non-injected wallet SDKs are stubbed out in `next.config.mjs` and are not
shipped in the bundle.

### Anvil contract-debug environment (builder-only)

Anvil (X Layer mainnet fork, chain-id 31337) is **only for contract-level
debugging / future extension R&D by the original builder**, fully decoupled
from the published mainnet(196) frontend. The web app is **mainnet-only** and no
longer supports switching to an Anvil fork. All orchestration is collected
under `taperng/contracts/anvil/`:

```bash
cd taperng/contracts
./anvil/start.sh          # start the osaka mainnet fork
./anvil/deploy.sh         # deploy real CPU + drand, writes deployments/31337.json
./anvil/smoke.sh          # cast-level smoke (circuitInfo/eval + contract code)
./anvil/debug.sh --start  # one-shot: fork → deploy → smoke → SDK fork E2E
```

The deep fork E2E (real Keccak core + drand, happy/missing-seed/direct/expired/
negative cases, SDK proof + TAP-02 replay) is `packages/sdk/scripts/e2e-fork.mts`
(invoked by `debug.sh`). See `taperng/contracts/anvil/README.md` for details.

`TapeRNG` enforces `MIN_CIRCUIT_GAS = 5.2M` before `eval`, so a too-low gas
limit reverts instead of silently finalizing with `circuitUsed=false`.

## Deploy

```bash
cd taperng/contracts
export XLAYER_TESTNET_RPC_URL=https://testrpc.xlayer.tech/terigon
export BEACON_MODE=drand      # drand | mock | none
export CPU_MODE=mock          # mock | real
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$XLAYER_TESTNET_RPC_URL" \
  --account taperng-deployer \
  --broadcast
```

The script writes `contracts/deployments/<chainId>.json` and logs the addresses. Copy them into `config/addresses.json` and `apps/web/.env.local`.

> Do not put a private key in the repository or in chat. Use `cast wallet import taperng-deployer --interactive` with a dedicated deployer wallet.

## Mainnet addresses (X Layer chain 196)

Production deployment: **https://tape.futool.com**. Pinned in `config/addresses.json`; for TapeRNG-on-X Layer development you can query them on-chain (`cast call`):

| Contract | Address |
|---|---|
| `TapeRNG` (protocol) | `0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce` |
| `LotteryDemo` (metadata-only draw demo) | `0xb76AE4c893982E4D25ADC4888c8784369Fbd578D` |
| `DrandQuicknetAdapter` (drand beacon) | `0xa9c170404CaAa16BEff7bBc2AF8c2d0D428d7289` |

### TapeOut circuit — Keccak-256 IP Core

`TapeRNG` mixes entropy through this circuit. Every request pins the CPU
address / circuit ID / netlist hash on-chain (verified via
`TapeRNG.getRequest`, e.g. request `1`), so a proof can replay the same netlist
off-chain. `nIn = 24` bytes of pre-image go in; `nOut = 24` bytes come out.

| Item | Value |
|---|---|
| Processor factory | `0x1f09DAeFA827f02CBb40967cc91b259763760761` |
| FAB-Genisis (fab template) | `0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6` |
| **CPU / Keccak core circuit address** | `0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb` |
| circuitId | `3` |
| netlist hash | `0x998f29f1ad8dfab25871559ff695af7e6e7d0580cd73e6f1b07edeb10830600b` |
| netlist bytes | `10416` |
| nIn / nOut | `24` / `24` |
| gateCount | `1488` |

Read directly from the protocol:

```bash
export RPC=https://rpc.xlayer.tech
cast call 0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce \
  "getRequest(uint256)((address,address,bytes32,bytes32,bytes32,uint64,uint64,address,uint256,bytes32,uint32,uint32,uint32,bool,bool,bool,bool,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint8))" 1 --rpc-url $RPC
```

## How the randomness is derived

```text
ctx      = H(D0, chainId, lottery, participantsRoot, participantCount,
             winnerCount, prizeSpecHash, specHash)
commit   = H(D7, seed, ctx, organizer, chainId, tapeRng)
preSeed  = H(D1, chainId, tapeRng, requestId, ctx, organizerSeed,
             blockHash, beaconRandomness, cpu, circuitId, netlistHash,
             beaconRound, seedMissing, fallbackBlockhash)
mixIn    = first ceil(nIn/8) bytes of H(D2, preSeed)
mix      = H(D3, circuitId, netlistHash, cpu.eval(circuitId, mixIn))
finalSeed= H(D4, preSeed, mix, circuitUsed, seedMissing,
             fallbackBlockhash, beaconUsed)
```

Winner selection is partial Fisher-Yates with rejection sampling (`D5`); prize slots use a separate permutation (`D6`). The TypeScript SDK must encode the same `uint32`/`uint64` types and domain tags.

## Security assumptions

- The organizer commits before the drand round and the future blockhash are known; reveals cannot happen after the drand round is published.
- drand quicknet relies on the League of Entropy threshold assumption.
- A fixed `revealBlock` prevents keepers from choosing a favorable block; after 256 blocks the expired path uses a recent blockhash and is explicitly flagged.
- X Layer's sequencer can influence blockhash/censor transactions; organizer + sequencer collusion remains a residual risk. This project does **not** claim trustlessness.
- The contract is not audited. The vendored BLS library is experimental/unaudited. The TapeOut factory is not sealed in the current deployment; the CPU/circuit are pinned by address, circuit ID and netlist hash, but should be re-checked before a production deployment.
- Prize data is metadata only; the on-chain contract stores `prizeSpecHash`, not the prize list. The proof embeds the canonical spec and verifies `sum(quantity) == winnerCount`.

## Roadmap (also shown in the web UI)

- **Now**: X Layer testnet demo; organizer commit-reveal + drand quicknet + blockhash + TapeOut Keccak IP Core; inline proof verification.
- **Next 1**: custom TapeOut RNG circuit / tapeout (e.g. a 32-bit NLFSR or a larger Keccak-based mixer).
- **Next 2**: advanced cryptography beyond on-chain BLS12-381 (zk proof of BLS verification, VDF, threshold signatures, post-quantum options).
- **Later**: more consumers (NFT drops, games, fair launch), multi-chain adapters, SDK plugins.
