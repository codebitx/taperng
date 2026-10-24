"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { useI18n } from "@/components/LanguageProvider";
import { lotteryAddress, tapeRngAddress } from "@/lib/config";
import { docsContent } from "@/lib/docs";

export default function DocsPage() {
  const { t, locale } = useI18n();
  const content = docsContent(locale, {
    tapeRngAddress,
    lotteryAddress,
  });

  return (
    <div className="page">
      <Header />
      <main className="docs-main">
        <Link className="back-link" href="/">
          ← {content.back}
        </Link>

        <section className="docs-hero">
          <span className="eyebrow">{content.eyebrow}</span>
          <h1>{content.title}</h1>
          <p>{content.subtitle}</p>
          {content.note && <div className="docs-note">{content.note}</div>}
          {content.addresses.length > 0 && (
            <div className="docs-addresses" aria-label="contract addresses">
              {content.addresses.map((addr) => (
                <div className="docs-address" key={addr.label}>
                  <span className="docs-address-label">{addr.label}</span>
                  {addr.url ? (
                    <a
                      className="docs-address-value"
                      href={addr.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {addr.value}
                    </a>
                  ) : (
                    <span className="docs-address-value">{addr.value}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="docs-layout">
          <aside className="card docs-nav" aria-label={content.navTitle}>
            <h2>{content.navTitle}</h2>
            <nav>
              {content.sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>

          <div className="docs-content">
            {content.sections.map((section) => (
              <section
                className="card docs-section"
                id={section.id}
                key={section.id}
              >
                <span className="eyebrow">{section.eyebrow}</span>
                <h2>{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {section.code && (
                  <div className="code-block">
                    {section.codeTitle && (
                      <span className="code-title">{section.codeTitle}</span>
                    )}
                    <pre>
                      <code>{section.code}</code>
                    </pre>
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
      <footer className="site-footer">
        <p>{t("footer")}</p>
      </footer>
    </div>
  );
}
