# 手机与电脑学习进度同步（只同步个人学习资料）

目前这个学习网站有三套互相独立的学习记录：

| 网页 | 同步范围 | Cloudflare API |
| --- | --- | --- |
| [AI Agent 112 天主课程](https://yybb123123.github.io/ai-agent-learning/) | 每日完成状态、费曼练习、总结、AI 辅导记录、周复盘、学习日期、NotebookLM 笔记本映射 | `/api/sync/main` |
| [Anthropic CCAR-F 21 天备考](https://yybb123123.github.io/ai-agent-learning/exam-prep.html) | 每日笔记、实践、费曼复述、信心分数、NotebookLM 链接 | `/api/sync/exam` |
| [Anthropic 七门课程](https://yybb123123.github.io/ai-agent-learning/anthropic-courses.html) | 48 次学习任务、笔记、实践证据和完成状态 | `/api/sync/courses` |

**目前 GitHub 仓库已添加网页与 Worker 的同步代码，但只有按下方完成你自己的 Cloudflare 部署后，才会真正开始同步。** 不要在 Cloudflare 配置完成前把“代码已提交”误当成“云端同步已启用”。

## A. 在 Cloudflare 创建 D1 数据库

1. 登录 https://dash.cloudflare.com/ 。
2. 左侧进入 **Storage & Databases → D1 SQL Database**（新版界面名称可能是 D1，部分账号显示在 Compute & AI 下）。
3. 点击 **Create database**，建议名称：`asos-personal-study`。
4. 保持默认区域 / 配置，创建数据库；不需要提前运行 SQL。
5. 打开 **Workers & Pages → asos-study-deepseek → Settings → Bindings**。
6. 点击 **Add binding → D1 database**，选择刚创建的 `asos-personal-study`。
7. **Variable name 必须是 `STUDY_DB`**（区分大小写）。完成并部署绑定。

本方案的 Worker 会在首次访问同步接口时自动执行一次 CREATE TABLE IF NOT EXISTS；你无需手动创建表。

## B. 把 GitHub 最新 Worker 代码重新部署至 Cloudflare

你此前部署的 Worker 代码**只支持 DeepSeek 聊天**，不会随着 GitHub 更新而自动更改。

1. 打开 GitHub 仓库的最新版：[cloudflare/deepseek-worker.js](https://github.com/yybb123123/ai-agent-learning/blob/main/cloudflare/deepseek-worker.js)。
2. 点击 GitHub 的 **Copy raw file**。
3. Cloudflare → Workers & Pages → `asos-study-deepseek` → **Edit Code**。
4. 在编辑器中完整替换原有 Worker 代码，点击 **Deploy**。
5. 在 Settings 中确认 D1 绑定的名称恰好是 `STUDY_DB`。
6. 你原来的两个 Secret `DEEPSEEK_API_KEY` 与 `STUDY_ACCESS_TOKEN` 不需要重新生成或在代码中输入，保留现有值。

更新后的 Worker 同时支持：

- 原有 DeepSeek 助教请求 `/api/chat`。
- 原有口令检测 `/api/status`。
- 三个个人学习同步接口 `/api/sync/main`、`/api/sync/exam`、`/api/sync/courses`。

## C. 在 Mac 上首次同步

1. **先在三套学习网页分别导出原有 JSON 学习记录备份**。不要跳过。
2. 打开主学习网页，找到页面上方的 **☁️ 手机与电脑学习进度同步**。
3. Worker 地址使用 `https://asos-study-deepseek.coolloveice.workers.dev`。
4. **个人访问口令**输入已保存的 `STUDY_ACCESS_TOKEN`（不是 DeepSeek API Key）。
5. 点击 **连接并同步**，等待状态显示 **已同步 · 云端版本 X**。
6. 另外打开认证备考页、七门课程页，分别点击 **连接并同步**（同一浏览会话通常可以复用访问口令）。

## D. 在 iPhone 上首次同步

1. 打开相同的学习网址。
2. 在对应网页顶部的同步面板填写 Worker 地址和同一个 `STUDY_ACCESS_TOKEN`。
3. 点击 **连接并同步**。如果 iPhone 此前没有笔记，系统会下载 Mac 云端已有记录，而不是用空白记录覆盖。
4. 等待 **已同步**。以后在该页面记笔记时会自动同步；页面重新获得焦点时也会检查最新版本。
5. 三套学习网页数据分开同步，因此需要分别进入三套页面并首次连接一次。

关闭标签页或浏览器后可能需要重新输入个人访问口令；学习笔记本身仍保存在浏览器并存入 D1。默认口令只在该标签页的 sessionStorage 中保留，**不上传到云端**。

## E. 发生两台设备编辑冲突时

如果两台设备同时修改同一天的同一个字段，系统**暂停自动同步**，不随意覆盖你的笔记。

- 先分别下载 **本机副本** 与 **云端副本**。
- 选择以某一端的冲突字段为准；没有冲突的字段尽量三方合并。
- 在手机、Mac 上确认最终笔记，并再次同步。

每套学习记录仍可以使用网页原有的 **JSON 导出 / 导入备份** 功能。Cloudflare D1 不会自动同步到 NotebookLM 本身；保存的是学习网页中的总结与链接。

## 技术和费用边界

- Cloudflare D1 是持久化数据库，存放在你自己的 Cloudflare 账户，不写进公开 GitHub。
- 同步数据不调用 DeepSeek，不产生额外 DeepSeek Token 用量。
- Cloudflare 免费账户对 D1 有免费使用配额。具体额度和超限行为按 Cloudflare 当前官方定价执行：https://developers.cloudflare.com/d1/platform/pricing/ 。
- 这是单人的轻量同步方案，不包含账号注册系统或多用户管理。
- **这不是端到端加密的笔记服务。** 不要用它保存你的密码、API Key 或其他机密凭证。
- Worker 同时验证访问来源和 STUDY_ACCESS_TOKEN；GitHub Pages 的公开代码不包含你的私人访问口令。
- 数据库单次同步文档上限约 700 KB；如果笔记较长达到限制，请导出 JSON 备份并检查 AI 对话历史长度。

故障排查：

| 提示 | 原因与操作 |
| --- | --- |
| `尚未绑定 Cloudflare D1` | 在 Worker 添加 D1 Binding，名字为 `STUDY_DB` |
| `Unknown endpoint` | 还在使用旧 Worker；重新部署 GitHub 最新代码 |
| `401` 或访问口令不正确 | 输入你已经设定的 STUDY_ACCESS_TOKEN |
| `403` 或 CORS 错误 | 必须从正式 GitHub Pages 网站打开，不要直接打开 Worker URL |
| `503` | 检查 D1 Binding、Worker 部署和 Cloudflare 服务状态 |
| 记录冲突 | 先导出双方 JSON，再选择解决方式 |
