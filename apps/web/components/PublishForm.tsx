"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import {
  buildDraw,
  flattenPrizes,
  randomSeed,
  type PrizeInput,
} from "@/lib/protocol";
import { beaconMode, chainId, lotteryAddress } from "@/lib/config";
import { publicClient, waitForReceipt } from "@/lib/chain";
import { publishDraw } from "@/lib/contracts";
import { fetchBeacon, roundTime } from "@/lib/drand";
import { exampleDraw, randomExampleDraw } from "@/lib/example";
import { useI18n } from "./LanguageProvider";
import { useToast } from "./Toast";

function friendlyError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = Number((error as { code?: unknown }).code);
    if (code === 4001) return "error.rejected";
  }
  if (error instanceof Error && error.message.startsWith("error.")) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes("wallet")) {
    return "error.noWallet";
  }
  return error instanceof Error ? error.message : "error.generic";
}

export function PublishForm() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const router = useRouter();
  // SSR 与客户端首渲染必须一致：先用确定性示例初始化，挂载后再随机预填。
  // 直接用 randomExampleDraw 会让 input value / 中奖名额文本在 hydration 时
  // 不一致（React #418）。
  const initial = useMemo(() => exampleDraw(locale), []);
  const [name, setName] = useState(initial.name);
  const [participantCount, setParticipantCount] = useState(
    initial.participantCount,
  );
  const [prizes, setPrizes] = useState<PrizeInput[]>(initial.prizes);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  // 进入页面随机预填一例「符合逻辑」的抽奖；不提供「恢复示例」，编辑后发布即可。
  useEffect(() => {
    const random = randomExampleDraw(locale);
    setName(random.name);
    setParticipantCount(random.participantCount);
    setPrizes(random.prizes);
    // 只在客户端挂载后执行一次，不随语言切换覆盖用户已填内容。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const winnerCount = useMemo(() => flattenPrizes(prizes).length, [prizes]);

  function updatePrize(index: number, patch: Partial<PrizeInput>) {
    setPrizes((current) =>
      current.map((prize, i) => (i === index ? { ...prize, ...patch } : prize)),
    );
  }

  function addPrize() {
    setPrizes((current) => [...current, { name: "", quantity: 1 }]);
  }

  function removePrize(index: number) {
    setPrizes((current) => current.filter((_, i) => i !== index));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (!lotteryAddress) {
      setError("error.notConfigured");
      return;
    }
    if (!name.trim() || prizes.length === 0) {
      setError("error.invalidForm");
      return;
    }

    try {
      setBusy("form.publishing");
      const built = buildDraw({
        name,
        participantCount,
        prizes,
        locale,
        chainId,
        lottery: lotteryAddress,
      });

      if (!address || !walletClient) {
        openConnectModal?.();
        throw new Error("error.noWallet");
      }
      await switchChainAsync({ chainId });

      setBusy("form.publishing");
      const currentBlock = await publicClient.getBlockNumber();
      const now = Math.floor(Date.now() / 1000);
      let beaconRound: number;
      let beaconTime: number;
      // 紧凑参数：beacon 前瞻 +22 round(≈66s，满足合约硬下界 beaconTime > now+60)。
      // revealBlock 取 beaconTime 之后 +10s 并切块；下界 20 块防极端时序。
      // 等待延迟 ≈ beaconTime-now + 10 ≈ 75s（X Layer ~1s/块）。
      if (beaconMode === "drand") {
        const latest = await fetchBeacon("latest");
        beaconRound = latest.round + 22;
        beaconTime = roundTime(beaconRound);
      } else if (beaconMode === "none") {
        beaconRound = 0;
        beaconTime = now + 90;
      } else {
        throw new Error(
          "Mock beacon mode is for contract tests; set BEACON_MODE=drand.",
        );
      }
      const blocksUntil = Math.max(20, beaconTime - now + 10);
      const revealBlock = currentBlock + BigInt(blocksUntil);
      const seed = randomSeed();

      const hash = await publishDraw(walletClient, address, {
        participantsRoot: built.participantsRoot,
        participantCount,
        prizeSpecHash: built.prizeSpecHash,
        specHash: built.specHash,
        winnerCount: built.winnerCount,
        revealBlock,
        beaconRound: BigInt(beaconRound),
        seed,
      });

      setBusy("form.publishing");
      // 正常等待约 75s（beacon 前瞻 + revealBlock），给足余量。
      // 若钱包返回的是 userOp hash 而非交易哈希，最终会超时而不是无限等待。
      const receipt = await waitForReceipt(hash, { timeoutMs: 180_000 });
      if (receipt.status !== "success") {
        throw new Error("transaction reverted");
      }

      const response = await fetch("/api/draws", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // 钱包（尤其是 AA/智能账户）返回的可能是 userOp hash，
          // 以收据里的真实交易哈希为准。
          txHash: receipt.transactionHash,
          name: name.trim(),
          locale,
          participantCount,
          prizes,
          seed,
          revealBlock: revealBlock.toString(),
          beaconRound: String(beaconRound),
        }),
      });
      const payload = (await response.json()) as {
        draw?: { id?: string };
        error?: string;
      };
      if (!response.ok || !payload.draw?.id) {
        throw new Error(payload.error ?? "failed to save draw");
      }
      toast.success(t("toast.published"));
      router.push(`/draws/${payload.draw.id}`);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(undefined);
    }
  }

  const errorText = error?.startsWith("error.")
    ? t(error)
    : error ?? undefined;

  return (
    <form className="card publish-card" onSubmit={onSubmit}>
      <div className="card-heading">
        <div>
          <span className="eyebrow">{t("appName")}</span>
          <h1>{t("form.title")}</h1>
          <p>{t("form.subtitle")}</p>
        </div>
        <span className="muted">{t("form.autoFilled")}</span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{t("form.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("form.namePlaceholder")}
            maxLength={120}
            required
          />
        </label>
        <label className="field">
          <span>{t("form.participants")}</span>
          <input
            type="number"
            min={1}
            max={5000}
            value={participantCount}
            onChange={(event) =>
              setParticipantCount(Number(event.target.value))
            }
            required
          />
          <small>{t("form.participantsHint")}</small>
        </label>
      </div>

      <div className="prizes">
        <div className="prizes-head">
          <span>{t("form.prizes")}</span>
          <span className="muted">
            {t("form.totalWinners", { count: winnerCount })}
          </span>
        </div>
        <div className="prize-rows">
          {prizes.map((prize, index) => (
            <div className="prize-row" key={index}>
              <input
                aria-label={t("form.prizeName")}
                value={prize.name}
                placeholder={t("form.prizeName")}
                onChange={(event) =>
                  updatePrize(index, { name: event.target.value })
                }
                required
              />
              <input
                aria-label={t("form.prizeQuantity")}
                type="number"
                min={1}
                max={100}
                value={prize.quantity}
                onChange={(event) =>
                  updatePrize(index, {
                    quantity: Number(event.target.value),
                  })
                }
                required
              />
              <button
                className="icon-button"
                type="button"
                onClick={() => removePrize(index)}
                aria-label={t("form.removePrize")}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button className="ghost" type="button" onClick={addPrize}>
          + {t("form.addPrize")}
        </button>
      </div>

      {errorText && <div className="error-box">{errorText}</div>}

      <div className="publish-actions">
        <div className="muted">
          {t("form.wallet")}:{" "}
          {address ? `${address.slice(0, 6)}…` : "—"}
        </div>
        <button className="primary" type="submit" disabled={Boolean(busy)}>
          {busy ? t("form.publishing") : t("form.publish")}
        </button>
      </div>
    </form>
  );
}
