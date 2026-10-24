"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { useI18n } from "@/components/LanguageProvider";
import { PublishForm } from "@/components/PublishForm";
import { RecentDraws } from "@/components/RecentDraws";
import {
  addressUrl,
  beaconMode,
  isConfigured,
  lotteryAddress,
} from "@/lib/config";
import { landingContent } from "@/lib/landing";

export default function DemoPage() {
  const { t, locale } = useI18n();
  const content = landingContent(locale);

  return (
    <div className="page demo-page">
      <Header />
      <main>
        <section className="demo-hero">
          <span className="eyebrow">{content.demoEyebrow}</span>
          <h1>{content.demoTitle}</h1>
          <p>{content.demoSubtitle}</p>
          <div className="demo-note">
            {content.demoNote}{" "}
            {lotteryAddress && (
              <a
                className="inline-link"
                href={addressUrl(lotteryAddress)}
                target="_blank"
                rel="noreferrer"
              >
                {lotteryAddress}
              </a>
            )}
          </div>
        </section>

        {!isConfigured && (
          <div className="banner warning">{t("notConfigured")}</div>
        )}
        {beaconMode === "mock" && (
          <div className="banner warning">{t("mockBeaconWarning")}</div>
        )}

        <PublishForm />

        <section className="recent" aria-labelledby="recent-title">
          <div className="section-heading section-heading-row">
            <div>
              <span className="eyebrow">TapeRNG</span>
              <h2 id="recent-title">{t("recent.title")}</h2>
            </div>
            <Link className="section-link" href="/docs">
              {t("nav.docs")} ↗
            </Link>
          </div>
          <RecentDraws />
        </section>
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
