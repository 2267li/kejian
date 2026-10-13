# Windows 桌面版

日期：2026-10-13。版本 0.2.1，免安装的 Windows x64 程序。源码及构建产物均在 `E:\Project\kejian`。

## 使用与产物

- 双击 `release/windows/v0.2.1/课间.exe`。无需启动终端、浏览器或微信开发者工具。
- 分享给试用者使用 `release/windows/v0.2.1/课间-Windows免安装版.zip`，其中只有 EXE、用户说明和第三方组件说明，不含个人数据和测试记录。
- 桌面版独立保存数据；通过“保存备份 / 恢复待办”与网页、小程序转移，数据不会自动同步。
- `课间数据` 在 EXE 旁边生成，含 WebView2 配置、持久记录、临时文件和内嵌组件展开后的缓存。移动程序或原位更新时保留此目录，先保存备份。当前 release 目录在 E 盘，因此用户数据也在 E 盘。
- 备份保存位置由用户在原生文件对话框中选择，默认目录是 EXE 旁的 `备份`。取消保存不会显示成功。
- 当前未购买代码签名证书，可能显示未知发布者。未制作安装器、自动更新、系统托盘或后台通知。

运行前提：Windows 10/11 x64、.NET Framework 4.7.2+、微软 WebView2 Runtime。本机已安装所需运行环境。其他电脑缺少 Runtime 时见 [微软下载页面](https://developer.microsoft.com/microsoft-edge/webview2/)；开发包不捆绑整个浏览器运行时。

## 目录与实现

| 路径 | 职责 |
| --- | --- |
| `desktop/Program.cs` | 单实例、内嵌文件释放、E 盘便携数据目录、程序集加载 |
| `desktop/DesktopWindow.cs` | WinForms 窗口、WebView2、本地页面限制、保存对话框、退出草稿确认 |
| `desktop/ui/` | 桌面版布局、明确的文件保存桥接和桌面操作入口 |
| `desktop/app.manifest` | 普通用户权限、Windows 与 DPI 声明 |
| `desktop/dependency-lock.json` | Microsoft.Web.WebView2 版本、官方地址与 SHA-256 |
| `scripts/build-desktop.cjs` | 准备 SDK、校验摘要、复用网页源码、编译单 EXE、生成 ZIP |
| `tests/desktop.cjs` | 实际 EXE 的离线交互、文件保存和重启测试 |

使用 C# WinForms + WebView2 承载现有 HTML/CSS/JavaScript。`src/core.js` 与网页、小程序同源。桌面构建在缓存中生成专用界面，停用 PWA 安装和 Service Worker，避免自动替换桌面程序或缓存旧页面；源网站功能不被替换。生成适配时对依赖的源码片段做存在性检查，变更时需同步调整。

以虚拟本地域名加载内嵌资源，不启动 HTTP 服务，不访问产品后端。页面不允许外部导航、弹窗或任意系统命令；文件桥接只接收本地页面的固定操作。原通知作为文字渲染。普通运行不启用调试端口。

## 构建与依赖

```text
pnpm run build:desktop
pnpm run test:desktop
```

复用系统已有 .NET Framework C# 编译器，不安装 Visual Studio、.NET SDK 或 Electron。构建由 pnpm 调用 Node 脚本；WebView2 属于微软的 .NET SDK 包，按锁定版本从官方 NuGet 下载到 `.cache/desktop/dependencies`，校验 SHA-256 后使用，不通过 npm 安装。后续构建复用缓存，临时文件也在 E 盘。

EXE 内嵌界面、图标、WebView2 托管程序集和 x64 Loader。微软许可及 NOTICE 随 ZIP 分发。程序不含账户、密钥、付费接口或遥测代码；运行时自身行为由微软组件管理。

`--test-mode` 仅供开发测试，允许指定 `--data-dir` 和 `--debug-port`，保存文件时使用隔离的 exports 目录。自动化把单个 EXE 复制到 `.cache/desktop/qa/run-*/便携程序` 测试，不读写小程序、浏览器或正常桌面版记录。正常双击不启用这些测试能力。

参考：[微软 WinForms 入门](https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winforms)、[SDK 与许可](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4258.31)、[本地目录映射](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.setvirtualhostnametofoldermapping)。
