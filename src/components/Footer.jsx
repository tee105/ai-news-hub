import React from 'react';

export default function Footer({ t }) {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p className="footer-note">{t.footerNote}</p>
        <p className="footer-edit">{t.footerSources}: scripts/sources.json · {t.footerEdit}</p>
      </div>
    </footer>
  );
}