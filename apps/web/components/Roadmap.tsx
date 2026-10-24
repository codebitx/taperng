"use client";

import { useI18n } from "./LanguageProvider";

export function Roadmap() {
  const { t } = useI18n();
  const items = [
    {
      label: t("roadmap.now"),
      text: t("roadmap.nowText"),
      tone: "now",
    },
    {
      label: t("roadmap.next1"),
      text: t("roadmap.next1Text"),
      tone: "next",
    },
    {
      label: t("roadmap.next2"),
      text: t("roadmap.next2Text"),
      tone: "next",
    },
    {
      label: t("roadmap.later"),
      text: t("roadmap.laterText"),
      tone: "later",
    },
  ];

  return (
    <section className="roadmap" aria-labelledby="roadmap-title">
      <div className="section-heading">
        <span className="eyebrow">TapeRNG</span>
        <h2 id="roadmap-title">{t("roadmap.title")}</h2>
      </div>
      <div className="roadmap-grid">
        {items.map((item) => (
          <article className={`roadmap-item ${item.tone}`} key={item.label}>
            <span className="roadmap-dot" />
            <h3>{item.label}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
