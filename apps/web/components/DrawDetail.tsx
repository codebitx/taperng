"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import type { Hex } from "viem";
import { publicClient, waitForReceipt } from "@/lib/chain";
import { beaconMode, chainId } from "@/lib/config";
import { finalizeDraw } from "@/lib/contracts";
import { fetchBeacon, roundTime } from "@/lib/drand";
import { shortHash } from "@/lib/protocol";
import type { DrawApi } from "@/lib/serialize";
import { Header } from "./Header";
import { useI18n } from "./LanguageProvider";
import { useToast } from "./Toast";
import {
  ProofViewer,
  type Verification,
  type VerifyCheck,
} from "./ProofViewer";

interface DrawResponse {
  draw: DrawApi;
  expired?: boolean;
}

interface ProofPayload {
  derivation?: {
    ok?: boolean;
    checks?: VerifyCheck[];
  };
}

function friendlyError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = Number((error as { code?: unknown }).code);
    if (code === 4001) return "error.rejected";
  }
  if (error instanceof Error && error.message.startsWith("error.")) {
    return error.message;
  }
  return error instanceof Error ? error.message : "error.generic";
}

function date(value: number): string {
  return new Date(value).toLocaleString();
}

function time(value: number): string {
  return new Date(value * 1000).toLocaleString();
}

