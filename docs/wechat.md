# 微信小程序开发版

日期：2026-10-12。小程序版本 0.1.0；网页版仍为 0.2.1。用户已同意小额认证费用，尚未取得本项目 AppID。当前为本地开发成果，未上传、提审或发布。

## 产品与费用约定

面向国内大学生，手机以微信小程序为主要入口，保留网页版用于浏览器和电脑场景。基础通知整理、待办与数据迁移免费。当前没有广告、会员、付费 API、云数据库或流量统计，不会自动产生云服务账单。

后续先验证真实使用和回访，再评估不打断操作的少量广告。广告收入取决于资格、有效展示和实际结算，不承诺收益。平台成长计划提供的资源和代金券仅作为降低成本的可选项，不作为稳定现金收入，更不据此提前开通收费资源。

## 工程结构

| 路径 | 职责 |
| --- | --- |
| project.config.json | 微信开发者工具入口，当前 appid 为 touristappid |
| miniprogram/app.* | 小程序应用配置和公共样式 |
| miniprogram/pages/index/ | 收通知、待办、数据与帮助；标签切换保留草稿 |
| miniprogram/utils/core.js | 从 src/core.js 自动复制的识别与日历逻辑，不手改 |
| miniprogram/utils/tasks.js | 数据校验、存储、备份、合并与容量控制 |
| scripts/build-miniprogram.cjs | 同步经过测试的共享逻辑 |
| scripts/check-miniprogram.cjs | JS/JSON 校验、调用本机微信 WXML/WXSS 编译器 |
| tests/miniprogram.test.cjs | 通知流程与微信接口桩测试，不等于真机测试 |
| tests/miniprogram-transfer.cjs | 真浏览器验证小程序备份格式与网页版双向迁移 |
| release/wechat/v0.1.0/ | 微信开发包，单独于网页发布产物管理 |

```text
pnpm run build:wechat    同步识别逻辑
pnpm run check:wechat    编译检查（需要已安装微信开发者工具）
pnpm run test:wechat     小程序逻辑与接口桩测试
pnpm run test:transfer   与网页版双向迁移（需要 Playwright）
pnpm test               网页与小程序逻辑回归
pnpm run package        网页发布包和微信开发包
```

编译器安装目录可用环境变量 `KEJIAN_WECHAT_TOOLS` 指定。Playwright 环境配置延续 development.md。产品代码和构建无需新增 npm 依赖。

## 开发者工具导入

导入 `E:\Project\kejian` 根目录；miniprogramRoot 已指向 miniprogram。当前测试 AppID 不能用于正式上传。工具要求登录时由用户本人扫码；没有可用测试权限时，需先注册具体小程序再填写 AppID。

不要启用云开发，不需要配置 request 合法域名。仅打开本地项目不会将通知发到服务器。CLI 自动化需要开启工具的本地服务端口，模拟器运行仍以实际工具返回为准。

本机补充：用户已扫码登录。模拟器白屏已修复：调试基础库固定为 3.12.1，实际输入、识别、保存、重开、完成、编辑及小屏布局验证通过。微信工具用户数据已迁到 `E:\Project\_tooling\wechat-devtools\User Data`，C 盘原路径为目录链接，原登录与其他项目保留。用 `pnpm run wechat:open` 启动；自动化用 `pnpm run wechat:auto` 后执行 `pnpm run test:wechat:runtime`。完整结果见 [小程序 QA](qa/wechat-v0.1.0.md)。

## AppID、认证、备案与发布

1. 在 [微信公众平台](https://mp.weixin.qq.com) 注册具体小程序，主体选个人。微信开发者账号不等于已经注册了小程序。
2. 在小程序后台“开发管理 / 开发设置”等对应入口取得 AppID，填入 project.config.json。仅 AppID 可写入客户端；AppSecret、登录凭据不写入源码。
3. 名称“课间”能否注册以后台审核结果为准。按实际功能寻找个人主体可用的工具类目，不为补贴选择不匹配类目。
4. 按后台要求完成认证和备案，准备真实的主体信息及联系信息；用户在官方页面自行提交。小额认证费已获用户接受，其他收费服务未授权开通。
5. 在后台如实填写用户隐私保护指引。当前没有服务器收集通知；用户主动导入聊天文件、复制备份、分享备份会调用对应微信能力。需结合后台最新接口检测补全实际用途，不承诺“无需隐私声明”。
6. 填入实际 AppID 后完成模拟器与手机真机验证，再上传体验版。代码审核及发布尚未执行。开发包不是可公开使用的小程序。

备案依据：[工信部备案通知](https://www.miit.gov.cn/jgsj/xgj/wjfb/art/2023/art_dd783a581c9644a4aee10afa582811db.html)。认证金额以官方后台订单为准，既有个人约 30 元/年的外部指引不能替代订单。

## 数据与能力边界

识别逻辑、备份 JSON version:1 与网页版兼容。保留通知原文和人工核对；多个日期/时刻不猜结果。日历 UTF-8 折行已移除 TextEncoder 依赖，适用于小程序 JS 环境。

记录使用微信本地存储，按序列化后的 UTF-8 字节数限制为 950 KiB，并保留最多 5000 条的格式限制。长通知会先达到字节上限。每页展示 30 条，避免将大量记录通过 setData 发送给界面。写入成功后才更新内存；写入失败保留现有记录和草稿。读取异常时暂停保存，只有确认替换的有效备份可以恢复。

文件导出由用户点击发起，使用固定的本地备份/日历文件名，避免无限生成缓存。分享目标由用户在微信界面选择。微信版本不支持转发文件时提供复制内容方式。JSON 导入默认合并，同 ID 采用导入记录；替换全部需再次确认。

网页版、小程序、不同设备和不同 AppID 的本地存储各自独立。更换测试 AppID 或正式 AppID 前先备份。没有自动聊天读取、截图识别、云同步、后台消息提醒、广告或支付功能。

官方接口依据：[本地缓存](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html)、[选择聊天文件](https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.chooseMessageFile.html)、[转发文件](https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html)。个人主体不能直接以 web-view 嵌入现有网站，因此已制作原生页面：[web-view 限制](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)。

## 发布前真实验证

- 填写实际 AppID 后：编译、进入页面、粘贴中文通知、核对日期、保存并重新打开。
- Android / iOS：日期与时间选择器、中文输入法、长通知、草稿切换、文件选择与分享、拒绝授权/取消操作。
- 数据：从网页版导入、合并去重、取消替换、确认替换、小程序导出再导回网页；换 AppID 前先导出。
- 电脑微信：布局、输入和文件能力分别确认；不能用手机视口或接口桩结果冒充真机结果。
- 日历：用实际系统日历导入 ICS，核对时间、时区和提醒设置。
- 平台：检查所选类目、后台隐私指引、认证、备案与审核结果；正式发布后才分享公开入口。
