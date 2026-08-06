# AI Pulse · AI 脉搏

AI 进展与智能体 Agent 每日新闻聚合网站。聚合科技媒体、YouTube、Google News、会议演讲与 TikTok 上的 AI / Agent 内容，每日自动更新。

## 功能

- **AI 进展**：大模型、算力、产品与研究的每日动态。
- **Agent 智能体**：智能体框架、工具调用与自动化进展（同样每日更新，可在 `sources.json` 中为每个源单独配置刷新间隔 `cadence`）。
- 中英双语界面（右上角切换，默认跟随浏览器语言）。
- 来源类型过滤（媒体 / YouTube / Google News / 演讲 / TikTok）与关键词搜索。
- 离线示例数据：未联网时自动使用 `src/data/sample-news.json` 预览。

## 本地运行

```bash
npm install
npm run dev          # 开发预览（无网时展示示例数据）
npm run build        # 构建到 dist/
npm run preview      # 预览构建产物
```

## 数据更新

```bash
npm run sync          # 抓取所有到期源，写入 public/data/news.json
npm run sync:force    # 忽略 cadence，强制全量刷新
npm run sync:dry      # 只抓取并报告，不写文件
```

- 源列表在 `scripts/sources.json` 中维护，每个源可配置：
  - `type`: `media` 科技媒体 / `google` Google News / `youtube` YouTube / `talk` 会议演讲 / `tiktok` TikTok
  - `category`: `ai` / `agent` / `auto`（auto = 按 `agentKeywords` 自动归类）
  - `cadence`: 刷新间隔天数，默认 1 天（每日）
  - TikTok 源：先尝试 RSSHub 桥接，失败则降级为搜索链接入口
- 抓取进度记录在 `.last-sync.json`，未到期的源会自动跳过。

## 自动化与部署

- `.github/workflows/sync.yml`：每天 08:00 UTC 自动抓取并提交数据更新。
- `netlify.toml`：Netlify 构建配置（`npm run build` → `dist`）。
- 将仓库关联 Netlify 后，推送到 GitHub 即自动构建发布；也可手动部署：
  ```bash
  npm run sync && npm run build
  npx netlify deploy --prod --dir dist --no-build
  ```

## 项目结构

```
ai-news-hub/
├── scripts/
│   ├── sync.mjs          # 抓取/解析/去重/分类/写数据
│   └── sources.json      # 数据源配置（可增删、调 cadence）
├── src/
│   ├── App.jsx           # 主应用（双语、筛选、搜索）
│   ├── i18n.js           # 中英文案
│   ├── styles.css        # 样式
│   ├── components/       # Header/FilterBar/Section/NewsCard/Footer
│   └── data/sample-news.json  # 离线示例数据
├── public/data/news.json # 同步脚本生成的新闻数据
├── .github/workflows/sync.yml
└── netlify.toml
```

## 说明

- 聚合内容来自公开 RSS 与搜索引擎，版权归原作者所有。
- 部分源地址可能失效，脚本会自动跳过并记录；如需调整请在 `sources.json` 中修改。