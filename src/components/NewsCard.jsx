import React from 'react';

function timeAgo(iso, lang, t) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60 * 1000) return t.justNow;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} ${t.minutesAgo}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${t.hoursAgo}`;
  return `${Math.floor(hours / 24)} ${t.daysAgo}`;
}

export default function NewsCard({ item, lang, t }) {
  const typeLabel = {
    media: t.typeMedia,
    youtube: t.typeYoutube,
    google: t.typeGoogle,
    talk: t.typeTalk,
    tiktok: t.typeTiktok,
  }[item.sourceType] || item.sourceType;

  return (
    <article className="card">
      <a className="card-main" href={item.url} target="_blank" rel="noreferrer">
        <div className="card-body">
          <div className="card-meta">
            <span className={`badge type-${item.sourceType}`}>{typeLabel}</span>
            <span className={`badge cat-${item.category}`}>
              {item.category === 'agent' ? t.agentBadge : t.aiBadge}
            </span>
            {item.sample && <span className="badge badge-sample">{t.sampleBadge}</span>}
          </div>
          <h3 className="card-title">{item.title}</h3>
          {item.summary && <p className="card-summary">{item.summary}</p>}
        </div>
        {item.thumbnail && (
          <div className="card-thumb-wrap">
            <img className="card-thumb" src={item.thumbnail} alt="" loading="lazy" />
          </div>
        )}
      </a>
      <div className="card-foot">
        <span className="card-source">{item.source}</span>
        <span className="card-time">{timeAgo(item.publishedAt, lang, t)}</span>
      </div>
    </article>
  );
}