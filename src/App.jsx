import React, { useEffect, useMemo, useState } from 'react';
import { translations, sourceTypeKeys } from './i18n.js';
import Header from './components/Header.jsx';
import FilterBar from './components/FilterBar.jsx';
import Section from './components/Section.jsx';
import Footer from './components/Footer.jsx';
import sampleData from './data/sample-news.json';

const STORAGE_KEY = 'ai-news-lang';

function getInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch (e) { /* ignore */ }
  return navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export default function App() {
  const [lang, setLang] = useState(getInitialLang);
  const [data, setData] = useState({ generatedAt: null, items: [], sample: true });
  const [tab, setTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/data/news.json', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled && Array.isArray(json.items)) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(sampleData);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
  }, [lang]);

  const t = translations[lang];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data.items || []).filter((item) => {
      if (tab !== 'all' && item.category !== tab) return false;
      if (typeFilter !== 'all' && item.sourceType !== typeFilter) return false;
      if (q) {
        const haystack = `${item.title} ${item.source} ${item.summary || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, tab, typeFilter, query]);

  const aiItems = filtered.filter((it) => it.category === 'ai');
  const agentItems = filtered.filter((it) => it.category === 'agent');

  return (
    <div className="app">
      <Header lang={lang} setLang={setLang} t={t} data={data} />
      <main className="container">
        {data.sample && (
          <div className="sample-banner">
            <span className="sample-dot" />
            {t.sampleNotice}
          </div>
        )}
        <FilterBar
          t={t}
          tab={tab}
          setTab={setTab}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          query={query}
          setQuery={setQuery}
        />
        {(tab === 'all' || tab === 'ai') && (
          <Section
            key="ai"
            title={t.aiSectionTitle}
            desc={t.aiSectionDesc}
            badge={t.aiBadge}
            items={aiItems}
            lang={lang}
            t={t}
          />
        )}
        {(tab === 'all' || tab === 'agent') && (
          <Section
            key="agent"
            title={t.agentSectionTitle}
            desc={t.agentSectionDesc}
            badge={t.agentBadge}
            badgeClass="agent-badge"
            items={agentItems}
            lang={lang}
            t={t}
          />
        )}
        {filtered.length === 0 && (
          <div className="empty-state">
            <p className="empty-title">{t.emptyTitle}</p>
            <p className="empty-hint">{t.emptyHint}</p>
          </div>
        )}
      </main>
      <Footer t={t} />
    </div>
  );
}