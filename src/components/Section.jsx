import React from 'react';
import NewsCard from './NewsCard.jsx';

export default function Section({ title, desc, badge, badgeClass, items, lang, t }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">
          <span className={`section-badge ${badgeClass || ""}`}>{badge}</span>
          {title}
        </h2>
        <p className="section-desc">{desc}</p>
      </div>
      <div className="grid">
        {items.map((item) => (
          <NewsCard key={item.id} item={item} lang={lang} t={t} />
        ))}
      </div>
    </section>
  );
}