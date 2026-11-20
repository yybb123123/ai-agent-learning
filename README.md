# AI Agent Learning — 112-Day Study Workspace

这是从 `yybb123123/gdscript-lesson/ai-agent-study/` 单独迁移出来的公开学习网页。

## 计划的新仓库与网页

- 仓库：`https://github.com/yybb123123/ai-agent-learning`
- GitHub Pages：`https://yybb123123.github.io/ai-agent-learning/`

**上面两个地址只有在创建新公开仓库、上传本目录文件、启用 Pages 后才生效。**

## 快速部署

1. 在 GitHub 新建仓库，名称 `ai-agent-learning`，选择 **Public**。
2. 将 `index.html`、`README.md`、`.nojekyll` 放在仓库根目录 `main` 分支（不要放入子文件夹）。
3. GitHub 仓库进入 **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**。
4. 等 Pages 部署完成，打开 `https://yybb123123.github.io/ai-agent-learning/`。
5. 新站验证正常后，再删除旧仓库 `gdscript-lesson/ai-agent-study/` 中的文件。迁移前建议在旧站点击「备份记录」，新站点击「导入记录」。

## 当前功能和注意事项

- 包含 16 周 / 112 天课程、资源链接、每日学习内容、费曼学习法、周复盘、进度、学习笔记及 JSON 备份导入。
- **公开只代表网页代码和课程计划可见**。学习记录保存在设备浏览器的 `localStorage`；不会自动上传 GitHub，也不会跨设备自动同步。请定期导出备份。不要在网页录入真实学生/员工的敏感数据。
- GitHub Pages 不具备 Python 后端、用户身份认证或秘密密钥存储，因此**DeepSeek 助教在这个公开静态网页中暂不可用**。不要将 API Key 写入 HTML、JavaScript、Git 提交、公开环境变量或静态配置文件。
- 如需手机与电脑自动同步学习笔记，需单独部署具备登录权限控制的私有云数据库/服务。公开网页可以保持免费、无登录，但私人笔记的同步服务必须鉴权。
- 如希望手机使用 DeepSeek，须配置带认证、速率限制、预算上限和安全密钥存储的 API 代理。该功能未在此包中实现。

## 原始项目

本迁移包不包含原来的 `gdscript-lesson` 项目内容，便于完全独立管理。