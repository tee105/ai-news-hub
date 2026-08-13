#!/usr/bin/env node
/**
 * AI News Hub 数据同步脚本
 * 抓取 sources.json 中配置的 RSS/Atom 源，去重分类后写入 public/data/news.json
 * 用法:
 *   node scripts/sync.mjs            # 正常同步(遵守 cadence)
 *   node scripts/sync.mjs --force    # 忽略 cadence 强制全量刷新
 *   node scripts/sync.mjs --dry-run  # 只抓取报告，不写文件
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCES_FILE = path.join(ROOT, 'scripts', 'sources.json');
const STATE_FILE = path.join(ROOT, '.last-sync.json');
const OUT_FILE = path.join(ROOT, 'public', 'data', 'news.json');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 500;
const MAX_AGE_DAYS = 21;
const FETCH_TIMEOUT_MS = 20000;
const USER_AGENT = 'Mozilla/5.0 (compatible; AI-News-Hub/1.0; +https://github.com/)';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');

function log(...msgs) { console.log('[sync]', ...msgs); }

function hashId(str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
}

function decodeEntities(str = '') {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(str = '') {
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(block, re) {
  const m = block.match(re);
  return m ? m[1] : null;
}

function parseFeed(xml, source) {
  const isAtom = /<feed[\s>]/.test(xml.slice(0, 500));
  const itemRe = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/g : /<item[\s>][\s\S]*?<\/item>/g;
  const items = [];
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[0];
    const title = decodeEntities(firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/i) || '')
      .replace(/\s+/g, ' ').trim();
    let url = '';
    if (isAtom) {
      const linkM = block.match(/<link[^>]*href="([^"]+)"/i);
      url = linkM ? linkM[1] : '';
    } else {
      const linkM = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || block.match(/<link[^>]*href="([^"]+)"/i);
      url = linkM ? decodeEntities(linkM[1]).trim() : '';
    }
    const rawDate = isAtom
      ? (firstMatch(block, /<published>([\s\S]*?)<\/published>/i) || firstMatch(block, /<updated>([\s\S]*?)<\/updated>/i))
      : firstMatch(block, /<pubDate>([\s\S]*?)<\/pubDate>/i);
    const publishedAt = rawDate ? new Date(decodeEntities(rawDate).trim()).toISOString() : null;
    const summaryRaw = isAtom
      ? (firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i) || firstMatch(block, /<content[^>]*>([\s\S]*?)<\/content>/i))
      : firstMatch(block, /<description[^>]*>([\s\S]*?)<\/description>/i);
    const summary = stripHtml(decodeEntities(summaryRaw || '')).slice(0, 300);
    const thumbM = block.match(/<media:thumbnail[^>]*url="([^"]+)"/i)
      || block.match(/<media:content[^>]*url="([^"]+)"/i)
      || block.match(/<enclosure[^>]*url="([^"]+)"/i)
      || block.match(/<itunes:image[^>]*href="([^"]+)"/i);
    const thumbnail = thumbM ? thumbM[1] : null;
    if (!title || !url) continue;
    items.push({ title, url, publishedAt, summary, thumbnail });
  }
  return items;
}

function classify(category, title, summary, keywords) {
  if (category === 'ai' || category === 'agent') return category;
  const text = `${title} ${summary}`.toLowerCase();
  return keywords.some((k) => text.includes(k.toLowerCase())) ? 'agent' : 'ai';
}

function makeItem(raw, source, keywords) {
  const publishedAt = raw.publishedAt || new Date().toISOString();
  const category = classify(source.category, raw.title, raw.summary, keywords);
  const id = hashId(`${source.id}:${raw.url}:${raw.title}`);
  return {
    id,
    title: raw.title,
    url: raw.url,
    source: source.name,
    sourceType: source.type,
    category,
    publishedAt,
    summary: raw.summary,
    thumbnail: raw.thumbnail,
    fetchedAt: new Date().toISOString(),
  };
}

function getSystemProxy() {
  const fromEnv = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  if (fromEnv) {
    try {
      const u = new URL(fromEnv.includes('://') ? fromEnv : `http://${fromEnv}`);
      if (u.hostname) return { host: u.hostname, port: Number(u.port) || 80 };
    } catch (e) { /* ignore */ }
  }
  if (process.platform === 'win32') {
    try {
      const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
      const enable = execFileSync('reg', ['query', key, '/v', 'ProxyEnable'], { encoding: 'utf8' });
      if (!/0x1/.test(enable)) return null;
      const server = execFileSync('reg', ['query', key, '/v', 'ProxyServer'], { encoding: 'utf8' });
      const m = server.match(/ProxyServer\s+REG_SZ\s+(\S+)/);
      if (m && m[1]) {
        const [host, port] = m[1].split(':');
        return { host, port: Number(port) || 80 };
      }
    } catch (e) { /* ignore */ }
  }
  return null;
}