export function DrawDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const [draw, setDraw] = useState<DrawApi>();
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // 不能用 Date.now() 作为初始值：SSR 与客户端 hydration 会得到不同时间，
  // 导致 React #418（服务端/客户端文本不一致）。挂载后由 effect 填入。
  const [now, setNow] = useState<number>();
  const [blockNumber, setBlockNumber] = useState<bigint>();
  const [proof, setProof] = useState<unknown>();
  const [verification, setVerification] = useState<Verification>();
  const [verifying, setVerifying] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/draws/${id}`, { cache: "no-store" });
    const payload = (await response.json()) as DrawResponse & {
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "failed to load draw");
    setDraw(payload.draw);
    setExpired(Boolean(payload.expired));
  }, [id]);

  const loadProof = useCallback(async () => {
    const response = await fetch(`/api/draws/${id}/proof`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      proof?: unknown;
      error?: string;
    };
    if (!response.ok || !payload.proof) return;
    setProof(payload.proof);
    const derivation = (payload.proof as ProofPayload).derivation;
    if (derivation?.checks) {
      setVerification({
        ok: Boolean(derivation.ok),
        checks: derivation.checks,
      });
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!cancelled) void load();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refresh]);

  // 倒计时秒数每秒走；块号单独低频轮询，避免整页每 5 秒才跳一次。
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) setNow(Math.floor(Date.now() / 1000));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const block = await publicClient.getBlockNumber();
        if (!cancelled) setBlockNumber(block);
      } catch {
        // Ignore transient RPC errors.
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      if (!cancelled) void tick();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (draw?.status === "finalized") void loadProof();
  }, [draw?.status, loadProof]);

  const revealBlock = draw ? BigInt(draw.revealBlock) : undefined;
  const beaconReady =
    beaconMode !== "drand" ||
    !draw ||
    draw.beaconRound === "0" ||
    (now !== undefined && now >= roundTime(Number(draw.beaconRound)));
  const blockReady =
    draw !== undefined &&
    blockNumber !== undefined &&
    revealBlock !== undefined &&
    blockNumber > revealBlock;
  const canFinalize =
    draw !== undefined && draw.status !== "finalized" && blockReady && beaconReady;

  // 倒计时（未就绪时展示）：剩余等待取「揭示区块余块」与「信标剩余秒」中较大者。
  // X Layer 出块约 1s/块，故以块数近似秒数。
  const beaconSec =
    now !== undefined &&
    beaconMode === "drand" &&
    draw?.beaconRound &&
    draw.beaconRound !== "0"
      ? Math.max(0, roundTime(Number(draw.beaconRound)) - now)
      : 0;
  const blockSec =
    blockNumber !== undefined &&
    revealBlock !== undefined &&
    blockNumber <= revealBlock
      ? Number(revealBlock - blockNumber)
      : 0;
  const remainingSec = Math.max(beaconSec, blockSec);

  const groupedPrizes = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const prize of draw?.prizes ?? []) {
      grouped.set(prize.name, (grouped.get(prize.name) ?? 0) + 1);
    }
    return [...grouped.entries()];
  }, [draw?.prizes]);

  const winnerRows = useMemo(() => {
    if (!draw?.winners || !draw.prizeSlots) return [];
    return draw.winners.map((participantIndex, rank) => ({
      rank,
      participant:
        draw.participants[participantIndex]?.name ??
        `#${participantIndex}`,
      prize:
        draw.prizes[draw.prizeSlots![rank] ?? 0]?.name ?? "—",
    }));
  }, [draw]);

  async function onFinalize() {
    if (!draw) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!address || !walletClient) {
        openConnectModal?.();
        throw new Error("error.noWallet");
      }
      await switchChainAsync({ chainId });

      let signature: Hex = "0x";
      if (beaconMode === "drand" && draw.beaconRound !== "0") {
        const beacon = await fetchBeacon(Number(draw.beaconRound));
        signature = beacon.signature;
      }

      const hash = await finalizeDraw(
        walletClient,
        address,
        BigInt(draw.drawId),
        signature,
      );
      await waitForReceipt(hash as Hex);
      const response = await fetch(`/api/draws/${id}/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txFinalize: hash }),
      });
      const payload = (await response.json()) as DrawResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "refresh failed");
      setDraw(payload.draw);
      setExpired(Boolean(payload.expired));
      if (payload.draw.status === "finalized") {
        toast.success(t("toast.finalized"));
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setVerifying(true);
    setError(undefined);
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await response.json()) as Verification & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "verify failed");
      setVerification({ ok: payload.ok, checks: payload.checks });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setVerifying(false);
    }
  }

  const errorText = error?.startsWith("error.")
    ? t(error)
    : error ?? undefined;
  const status = draw?.status ?? "created";

  return (
    <div className="page">
      <Header />
      <main>
        <Link className="back-link" href="/demo">
          ← {t("detail.back")}
        </Link>

        {loading && <p className="muted">…</p>}
        {errorText && <div className="error-box">{errorText}</div>}

        {draw && (
          <>
            <section className="draw-hero">
              <div>
                <span className="eyebrow">{t("detail.draw")}</span>
                <h1>{draw.name}</h1>
                <p className="muted">
                  {draw.participantCount} participants · {draw.winnerCount}{" "}
                  prizes
                </p>
              </div>
              <div className="draw-hero-right">
                <span className={`badge ${status}`}>
                  {t(`status.${status}`)}
                </span>
                {draw.txCreate && (
                  <span className="muted" title={draw.txCreate}>
                    tx {shortHash(draw.txCreate, 5)}
                  </span>
                )}
              </div>
            </section>

            {expired && status !== "finalized" && (
              <div className="banner warning">{t("detail.expiredHint")}</div>
            )}

            <div className="detail-grid">
              <div className="detail-column">
                <section className="card">
                  <div className="card-heading">
                    <h2>{t("detail.timeline")}</h2>
                  </div>
                  <ol className="timeline">
                    <li className="done">
                      <strong>{t("detail.createdAt")}</strong>
                      <span>{date(draw.createdAt)}</span>
                    </li>
                    <li
                      className={
                        status === "created" ? "" : "done"
                      }
                    >
                      <strong>{t("detail.committedAt")}</strong>
                      <span>
                        {draw.organizerSeed
                          ? shortHash(draw.organizerSeed, 8)
                          : "—"}
                      </span>
                    </li>
                    <li className={status === "finalized" ? "done" : ""}>
                      <strong>{t("detail.finalizedAt")}</strong>
                      <span>
                        {draw.finalSeed
                          ? shortHash(draw.finalSeed, 8)
                          : "—"}
                      </span>
                    </li>
                  </ol>
                </section>

                <section className="card">
                  <div className="card-heading">
                    <h2>{t("form.prizes")}</h2>
                    <span className="muted">
                      {t("form.totalWinners", { count: draw.winnerCount })}
                    </span>
                  </div>
                  <ul className="prize-list">
                    {groupedPrizes.map(([prize, count]) => (
                      <li key={prize}>
                        <span>{prize}</span>
                        <strong>×{count}</strong>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="card">
                  <div className="card-heading">
                    <h2>{t("detail.winners")}</h2>
                  </div>
                  {winnerRows.length === 0 ? (
                    <p className="muted">{t("detail.noWinners")}</p>
                  ) : (
                    <div className="winner-table-wrap">
                      <table className="winner-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{t("detail.participant")}</th>
                            <th>{t("detail.prize")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {winnerRows.map((row) => (
                            <tr key={row.rank}>
                              <td>{row.rank + 1}</td>
                              <td>{row.participant}</td>
                              <td>{row.prize}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              <div className="detail-column">
                <section className="card">
                  <div className="card-heading">
                    <h2>{t("detail.entropy")}</h2>
                  </div>
                  <dl className="entropy-list">
                    <div>
                      <dt>{t("detail.organizerSeed")}</dt>
                      <dd title={draw.organizerSeed ?? ""}>
                        {draw.organizerSeed
                          ? shortHash(draw.organizerSeed, 8)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("detail.drandRound")}</dt>
                      <dd>{draw.beaconRound}</dd>
                    </div>
                    <div>
                      <dt>{t("detail.drandTime")}</dt>
                      <dd>
                        {beaconMode !== "drand" || draw.beaconRound === "0"
                          ? "—"
                          : time(roundTime(Number(draw.beaconRound)))}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("detail.revealBlock")}</dt>
                      <dd>{draw.revealBlock}</dd>
                    </div>
                    <div>
                      <dt>{t("detail.blockHash")}</dt>
                      <dd title={draw.blockHash ?? ""}>
                        {draw.blockHash
                          ? shortHash(draw.blockHash, 8)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("detail.beaconRandomness")}</dt>
                      <dd title={draw.beaconRandomness ?? ""}>
                        {draw.beaconRandomness
                          ? shortHash(draw.beaconRandomness, 8)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("detail.circuitMix")}</dt>
                      <dd title={draw.circuitMix ?? ""}>
                        {draw.circuitMix
                          ? shortHash(draw.circuitMix, 8)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("detail.finalSeed")}</dt>
                      <dd title={draw.finalSeed ?? ""}>
                        {draw.finalSeed
                          ? shortHash(draw.finalSeed, 8)
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </section>

                {status !== "finalized" && (
                  <section className="card finalize-card">
                    <h2>{t("detail.drawWinners")}</h2>
                    <p className="muted">
                      {canFinalize
                        ? t("detail.ready")
                        : t("detail.countdown")}
                    </p>
                    {!canFinalize && remainingSec > 0 && (
                      <p className="countdown-remaining">
                        {t("detail.remaining", {
                          m: Math.floor(remainingSec / 60),
                          s: remainingSec % 60,
                          blocks: blockSec,
                        })}
                      </p>
                    )}
                    <ul className="wait-list">
                      <li>
                        {t("detail.revealBlock")}: {draw.revealBlock}{" "}
                        {blockNumber !== undefined &&
                          `(now ${blockNumber.toString()})`}
                      </li>
                      <li>
                        {t("detail.drandTime")}:{" "}
                        {beaconMode !== "drand" || draw.beaconRound === "0"
                          ? "—"
                          : time(roundTime(Number(draw.beaconRound)))}
                      </li>
                    </ul>
                    <button
                      className="primary"
                      type="button"
                      onClick={onFinalize}
                      disabled={busy || !canFinalize}
                    >
                      {busy ? t("detail.drawing") : t("detail.drawWinners")}
                    </button>
                  </section>
                )}
              </div>
            </div>

            <ProofViewer
              proof={proof}
              verification={verification}
              verifying={verifying}
              onVerify={onVerify}
            />
          </>
        )}
      </main>
      <footer className="site-footer">
        <p>{t("footer")}</p>
        <Link href="/docs" className="footer-link">
          {t("docsLink")}
        </Link>
      </footer>
    </div>
  );
}
