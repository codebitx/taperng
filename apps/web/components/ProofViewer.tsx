"use client";

import { useI18n } from "./LanguageProvider";

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface Verification {
  ok: boolean;
  checks: VerifyCheck[];
}

export function ProofViewer({
  proof,
  verification,
  verifying,
  onVerify,
}: {
  proof: unknown;
  verification?: Verification;
  verifying: boolean;
  onVerify: () => void;
}) {
  const { t } = useI18n();

  return (
    <section className="card proof-card" aria-labelledby="proof-title">
      <div className="card-heading">
        <div>
          <span className="eyebrow">proof.json</span>
          <h2 id="proof-title">{t("detail.proof")}</h2>
        </div>
        <button
          className="primary small"
          type="button"
          onClick={onVerify}
          disabled={verifying || !proof}
        >
          {verifying ? t("detail.verifying") : t("detail.verify")}
        </button>
      </div>

      {!proof ? (
        <p className="muted">{t("detail.noProof")}</p>
      ) : (
        <>
          {verification && (
            <div
              className={`verification-box ${
                verification.ok ? "good" : "bad"
              }`}
            >
              <strong>
                {verification.ok
                  ? t("detail.verified")
                  : t("detail.verifyFailed")}
              </strong>
              <ul>
                {verification.checks.map((check) => (
                  <li key={check.name} className={check.ok ? "ok" : "fail"}>
                    <span>{check.ok ? "✓" : "×"}</span>
                    <span>{check.name}</span>
                    {check.detail && <small>{check.detail}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="proof-json">
            <summary>{t("detail.proof")}</summary>
            <pre>{JSON.stringify(proof, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
