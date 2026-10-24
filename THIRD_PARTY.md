# Third-party code

## randa-mu/bls-solidity

- Source: https://github.com/randa-mu/bls-solidity
- Commit: `11af179a8287d978659aae07adb66aa60f64b8a6`
- License: MIT (see `contracts/src/lib/bls/LICENSE`)
- Vendored files:
  - `contracts/src/lib/bls/BLS2.sol`
  - `contracts/src/lib/bls/Precompiles.sol`
- Local change: replaced the single `mcopy(q, p, 64)` in `BLS2.hashToPoint` with two `mstore` instructions, so the contract does not require the Cancun `MCOPY` opcode. The BLS12-381 arithmetic and drand serialization are unchanged.
- Warning: the upstream library is **experimental and unaudited**. It is used only for the drand quicknet verifier in this demo. A production deployment must independently audit or replace it.

The vendored library requires EIP-2537 precompiles (`0x0b`, `0x0f`, `0x10`) and MODEXP (`0x05`). X Layer mainnet/testnet were probed for EIP-2537 support.
