import React from 'react';

export default function Header({ lang, setLang, t, data }) {
  const lastUpdated = data.generatedAt ? new Date(data.generatedAt) : null;
  const timeStr = lastUpdated
    ? lastUpdated.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">◇</span>
          <div>
            <h1 className="brand-name">{t.siteName}</h1>
            <p className="brand-tagline">{t.siteTagline}</p>
          </div>
        </div>
        <div className="header-right">
          <span className="updated" title={t.lastUpdated}>
            {t.lastUpdated} {timeStr}
          </span>
          <div className="lang-toggle">
            <button
              type="button"
              className={lang === 'zh' ? 'lang-btn active' : 'lang-btn'}
              onClick={() => setLang('zh')}
            >
              中文
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'lang-btn active' : 'lang-btn'}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}