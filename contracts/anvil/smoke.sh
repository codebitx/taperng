#!/usr/bin/env bash
# 合约级冒烟：用 cast 直读 fork 上的真实 Keccak CPU 与本次部署的 LotteryDemo/TapeRNG，
# 不经过前端 / SDK，作为「合约调试」最轻量的一层验证。
#
# 用法: ./anvil/smoke.sh        （需先 ./anvil/start.sh 与 ./anvil/deploy.sh）
set -euo pipefail
cd "$(dirname "$0")/.."

RPC="${ANVIL_RPC:-http://127.0.0.1:8545}"
CPU=0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb
DEPLOY=deployments/31337.json
if [[ ! -s "${DEPLOY}" ]]; then
  echo "缺少 ${DEPLOY}，请先运行 ./anvil/deploy.sh" >&2
  exit 1
fi

# 用 python 解析 Deploy.s.sol 写出的 JSON（避免对 jq 的依赖）。
LOTTERY="$(python3 -c "import json;print(json.load(open('${DEPLOY}'))['lottery'])")"
TAPE_RNG="$(python3 -c "import json;print(json.load(open('${DEPLOY}'))['tapeRng'])")"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
expect_eq() { local label="$1" got="$2" want="$3"; if [[ "$got" == "$want" ]]; then pass "$label → $got"; else fail "$label → got $got, want $want"; fi; }

echo "== 真实 Keccak CPU（来自主网 fork 世界状态）=="
expect_eq "circuitInfo(3)" \
  "$(cast call "$CPU" "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" 3 --rpc-url "$RPC")" \
  "(24,24,0,1488)"
expect_eq "eval(3,0x123456)" \
  "$(cast call "$CPU" "eval(uint256,bytes)(bytes)" 3 0x123456 --rpc-url "$RPC")" \
  "0xf6ec15"

echo "== 本次部署到 fork 的合约有代码 =="
LOTTERY_CODESIZE="$(cast codesize "$LOTTERY" --rpc-url "$RPC")"
TAPE_RNG_CODESIZE="$(cast codesize "$TAPE_RNG" --rpc-url "$RPC")"
if [[ "${LOTTERY_CODESIZE}" != "0" ]]; then pass "LotteryDemo codeSize=${LOTTERY_CODESIZE}"; else fail "LotteryDemo 无代码 (${LOTTERY})"; fi
if [[ "${TAPE_RNG_CODESIZE}" != "0" ]]; then pass "TapeRNG codeSize=${TAPE_RNG_CODESIZE}"; else fail "TapeRNG 无代码 (${TAPE_RNG})"; fi

echo "== 地址 =="
echo "  LotteryDemo: ${LOTTERY}"
echo "  TapeRNG:     ${TAPE_RNG}"
echo "冒烟通过：真实 Keccak CPU(circuitInfo/eval) 与本轮部署合约均可用。"
echo "更深的合约级联调（含 drand、负向、fallback、SDK proof）见 README.md。"