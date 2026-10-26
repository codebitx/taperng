#!/usr/bin/env bash
#
# verify-oklink.sh — 将 TapeRNG 三个主网合约源码通过 OKLink 验证，使其在 X Layer 浏览器显示可读源码。
#
# 背景：OKLink（X Layer 官方浏览器，https://web3.okx.com/explorer/x-layer/evm）没有 Etherscan 兼容的
#       module/action API，但支持 foundry 的 --verifier oklink。因此用 forge verify-contract 提交源码，
#       OKLink 端按所传编译配置重编译并比对链上字节码（含构造函数 immutable 槽位），结果写入浏览器。
#
# 用法：
#   ./script/verify-oklink.sh                 验证全部三个合约（提交 + 轮询）
#   ./script/verify-oklink.sh TapeRNG         只验证 TapeRNG（或 DrandQuicknetAdapter / LotteryDemo）
#   ./script/verify-oklink.sh check           只查询当前已选合约的验证状态（只读，无副作用）
#
# 编译配置沿用 foundry.toml(0.8.24 / via_ir / optimizer 200 / evm shanghai)，须与部署一致，否则 OKLink
# 重编译比对不一致会失败。
# API key 取自 /home/ubuntu/.okx/config.toml 的 profiles.live.api_key（可用环境变量 VERIFIER_API_KEY 覆盖，
# 或用 OKX_CREDENTIALS 指向别的凭证文件）。key 一律走环境变量，不写入任何文件、不进命令行参数、不打印。
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_JSON="${DEPLOY_JSON:-$REPO_DIR/deployments/196.json}"

CHAIN_ID=196                 # X Layer 主网
CHAIN_SHORT="xlayer"         # OKLink chainShortName
VERIFIER_URL="https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/$CHAIN_SHORT"
INFO_URL="https://www.oklink.com/api/v5/explorer/contract/verify-contract-info"
RPC="${RPC:-https://rpc.xlayer.tech}"
SOLC="${SOLC:-0.8.24}"
WATCH_TRIES="${WATCH_TRIES:-20}"     # 提交后轮询次数
WATCH_SLEEP="${WATCH_SLEEP:-6}"      # 轮询间隔（秒）

# ---------------------------------------------------------------- API key（不打印）
load_key() {
  if [[ -n "${VERIFIER_API_KEY:-}" ]]; then return; fi
  local creds="${OKX_CREDENTIALS:-/home/ubuntu/.okx/config.toml}"
  VERIFIER_API_KEY="$(python3 -I -c "
import tomllib,sys
try:
    t=tomllib.load(open('$creds','rb'))
except Exception:
    sys.exit('无法读取凭证文件 $creds: %s' % (e,))
print(t['profiles']['live']['api_key'])
")"
}
export VERIFIER_API_KEY ERR_CAPTURE

# ------------------------------------------------------- 从 deployments/196.json 读元数据
# 输出 TSV：合约名 <TAB> 地址 <TAB> 构造参数(human-readable, 空格分隔; 无即空)
contracts_tsv() {
  python3 -I -c "
import json
d=json.load(open('$DEPLOY_JSON'))
def row(n,a,args): print('%s\t%s\t%s' % (n,a,args))
row('DrandQuicknetAdapter', d['beaconAdapter'], '')
row('TapeRNG',              d['tapeRng'],       d['beaconAdapter'])
row('LotteryDemo',          d['lottery'],       ' '.join([d['tapeRng'], d['cpu'], str(d['circuitId']), d['netlistHash']]))
"
}

source_path() { # $1=合约名 -> "文件:合约"
  case "$1" in
    DrandQuicknetAdapter) echo "src/beacon/DrandQuicknetAdapter.sol:DrandQuicknetAdapter";;
    TapeRNG)              echo "src/TapeRNG.sol:TapeRNG";;
    LotteryDemo)          echo "src/LotteryDemo.sol:LotteryDemo";;
    *)                    return 1;;
  esac
}

# ------------------------------------------------------- 查询单个合约当前验证状态（只读）
# 打印一行状态并置 STATUS="VERIFIED|NOT_VERIFIED|ERROR"
status_one() { # $1=name $2=address
  local name="$1" addr="$2"
  local line
  line="$(curl -s -m 20 "$INFO_URL?chainShortName=$CHAIN_SHORT&contractAddress=$addr" \
        -H "X-ApiKey: $VERIFIER_API_KEY" 2>/dev/null \
        | python3 -I -c "
import sys,json
try:
    d=json.load(sys.stdin)
    # code 非 0（如 50011）是 OKLink 只读接口间歇抖动/未映射，不等于验证失败，如实标注
    if d.get('code') not in (0, '0'):
        print('API_'+str(d.get('code') or 'ERR')+'\t')
    else:
        v=d.get('data')
        v=v[0] if (isinstance(v,list) and v) else v
        if isinstance(v,dict):
            print('VERIFIED\tcompiler='+(v.get('compilerVersion') or '?'))
        else:
            print('NOT_VERIFIED\t')
except Exception:
    print('ERROR\t')
")"
  local state compiler
  IFS=$'\t' read -r state compiler <<<"$line"
  STATUS="$state"
  printf '  %-22s %s  %-12s %s\n' "$name" "$addr" "$state" "$compiler"
}

# ---------------------------------------------------------------- 主体
main() {
  local target="${1:-ALL}"
  local mode="verify"
  [[ "$target" == "check" ]] && { mode="check"; target="${2:-ALL}"; }

  [[ -f "$DEPLOY_JSON" ]] || { echo "缺少部署记录文件: $DEPLOY_JSON"; return 1; }
  command -v forge >/dev/null 2>&1 || { echo "未找到 forge（foundry）"; return 1; }
  load_key

  local name addr args sp tmpdir="" argsfile
  while IFS=$'\t' read -r name addr args; do
    [[ "$target" == "ALL" || "$target" == "$name" ]] || continue
    sp="$(source_path "$name")" || { echo "未知合约: $name"; continue; }

    echo ""
    echo "== [$mode] $name  $addr"

    if [[ "$mode" == "check" ]]; then
      STATUS="" ; status_one "$name" "$addr"
      continue
    fi

    # 生成 human-readable 构造参数临时文件（提交后清理；无参合约不加该参数）
    tmpdir="${tmpdir:-$(mktemp -d)}"
    argsfile="$tmpdir/$name.args"
    local extra=()
    if [[ -n "$args" ]]; then
      printf '%s' "$args" > "$argsfile"
      extra+=(--constructor-args-path "$argsfile")
    fi

    echo "  提交源码验证 ..."
    forge verify-contract "$addr" "$sp" \
      --verifier oklink \
      --verifier-url "$VERIFIER_URL" \
      --chain-id "$CHAIN_ID" --rpc-url "$RPC" \
      --compiler-version "$SOLC" \
      "${extra[@]}" 2>&1 \
      | grep -iE "Response:|guid:|error" || true

    # 轮询结果（OKLink 异步重编译比对）
    STATUS=""
    local i
    for i in $(seq 1 "$WATCH_TRIES"); do
      status_one "$name" "$addr"
      [[ "$STATUS" == "VERIFIED" || "$STATUS" == "ERROR" ]] && break
      sleep "$WATCH_SLEEP"
    done
    if [[ "$STATUS" != "VERIFIED" ]]; then
      echo "  !! 未在 ${WATCH_TRIES}×${WATCH_SLEEP}s 内确认已验证，可稍后重跑 ./script/verify-oklink.sh check"
    fi
  done < <(contracts_tsv)

  if [[ -n "${tmpdir:-}" ]]; then rm -rf "$tmpdir"; fi
}

main "$@"