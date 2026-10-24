"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { landingContent } from "@/lib/landing";
import type { DrawSummary } from "@/lib/serialize";
import { useI18n } from "./LanguageProvider";

export function RecentDraws({
  pageSize = 5,
  compact = false,
}: {
  pageSize?: number;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const content = landingContent(locale);
  const [page, setPage] = useState(0);
  const [draws, setDraws] = useState<DrawSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const offset = page * pageSize;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/draws?limit=${pageSize}&offset=${offset}`)
      .then((response) => response.json())
      .then(
        (payload: {
          draws?: DrawSummary[];
          total?: number;
          hasMore?: boolean;
        }) => {
          if (cancelled) return;
          const next = payload.draws ?? [];
          // 记录变少时（例如当前页被删空）回退一页，避免停在空页。
          if (next.length === 0 && offset > 0) {
            setPage((current) => Math.max(0, current - 1));
            return;
          }
          setDraws(next);
          setTotal(payload.total ?? 0);
          setHasMore(Boolean(payload.hasMore));
        },
      )
      .catch(() => {
        if (!cancelled) {
          setDraws([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offset, pageSize]);

  if (loading && draws.length === 0) return <p className="muted">…</p>;
  if (draws.length === 0) {
    return (
      <p className="muted">
        {t("recent.empty")}{" "}
        <Link className="inline-link" href="/demo">
          {content.viewAll}
        </Link>
      </p>
    );
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className={`draw-list${compact ? " compact" : ""}`}>
        {draws.map((draw) => (
          <Link
            className="draw-card"
            href={`/draws/${draw.id}`}
            key={draw.id}
          >
            <div>
              <h3>{draw.name}</h3>
              <p className="muted">
                {draw.participantCount} participants · {draw.winnerCount} prizes
              </p>
            </div>
            <div className="draw-card-right">
              <span className={`badge ${draw.status}`}>
                {t(`status.${draw.status}`)}
              </span>
              <span className="muted">
                {new Date(draw.createdAt).toLocaleDateString()}
              </span>
              <span className="draw-arrow">↗</span>
            </div>
          </Link>
        ))}
      </div>
      {pages > 1 && (
        <div className="draw-pager">
          <button
            className="ghost"
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            ← {t("recent.prev")}
          </button>
          <span className="muted">
            {t("recent.page", { page: page + 1, pages })}
          </span>
          <button
            className="ghost"
            type="button"
            disabled={!hasMore || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("recent.next")} →
          </button>
        </div>
      )}
    </>
  );
}
