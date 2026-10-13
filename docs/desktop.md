# Windows 桌面版

当前版本 **0.3.0**，2026-10-13。本轮仅更新 Windows 版；网页版和微信小程序保持原状。

## 使用与升级

从 [GitHub Releases](https://github.com/2267li/kejian/releases/latest) 下载完整 ZIP，解压后双击“课间.exe”。需要 Windows 10/11 x64、.NET Framework 4.7.2+ 和 [Microsoft WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。程序无需管理员权限，不需要 Node、pnpm 或微信开发者工具。

本地产物在 `release/windows/v0.3.0/`。ZIP 仅包含程序、使用说明和第三方组件说明。程序未做代码签名；其他电脑可能显示未知发布者。

数据保存在 EXE 旁的“课间数据”文件夹，包含本机待办、WebView2 配置、组件和缓存。移动程序时一起保留此文件夹；更新前先保存备份并关闭程序，再替换原位置的 EXE。打开另一目录下的 EXE 会使用另一份数据，可以通过备份恢复。

备份格式与 0.2.1 兼容，仍使用 `kejian-notice-tasks-v1` 存储键和 `app: kejian / version: 1` 文件格式。恢复默认保留现有待办；同 ID 采用备份版本。覆盖全部、恢复损坏存储或关闭未保存草稿均需要确认。

## 页面与代码结构

桌面只直接打包 `desktop/ui/` 与共享识别模块 `src/core.js`，不再通过字符串替换改造网页产物。

| 文件 | 职责 |
| --- | --- |
| `desktop/Program.cs` | 单实例、组件释放、便携数据目录、原子文件写入 |
| `desktop/DesktopWindow.cs` | 原生窗口、WebView2、本地导航限制、保存对话框、退出草稿确认 |
| `desktop/ui/index.html` | 待办工作台、备份恢复、帮助与确认窗口 |
| `desktop/ui/desktop.css` | 独立桌面样式与窄窗口布局 |
| `desktop/ui/app.js` | 状态、记录校验、草稿、列表、搜索分页、备份和反馈 |
| `desktop/ui/bridge.js` | 固定消息协议；保存完成、取消、失败结果分别处理 |
| `desktop/dependency-lock.json` | WebView2 SDK 版本、官方地址和 SHA-256 |
| `scripts/build-desktop.cjs` | 资源准备、版本注入、编译、ZIP 白名单及内容校验 |
| `tests/desktop.cjs` | 实际 EXE 的隔离交互和重启回归 |

最多保存 5000 条待办，每页显示 50 条。搜索匹配事项、分类、备注和原通知。删除撤销只恢复该条记录，不用旧列表覆盖后续修改。到期摘要定时刷新时不重建列表，避免关闭展开的原通知或丢失焦点。

## 构建与验证

```powershell
pnpm run check:desktop
pnpm run test:core
pnpm run build:desktop
$env:KEJIAN_PLAYWRIGHT_MODULE = '已有的playwright模块路径'
pnpm run test:desktop
```

使用已有 .NET Framework C# 编译器，不新增全局依赖。首次按锁定地址下载微软 WebView2 SDK 到 `.cache/desktop/dependencies`，校验后复用。源码、构建和测试资料留在 `E:\Project\kejian`；其他环境应调整本机缓存路径。

构建将版本注入页面、用户说明、EXE 属性与 manifest，完整资源参与内容摘要。先在已检查路径的缓存目录编译，再写入当前版本发行目录；不覆盖旧版本。ZIP 只允许程序和两份说明，并在打包后逐文件比对摘要。微软许可及 NOTICE 随包分发。

自动化复制单个 EXE 到 `.cache/desktop/qa/run-*/便携程序`，数据留在隔离目录；不读写正常使用的 EXE 或其他端记录。使用 `--test-mode` 和专用调试端口，先等实际本地页面加载再连接。普通双击不启用调试端口。测试模式自动选择文件保存位置，原生“另存为”对话框的人工操作不在自动化范围。

验证结果和限制见 [0.3.0 验证记录](qa/desktop-v0.3.0.md)。

## 本地运行与限制

内嵌页面通过 `https://kejian.local/` 虚拟本地域名加载，不启动 HTTP 服务。页面不允许外部导航、任意系统命令或网络请求；文件桥接仅接受固定本地操作。程序没有账号、付费 API、自动收集反馈或同步服务。微软运行时自身的组件更新行为由其管理。

识别依赖本地规则，需要人工核对。仅能读取课间备份，不识别图片、PDF 或 Word 内容。生成日历文件后，需要用户自行导入日历并设置提醒；没有托盘、后台通知或自动更新。
