# DeepSeek AI 学习助教：GitHub Pages + Cloudflare Worker

这个工作流适用于公开的个人学习网页 `https://yybb123123.github.io/ai-agent-learning/`，在手机和电脑均可使用。

## 先了解哪些内容公开、哪些必须保密

- 公开 GitHub 仓库：`index.html`、本文件和 `deepseek-worker.js`（**只有代码，不含秘密**）。
- Cloudflare Worker 的 **Secrets**：`DEEPSEEK_API_KEY`（DeepSeek 付费 API 密钥）、`STUDY_ACCESS_TOKEN`（另一串独立随机个人访问口令）。
- 学习网页：只配置 Worker HTTPS 根网址，以及在当前页面输入个人访问口令（不是 DeepSeek API Key）。访问口令只保留在当前页面内存中，**不加入 localStorage、JSON 备份或 GitHub**。
- 调用 DeepSeek 时，发送你主动选择的课程题目、提问，以及在费曼点评模式中填写的复述。不要发送真实儿童、家长和员工敏感数据。
- 本方案是单人轻量方案，不包含严格的每日请求上限或费用硬封顶。建议 DeepSeek 不开启自动充值、余额保持小额，并定期查看消费；访问口令泄露需立即轮换。

## 1. 注册并准备 DeepSeek API

1. 打开 https://platform.deepseek.com/ ，登录后进入 **API Keys** 创建 API Key（一般显示一次）。
2. 在官方 [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/) 核对余额、模型和单价；初期用 `deepseek-flash`。
3. 不要在 ChatGPT 对话、GitHub issue、网页代码或截图中发送完整密钥。

## 2. 创建 Cloudflare Worker（免费额度足够个人学习试用）

1. 打开 https://dash.cloudflare.com/ 登录 Cloudflare。
2. 找到 **Workers & Pages → Create / Create Worker**，使用默认 Hello World 创建 Worker，名称可为 `asos-study-deepseek`。
3. 找到 **Edit Code** / **Edit**，将 GitHub 仓库中 [deepseek-worker.js](https://github.com/yybb123123/ai-agent-learning/blob/main/cloudflare/deepseek-worker.js) 的全部代码复制到 Worker 编辑器，覆盖默认代码，点击 **Deploy**。
4. 记下 Worker 完整根网址，例如 `https://asos-study-deepseek.你的Cloudflare子域.workers.dev`，不要追加 `/api/chat`。

注意：`workers.dev` 网页必须启用；如果你的 Cloudflare 控制台显示了不同菜单名，按 Workers 当前的部署入口操作即可。

## 3. Cloudflare Worker 内添加两个 Secret（不是普通公开变量）

在 **Workers & Pages → 选中 Worker → Settings → Variables and Secrets → Add** 中分别添加：

| Type | Variable name | Value |
| --- | --- | --- |
| **Secret** | `DEEPSEEK_API_KEY` | 在 DeepSeek 控制台生成的 API Key |
| **Secret** | `STUDY_ACCESS_TOKEN` | 另一串随机口令，至少 32 个字符 |

第二个口令必须和 DeepSeek API Key **不同**。

在 Mac 终端可以生成随机口令：

```bash
openssl rand -hex 24
```

这会生成 48 个随机十六进制字符。将它私下保存到密码管理器，配置到 Cloudflare Secret，之后只在自己的学习网页「个人访问口令」输入框使用。

Secret 添加/更新后按 Cloudflare 控制台提示保存并部署最新版本。

## 4. 回到学习网页启用 AI

打开 https://yybb123123.github.io/ai-agent-learning/

在右侧 **DeepSeek 学习助教 → 首次连接 DeepSeek 助教**：

1. **Cloudflare Worker 服务地址**：填刚才获得的 `https://名称.账号.workers.dev`（根网址）。
2. **个人访问口令**：填 `STUDY_ACCESS_TOKEN`，**绝不填 DeepSeek API Key**。
3. 点击 **保存服务地址 / 验证连接**，看到「DeepSeek 安全中转已连接」才算完成。
4. 模型选择 `deepseek-flash`，辅导模式选「解释今日概念」，输入一个测试问题，点击「发送给助教」。

网页在手机 Safari 上操作相同。刷新网页时为安全起见需要重新输入个人访问口令；课程与学习记录不会因此清空。

## 5. 排障与安全

| 显示 | 检查 |
| --- | --- |
| 个人访问口令不正确 / HTTP 401 | Cloudflare `STUDY_ACCESS_TOKEN` 是否与网页输入一致 |
| Cloudflare secrets are not configured / 503 | 是否配置两个 Secret、口令是否至少 32 字符、是否已部署 |
| DeepSeek API Key 无效 / 502 | `DEEPSEEK_API_KEY` 是否正确、是否有余额与 API 访问权限 |
| 账户余额不足 / 402 | 进入 DeepSeek 控制台查看余额，不要贸然自动充值 |
| 请求失败 / CORS | 检查 Worker 服务地址、GitHub Pages 是否在 `https://yybb123123.github.io`、Worker 是否启用 |
| 请求超时 / 504 | 可能是上游模型延迟，稍后尝试 Flash |

**CORS 不是访问控制。** Worker 同时验证独立的随机 `STUDY_ACCESS_TOKEN`。未经你的口令，别人即便访问公开网页，也不能使用你的 DeepSeek API Key。

Worker 仅支持 `GET /api/status` 和 `POST /api/chat`，只接受合法来源和口令，不会把真实 DeepSeek 密钥返回浏览器。单次请求上限为 24KB，模型回复上限 900 tokens；默认关闭模型推理模式以减少成本。没有配置额外的账户级日费用硬上限。

### 官方资料

- [DeepSeek API 首次调用](https://api-docs.deepseek.com/)
- [DeepSeek Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)
- [DeepSeek 模型和定价](https://api-docs.deepseek.com/quick_start/pricing/)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Worker 免费层](https://developers.cloudflare.com/workers/platform/pricing/)
