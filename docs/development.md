# 开发与发布说明

Windows 0.3.0 已使用独立 `desktop/ui/` 页面、样式与交互，仅共享 `src/core.js` 识别模块。当前桌面构建及测试以 [Windows 开发说明](desktop.md) 为准；下文保留网页版、小程序和本机环境的历史说明。

## 环境

Node.js 18+。统一使用本机已有的 pnpm；产品及构建脚本无第三方依赖，无需安装运行依赖。浏览器自动化为可选开发工具，不进入发布产物。优先使用已有模块路径；确需补充时先检查 pnpm store，不默认重复下载。

## 本机目录与缓存

项目固定在 `E:\Project\kejian`。源码、文档、发布包、截图、日志和临时文件都放在项目内。`pnpm-workspace.yaml` 复用已有的 `E:\.pnpm-store`，项目缓存和状态目录为 `.cache/pnpm`、`.cache/pnpm-state`；`.npmrc` 同时约束误用 npm 时的缓存位置。

PowerShell 工作前执行 `. .\scripts\project-shell.ps1`，只在当前进程设置项目临时目录。浏览器测试自动先加载 `scripts/local-env.cjs`，再加载 Playwright，确保测试配置、下载临时文件在 `.cache/temp`。已有 C 盘浏览器和 Playwright 模块仅作为已安装程序读取，不复制或重复安装。


本机使用 `pnpm run wechat:open` 打开课间，`pnpm run wechat:auto` 开启自动化端口 9420；脚本先检查用户数据目录是否指向 E:\Project，并设置 E 盘临时目录。已固定调试基础库 3.12.1，避免旧版工具使用 `latest` 后出现白屏。自动化工具已在 `.cache/wechat-tools/node_modules`，不再安装第二份；可通过 `KEJIAN_WECHAT_AUTOMATOR_MODULE` 指向已有模块。运行 `pnpm run test:wechat:runtime` 进行实际模拟器验收，测试完成后恢复原待办存储。设置 `KEJIAN_WECHAT_SCREENSHOTS=1` 可额外截图，此时需保持微信工具窗口可见；旧工具在窗口被遮挡时可能导致截图回调超时。

微信小程序工程位于 miniprogram，入口为项目根目录的 project.config.json；独立说明见 [微信开发与发布](wechat.md)。共享识别逻辑只编辑 src/core.js，然后运行 `pnpm run build:wechat`。`pnpm run package` 同时生成微信开发包。

```powershell
$env:KEJIAN_PLAYWRIGHT_MODULE = '已有的playwright模块路径'
$env:KEJIAN_BROWSER_PATH = '已有的浏览器可执行文件'
pnpm run test:browser
```

未设置浏览器路径时自动探测 Windows Edge / Chrome。未设置模块路径时 require('playwright')。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| src/index.html、style.css | 桌面双栏、手机导航、表单与帮助 |
| src/core.js | 本地日期规则、通知提取和 ICS |
| src/app.js | 待办、本地存储、导入导出、反馈 |
| src/pwa.js | 安装提示、离线状态、手动接受更新 |
| src/sw.js | 只缓存同源应用文件，不缓存用户数据 |
| src/manifest.webmanifest | 应用名称、图标、独立窗口与路径 |
| scripts/icons.cjs | 标准库生成原创勾选图标 PNG |
| scripts/build.cjs | 生成 dist 与单文件 HTML；写入内容哈希缓存版本 |
| scripts/serve.cjs | 127.0.0.1 本地服务器，默认提供 dist |
| scripts/package.cjs | 标准库生成试用 ZIP 与仅含网站文件的部署 ZIP |
| netlify.toml | Netlify 构建命令与 dist 发布目录，不含账号或凭据 |
| tests/browser.cjs | 单文件离线回归 |
| tests/pwa.cjs | 网页、缓存、移动端与独立上下文的文件迁移 |

## 修改流程

1. 修改 src；运行 pnpm run dev 构建并启动本地服务。
2. 修改后重新 pnpm run build，重新打开页面；有新版本时先保存草稿，再接受更新。
3. pnpm run check、pnpm test；涉及交互、缓存、布局时运行 pnpm run test:browser。
4. 更新文档、package.json 版本与页面短版本号。
5. pnpm run package，产物按版本保存在 release/v版本号。

开发时 Service Worker 也会缓存应用。如需从零调试，可在浏览器开发工具 Application 中注销 Service Worker 并清除缓存；清除站点数据前先备份待办。

## PWA 行为

公开部署必须 HTTPS；localhost / 127.0.0.1 可用于本机开发。局域网普通 HTTP 和 file:// 不具备完整安装与 Service Worker 条件。

首次访问完整缓存后可断网刷新。更新版本的缓存名根据源码内容哈希生成；新 Service Worker 等待用户接受，避免自动刷新正在编辑的草稿。其他标签接受更新时，不强制刷新本标签。

待办仍使用 kejian-notice-tasks-v1，0.1 备份兼容。JSON version:1 保持不变。合并按 ID 去重，同 ID 由导入内容覆盖；替换会确认。没有服务器同步、后台提醒或推送权限。

## 托管与发布

GitHub 公开源码地址为 `https://github.com/2267li/kejian`，桌面下载集中在仓库 Releases。运行 `pnpm run prepare:github` 将允许公开的源码整理到 `.cache/github/source`，清单保存在 `.cache/github/source-manifest.json`；这一步只准备文件，不上传。该目录是独立的发布仓库，保留后续公开提交记录，日常编辑仍在项目根目录进行。发布仓库使用 GitHub 的 noreply 邮箱，不携带本机原有 Git 历史。

公开快照排除 `.openai`、`.cache`、发布产物、真实备份及本机迁移记录；截图和测试通知使用模拟或注明来源的公开样本。每次发布先核对快照差异和版本，再在 `.cache/github/source` 提交并推送；不要直接推送项目根目录的旧提交。Windows 程序以明确列出的 EXE、ZIP、使用说明、第三方说明和 SHA-256 清单上传到 Releases，不递归上传整个 `release` 目录。保留开发目录和现有账号登录信息。

.openai/hosting.json 保持原 project_id，static.directory 为 dist。使用 Sites 原生源代码工作流推送源码、打包并保存/部署版本。凭据仅保存在会话内并由 stdin 传入，不进入文件或 Git。

可将 dist 的全部内容部署到其他支持 HTTPS 的静态主机；项目没有 Sites 运行时依赖。不要只上传 index.html，离线脚本、图标及 manifest 也必须存在。

Netlify 迁移步骤见 [托管说明](hosting-netlify.md)。`pnpm run package` 额外生成 `课间-网站部署包.zip`，9 个网站文件位于 ZIP 根目录及 icons 子目录；不包含文档、源码仓库或 .openai 配置。拖拽部署可直接上传整个 dist 文件夹，无需连接 Git 或在线构建。`.netlify/` 本地状态已忽略，不提交账号配置。

当前使用套餐公测包含的 Sites 权益，没有新增付费服务。该政策有额度和可用性限制。本站不做交易，未来收费功能与托管规则需另行评估。

验证依据：[MDN 安装要求](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)、[Sites 费用](https://learn.chatgpt.com/docs/pricing)。部署结果单独记在 deployment.md。
