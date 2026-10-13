# 发布记录

## GitHub 源码与 Windows 下载：0.2.1

2026-10-13（北京时间）已发布。

- 公开源码：[2267li/kejian](https://github.com/2267li/kejian)。
- 下载页面：[课间 0.2.1](https://github.com/2267li/kejian/releases/tag/v0.2.1)，推荐完整 Windows ZIP 包。
- 版本标签 `v0.2.1` 对应源码提交 `40c9ab78a42b20443c958ac9e879d50dc67cf2cd`，包含 95 个公开文件。
- 附件：Windows x64 EXE、完整 ZIP、使用说明、第三方组件许可说明和 SHA-256 校验清单。
- EXE SHA-256：`626ccde88312fc3492c70024e166d79ce56d5e6089c717c8c1c8841efc1b1997`。
- ZIP SHA-256：`7b7b55ab45afddb33067d237003052c5b694a19a5b2433cddec016f009c2bb16`。

已用不携带登录凭据的请求验证公开仓库、版本页面、标签对应关系，并下载全部 5 个附件核对字节数与 SHA-256。源码快照通过语法检查和 116 项自动测试。桌面程序沿用已验收的 EXE，本轮没有改变程序行为或重新编译。

源码与发布包没有真实待办、账号凭据或本机缓存。日常工作目录仍为 `E:\Project\kejian`，独立发布仓库位于 `.cache/github/source`，原有本地历史保留。准备与更新流程见 [开发说明](development.md)。这次操作只发布 GitHub 源码与下载包，没有重新部署网站或上线微信小程序。

## 微信小程序开发版 — 2026-10-12

已建立本地原生小程序工程，使用 touristappid 测试配置。用户有微信开发者账号，尚未取得具体小程序 AppID。未上传、未提交审核、未发布，无公开小程序码。费用范围仅接受小额认证费，未开通付费云服务。详见 [小程序说明](wechat.md)。

## 其他平台迁移准备 — 2026-10-12

目标：零付费、国内用户无需 VPN 访问。当前候选为 Netlify Free，迁移尚未完成，未生成新网址。待用户注册免费账号后部署并验证手机移动网络的实际访问。

部署文件：`dist/` 或 `release/v0.2.1/课间-网站部署包.zip`。旧 Sites 地址继续可用。不同网址之间待办数据必须手动导出/导入。平台依据及操作步骤见 [迁移说明](hosting-netlify.md)。

## 0.2.1

2026-10-12：原生部署 succeeded，保持 public 访问。

网址：[打开课间](https://kejian-notice-todo.lih2267194.chatgpt.site)

平台保存版本：2；版本 ID：appgprj_6acb97d0bc048191a7b0062f4d367eac~appgver_49403c8fc2108191838f2e84a9c07faf。

部署 ID：appgdep_6acc82cab0dc8191ab3e0b448246376f。

源码提交：88ba644cc988c38b5788132d427ecda44a05ac14。

40 条模拟样本 + 6 条官网通知摘编符合预期，10 项原有规则回归与 92 次桌面/手机通知流程通过。报告：qa/report-v0.2.1.md。测试数据不会出现在用户待办里。

## 0.2.0

本地源码：E:\Project\kejian。静态产物：dist/。

Sites 项目：appgprj_6acb97d0bc048191a7b0062f4d367eac。

状态：2026-10-11 23:06（北京时间）原生部署状态 succeeded，访问权限 public。

公开网址：[打开课间](https://kejian-notice-todo.lih2267194.chatgpt.site)

保存版本：appgprj_6acb97d0bc048191a7b0062f4d367eac~appgver_ab8c883ffe18819192d4a69f379d54d3（平台版本 1，产品版本 0.2.0）。

部署 ID：appgdep_6acba5d3a8e08191a36406cb7a6074da。

对应源码提交：25d14b1fde9e5af1939e86d24f907382e51d1786。

部署仅包含 dist 静态资源和托管清单；不包含文档、测试、开发依赖或用户通知。

Windows 打包使用已有 Git Bash：为该进程将 D:\Git\bin 和 D:\Git\usr\bin 放到 PATH 前部，并设置 TAR_OPTIONS=--force-local，避免误用未配置的 WSL 和把盘符识别为远程主机。未修改系统级配置。

使用现有公测权益，未购买服务器、域名或 API。后续受平台免费/套餐额度及政策影响。
