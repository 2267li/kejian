# Netlify 免费托管迁移

核对日期：2026-10-12。当前阶段为文件准备完成、等待账号和正式部署；旧 Sites 网址仍是唯一已发布的课间网址。

## 平台选择与费用

当前候选是 Netlify Free。官方文档说明，新账号免费套餐为每月 300 credits，有硬上限且不能自动充值；达到免费额度后可能暂停服务，不自动收取超额费用。发布次数、访问流量等共同消耗额度。因此适合先试用，不能承诺无限访问。注册时选择 Free，不购买域名或付费附加项。

- [免费套餐与额度](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- [官方拖拽部署说明](https://docs.netlify.com/manage/projects/add-new-project/)

腾讯 EdgeOne Pages 的[默认域名规则](https://edgeone.cloud.tencent.com/pages/document/175191784523485184)明确：含大陆区域使用的预览链接有效期 3 小时；不含大陆区域的默认域名对大陆访问返回 401。对本项目的零预算、长期公开网址要求不合适，暂不采用。

## 访问验证的边界

本机使用 curl 的 `--noproxy '*'`，分别请求 Netlify 注册页和官方示例站 `https://feature-tour.netlify.app`，两者返回 HTTP 200。这仅证明本机当时绕过应用代理的请求成功，无法排除系统 VPN/TUN 或上游路由的影响，也不代表课间新网址或全国网络已经验证。

正式部署后，需在不使用 VPN 的电脑网络及手机移动网络中访问课间新网址，确认页面、图标和脚本完整加载；其中手机移动网络验证仍待完成。无法打开时先记录网络和错误，再选择其他平台，不宣称“全国保证可用”。

## 文件位置

- 源码：`E:\Project\kejian\src`
- 可直接拖拽上传的文件夹：`E:\Project\kejian\dist`
- 独立部署 ZIP：`E:\Project\kejian\release\v0.2.1\课间-网站部署包.zip`
- 更新产物：在项目根目录执行 `npm run package`。

网站部署 ZIP 只有 9 个文件，index.html 位于根目录，图标位于 icons 子目录。上传整份 dist 或解压后根目录，不使用“课间-免费试用包.zip”作为网站根目录，因为它还包含说明及离线版，网站在内层目录。

## 注册与首次发布

1. 打开 [注册页面](https://app.netlify.com/signup)，由账号本人完成邮箱验证，选择 Free 套餐。
2. 登录后进入 [Netlify Drop](https://app.netlify.com/drop)。
3. 将整个 `E:\Project\kejian\dist` 文件夹拖入上传区。已经本地构建，不需要在线生成代码、安装依赖或连接 GitHub。
4. 等待平台返回实际的 HTTPS 网址，通常以 `.netlify.app` 结尾；项目名是否可用由平台决定，不预先编造网址。
5. 若新项目为私有，在项目可见性设置中改为公开，再用未登录窗口验证。
6. 按下一节验收，记录最终网址后再用于推广。

如果改用 CLI，使用官方浏览器登录授权；密码、验证码、令牌不发到聊天或源码中。`netlify.toml` 已指定构建命令和 dist 发布目录。匿名部署仅能保留一小时，必须及时认领，不将匿名临时网址作为正式迁移结果。依据：[CLI 官方说明](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/)。

## 发布验收与数据迁移

1. 在未登录窗口打开网址，确认无需 Netlify 账号即可使用。
2. 电脑和手机检查粘贴通知、生成草稿、保存待办、导出与导入 JSON。
3. 确认页尾显示离线缓存就绪，再测试断网刷新。HTTPS、manifest、sw.js 和图标需正常提供。
4. 旧网址打开“数据与帮助”，导出 JSON 备份；在新网址导入并核对条数和内容。新网址不能自动读取旧网址的浏览器数据。
5. 已安装的旧 PWA 仍指向旧网址。完成备份后，在新网址重新添加到主屏幕；确认新站数据后再自行处理旧图标。
6. 记录最终 URL、账号套餐、部署时间及实际网络验证结果，再更新 README 和 deployment.md。

## 后续更新

修改源码后重新执行 `npm run package`，进入已有项目的 Deploys 页面上传新的 dist 文件夹。不要每次创建新项目，以免网址变化。后台定期检查免费额度；达到上限时停止继续消耗并等待额度重置，维持免费套餐。

本说明不代表已完成部署，也不保证平台未来政策或各运营商网络始终不变。
