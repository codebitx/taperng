"use client";

import { useEffect, useState } from "react";

/// Read whether the user prefers reduced motion.  When true we render static
/// beads instead of animated ones so the diagram stays legible yet calm.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

interface FlowPath {
  id: string;
  d: string;
  color: string;
  dur: string;
  begin: string;
}

/// Three independent entropy sources feeding the TapeOut circuit.
const SOURCES: FlowPath[] = [
  { id: "flow-commit", d: "M172 80 C250 92 298 128 330 144", color: "var(--accent)", dur: "2.4s", begin: "-0.6s" },
  { id: "flow-drand", d: "M172 177 C258 190 302 180 330 174", color: "var(--accent-2)", dur: "2.8s", begin: "-1.2s" },
  { id: "flow-block", d: "M172 272 C258 274 300 238 330 208", color: "var(--warn)", dur: "3s", begin: "-1.8s" },
];

const OUT_PATH: FlowPath = {
  id: "flow-out",
  d: "M486 174 C514 172 540 166 564 160",
  color: "var(--good)",
  dur: "2.2s",
  begin: "0s",
};

/// A moving bead riding a path (SMIL, zero dependencies).  With reduced motion
/// we instead drop static beads along the path so the flow still reads.
function FlowDot({ path, reduced }: { path: FlowPath; reduced: boolean }) {
  if (!reduced) {
    return (
      <circle r="3.5" fill={path.color}>
        <animateMotion dur={path.dur} begin={path.begin} repeatCount="indefinite" rotate="auto">
          <mpath href={`#${path.id}`} />
        </animateMotion>
      </circle>
    );
  }
  const beads = STATIC_BEADS[path.id];
  return (
    <>
      <circle cx={beads[0][0]} cy={beads[0][1]} r="3" fill={path.color} opacity="0.85" />
      <circle cx={beads[1][0]} cy={beads[1][1]} r="3" fill={path.color} opacity="0.5" />
    </>
  );
}

/// Approximate mid-path points per flow, used only when motion is reduced.
const STATIC_BEADS: Record<string, [number, number][]> = {
  "flow-commit": [
    [238, 104],
    [296, 130],
  ],
  "flow-drand": [
    [242, 184],
    [298, 178],
  ],
  "flow-block": [
    [244, 254],
    [304, 228],
  ],
  "flow-out": [
    [512, 172],
    [540, 165],
  ],
};

export function EntropyFlow() {
  const reduced = usePrefersReducedMotion();

  return (
    <svg
      className="entropy-flow"
      viewBox="0 0 700 356"
      role="img"
      aria-label="Commitment, drand and blockhash entropy flow into the TapeOut circuit and produce a verifiable final seed"
    >
      {/* --- flow lines (under nodes) --- */}
      <g className="ef-paths">
        {SOURCES.map((p) => (
          <path key={p.id} id={p.id} d={p.d} className="ef-flow" style={{ stroke: p.color }} />
        ))}
        <path id={OUT_PATH.id} d={OUT_PATH.d} className="ef-flow" style={{ stroke: OUT_PATH.color }} />
      </g>

      {/* --- moving / static dots --- */}
      <g className="ef-dots">
        {SOURCES.map((p) => (
          <FlowDot key={p.id} path={p} reduced={reduced} />
        ))}
        <FlowDot path={OUT_PATH} reduced={reduced} />
      </g>

      {/* --- source nodes --- */}
      <Node x={12} y={48} w={150} h={58} title="Commit" sub="your seed" accent="var(--accent)" />
      <Node x={12} y={148} w={150} h={58} title="drand" sub="quicknet · BLS" accent="var(--accent-2)" />
      <Node x={12} y={244} w={150} h={58} title="Block-hash" sub="fixed L2 block" accent="var(--warn)" />

      {/* --- central TapeOut circuit (the highlight) --- */}
      <g className="ef-core">
        <rect x={330} y={116} width={156} height={116} rx={20} className="ef-core-box" />
        {/* IC pins */}
        {[0, 1, 2, 3].map((i) => (
          <line key={i} className="ef-core-pin" x1={352 + i * 34} y1={116} x2={352 + i * 34} y2={100} />
        ))}
        <circle cx={408} cy={160} r={20} className="ef-core-die" />
        <text x={408} y={166} textAnchor="middle" className="ef-core-title">
          TAPE-OUT
        </text>
        <text x={408} y={192} textAnchor="middle" className="ef-core-sub">
          Keccak IP Core
        </text>
        <text x={408} y={208} textAnchor="middle" className="ef-core-sub">
          replayable netlist
        </text>
      </g>

      {/* --- output --- */}
      <Node x={566} y={132} w={122} h={68} title="Final seed" sub="verified ✓" accent="var(--good)" final />

      {/* --- caption: the TapeOut takeaway --- */}
      <text x={408} y={330} textAnchor="middle" className="ef-caption">
        entropy outside · verifiable mixing inside
      </text>
    </svg>
  );
}

function Node({
  x,
  y,
  w,
  h,
  title,
  sub,
  accent,
  final = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  accent: string;
  final?: boolean;
}) {
  return (
    <g className={`ef-node${final ? " is-final" : ""}`}>
      <rect x={x} y={y} width={w} height={h} rx={12} />
      <line x1={x} y1={y} x2={x} y2={y + h} stroke={accent} strokeWidth={2.5} />
      <text x={x + w / 2} y={y + h / 2 - 3} textAnchor="middle" className="ef-node-title">
        {title}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle" className="ef-node-sub" style={{ fill: accent }}>
        {sub}
      </text>
    </g>
  );
}