function fetchViaProxy(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const proxy = getSystemProxy();
    if (!proxy) return reject(new Error('未检测到可用代理'));
    const port = Number(target.port) || (target.protocol === 'http:' ? 80 : 443);
    const creq = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${target.hostname}:${port}`,
      headers: { Host: `${target.hostname}:${port}` },
      timeout: timeoutMs,
    });
    creq.on('timeout', () => { creq.destroy(new Error('代理 CONNECT 超时')); });
    creq.on('error', (e) => reject(new Error(`代理连接失败: ${e.message}`)));
    creq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        return reject(new Error(`代理 CONNECT 失败: HTTP ${res.statusCode}`));
      }
      const tlsSocket = target.protocol === 'https:'
        ? tls.connect({ socket, servername: target.hostname })
        : socket;
      const onSecure = () => {
        const pathAndQuery = target.pathname + target.search;
        const reqText = `GET ${pathAndQuery} HTTP/1.1\r\nHost: ${target.hostname}\r\nUser-Agent: ${USER_AGENT}\r\nAccept: application/rss+xml, application/atom+xml, application/xml, text/xml, */*\r\nConnection: close\r\n\r\n`;
        const chunks = [];
        let headBuffer = Buffer.alloc(0);
        let status = 0;
        let headDone = false;
        let settled = false;
        const done = (err, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          tlsSocket.destroy();
          if (err) reject(err);
          else resolve(result);
        };
        const timer = setTimeout(() => done(new Error('代理抓取超时')), timeoutMs);
        tlsSocket.on('data', (d) => {
          if (!headDone) {
            headBuffer = Buffer.concat([headBuffer, d]);
            const idx = headBuffer.indexOf('\r\n\r\n');
            if (idx >= 0) {
              headDone = true;
              const head = headBuffer.slice(0, idx).toString('latin1');
              status = Number((head.match(/^HTTP\/1\.[01] (\d+)/) || [])[1] || 0);
              const rest = headBuffer.slice(idx + 4);
              if (rest.length) chunks.push(rest);
            }
          } else {
            chunks.push(d);
          }
        });
        tlsSocket.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          done(null, { status, text: () => body });
        });
        tlsSocket.on('error', (e) => done(new Error(`代理隧道错误: ${e.message}`)));
        tlsSocket.write(reqText);
      };
      if (target.protocol === 'https:') {
        tlsSocket.on('secureConnect', onSecure);
        tlsSocket.on('error', (e) => reject(new Error(`TLS 握手失败: ${e.message}`)));
      } else {
        onSecure();
      }
    });
    creq.end();
  });
}

async function fetchFeed(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' };
  try {
    let res;
    try {
      res = await fetch(source.url, { signal: controller.signal, headers });
    } catch (directErr) {
      const viaProxy = await fetchViaProxy(source.url, FETCH_TIMEOUT_MS);
      if (viaProxy.status < 200 || viaProxy.status >= 300) {
        throw new Error(`HTTP ${viaProxy.status}`);
      }
      const xml = await viaProxy.text();
      if (!/<(?:rss|feed)[\s>]/i.test(xml)) throw new Error('不是有效的 RSS/Atom 文档');
      return xml;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    if (!/<(?:rss|feed)[\s>]/i.test(xml)) throw new Error('不是有效的 RSS/Atom 文档');
    return xml;
  } finally {
    clearTimeout(timer);
  }
}

async function loadJson(file, fallback) {
  try {
    if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    log(`读取 ${path.basename(file)} 失败，使用默认: ${e.message}`);
  }
  return fallback;
}

async function main() {
  const config = await loadJson(SOURCES_FILE, { sources: [], agentKeywords: [] });
  const sources = config.sources || [];
  const keywords = config.agentKeywords || [];
  const state = await loadJson(STATE_FILE, {});
  const existing = await loadJson(OUT_FILE, { generatedAt: null, items: [] });

  const now = Date.now();
  const freshItems = (existing.items || []).filter((it) => {
    const t = new Date(it.publishedAt).getTime();
    return !Number.isNaN(t) && now - t < MAX_AGE_DAYS * DAY_MS;
  });

  const seen = new Set(freshItems.map((it) => it.id));
  const newItems = [];
  const failures = [];
  const skipped = [];
  let fetchedCount = 0;

  for (const source of sources) {
    const last = state[source.id] ? new Date(state[source.id]).getTime() : 0;
    const cadence = Number(source.cadence) || 1;
    const due = FORCE || !last || now - last >= cadence * DAY_MS;
    if (!due) {
      skipped.push(source.id);
      continue;
    }
    let xml;
    try {
      xml = await fetchFeed(source);
      const parsed = parseFeed(xml, source);
      if (parsed.length === 0) throw new Error('解析出 0 条内容');
      for (const raw of parsed.slice(0, 50)) {
        const item = makeItem(raw, source, keywords);
        if (!seen.has(item.id)) {
          seen.add(item.id);
          newItems.push(item);
        }
      }
      state[source.id] = new Date(now).toISOString();
      fetchedCount += 1;
      log(`✓ ${source.name}: ${parsed.length} 条 (新增 ${newItems.length})`);
    } catch (e) {
      failures.push({ id: source.id, name: source.name, error: e.message });
      if (source.type === 'tiktok' && source.fallbackUrl) {
        const id = hashId(`tiktok-fallback:${source.id}`);
        if (!seen.has(id)) {
          seen.add(id);
          newItems.push({
            id,
            title: `${source.name} · 搜索入口`,
            url: source.fallbackUrl,
            source: source.name,
            sourceType: 'tiktok',
            category: classify(source.category, 'AI agent', '', keywords),
            publishedAt: new Date(now).toISOString(),
            summary: 'RSSHub 桥接暂时不可用，前往 TikTok 标签页查看最新 AI 短视频。',
            thumbnail: null,
            fetchedAt: new Date(now).toISOString(),
          });
        }
      }
    }
  }

  const allItems = [...freshItems, ...newItems]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ITEMS);

  const summary = {
    generatedAt: new Date(now).toISOString(),
    fetchedSources: fetchedCount,
    items: allItems,
  };

  log(`—— 本次抓取: ${fetchedCount}/${sources.length} 源，新增 ${newItems.length} 条，总计 ${allItems.length} 条`);
  if (skipped.length) log(`跳过未到期源 (${skipped.length}): ${skipped.join(', ')}`);
  if (failures.length) {
    log('以下源抓取失败:');
    for (const f of failures) log(`  ✗ ${f.name} (${f.id}): ${f.error}`);
  }

  if (DRY_RUN) {
    log('[dry-run] 未写入任何文件');
    process.exit(0);
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(summary, null, 2), 'utf8');
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  log(`✓ 已写入 ${OUT_FILE}`);

  process.exit(0);
}

main().catch((e) => {
  console.error('[sync] 致命错误:', e);
  process.exit(1);
});