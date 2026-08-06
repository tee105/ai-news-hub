import React from 'react';

const TABS = ['all', 'ai', 'agent'];

export default function FilterBar({ t, tab, setTab, typeFilter, setTypeFilter, query, setQuery }) {
  const typeLabels = {
    all: t.filterAll,
    media: t.typeMedia,
    youtube: t.typeYoutube,
    google: t.typeGoogle,
    talk: t.typeTalk,
    tiktok: t.typeTiktok,
  };
  const tabLabels = { all: t.navAll, ai: t.navAi, agent: t.navAgent };

  return (
    <div className="filter-bar">
      <div className="tabs">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setTab(key)}
          >
            {tabLabels[key]}
          </button>
        ))}
      </div>
      <div className="filter-row">
        <div className="chips">
          {Object.keys(typeLabels).map((key) => (
            <button
              key={key}
              type="button"
              className={typeFilter === key ? 'chip active' : 'chip'}
              onClick={() => setTypeFilter(key)}
            >
              {typeLabels[key]}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          type="search"
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
    </div>
  );
}