# 亮度下限

Brightness Floor — a Decky plugin for Steam Deck OLED that remembers a user-calibrated minimum brightness and clamps its own brightness controls.

为 Steam Deck OLED 保存最低可接受亮度，并在 Decky 面板内调光。当前版本 0.1.4 使用手动调节，自动读取系统自适应状态；系统自适应下限尚未开放。

[下载预发布安装包](https://github.com/wx40217/decky-brightness/releases) · [反馈问题](https://github.com/wx40217/decky-brightness/issues)

## 安装与使用

1. Steam Deck 已安装 Decky Loader。将 `decky-brightness-floor-0.1.4.zip` 复制到 Deck，无需解压。
2. 在游戏模式打开 Decky 设置，启用开发者模式，使用“从 ZIP 安装插件 / Install Plugin from ZIP”选择安装包。
3. 关闭 Steam 系统自适应亮度并打开“亮度下限”。插件直接读取系统开关，显示“系统自适应：关闭”后即可调光，无须额外勾选确认。
4. 没有自定义配置时，默认下限为 44%，来自作者在自己的 Steam Deck OLED 上的校准。滑块和 ±0.01、±0.1 个百分点微调按钮均在当前下限至 100% 范围内调节。“回到最低亮度”可回到该下限。
5. 可点击“将当前亮度设为下限”保存自定义值；需要重新校准到现有下限以下时，先用系统调节到你确认可接受的位置，再保存。若还未取得当前值，先在系统中略微调亮，再回到所需位置。

自定义下限以原始数值保存在 Decky 的插件设置目录中；关闭面板、重启和正常更新不会清除它，更新也不会将已有自定义值改成 44%。旧版未设置下限的配置自动使用默认 44%，无需重写文件。插件不会在启动时自动改变亮度；需要时点击“回到最低亮度”。

系统自适应状态通过 Steam 系统设置接口监听，并在每次调光前重新读取。开启自适应或读取失败时，插件暂停调光并取消待发送请求；关闭后自动恢复。卸载会清理亮度及系统设置监听，不会切换系统自适应开关。

系统滑块、亮度快捷键和系统自适应仍可能使亮度低于下限。插件不使用事后调回机制，不宣称全局保护。外接显示器连接、桌面模式、非 OLED 设备或无法确认内置屏幕时，插件暂停调光。卸载清除监听，保持卸载当时亮度。

滑块步长为 0.01 个百分点，微调按钮从当前值或尚在处理的目标值累加，不会按显示百分比取整。实际可区分的亮度级数取决于 SteamOS 和屏幕。

界面显示的是 Steam 亮度控制值，不是实测屏幕亮度或频闪检测。设置后必须收到符合目标值的系统回报才显示确认，保存下限后还要求回报不低于下限；没有回报、接口失败或回报无效时会提示错误。系统回报也不等于物理屏幕测量。

面板使用系统已有的简体中文 Noto 字体，统一中文与数字字形，并增大微调按钮和状态文字；日常界面只显示亮度、下限、自适应状态和操作。异常提示按当前状态显示，开发兼容性说明留在仓库文档中。

已在 Steam Deck OLED、SteamOS 3.8.28、Decky 3.2.9、Gamescope 3.16.23.6 上验证：《赛博朋克 2077》的 SDR 与 HDR10 PQ 动态 3D 基准场景，在实际 60、90 Hz 下，关闭插件面板后调亮、返回精确下限均成功。刷新率以合成器实际反馈为准；HDR 另核实了游戏 HDR 内容反馈与元数据。45 的目标帧率请求被映射成 90 Hz，实际 45 Hz 尚未验证。

同一个 44.08136% 控制值在 SDR、HDR 下对应的实际背光读数不同；上述验证只证明插件调光及下限有效，不证明物理频闪已消除。测试临时绕过了 MAKO 启动包装器（其配置隐藏 HDR），结束后恢复原启动参数和游戏 HDR 设置；开启 MAKO 时的 HDR 组合尚未验证。

## 开发

基于 [Decky 官方模板](https://github.com/SteamDeckHomebrew/decky-plugin-template)，使用 `@decky/api`、`@decky/ui`、TypeScript 和 Python 标准库。Python 后端仅读取设备状态和保存校准配置，不写入屏幕驱动，不需要 root 标记。

源码、测试和构建脚本在本仓库中；安装 ZIP 放在 Releases，依赖目录、缓存及本机配置不提交。GitHub Actions 在 Linux 上自动验证并生成安装包，使用 pnpm 9 和已提交的锁文件；电脑上仍可按下列 npm 命令开发。

```sh
npm ci
npm run typecheck
npm test
npm run test:python
npm run build
npm run verify:bundle
npm run package
```

ZIP 包含一个 `decky-brightness-floor/` 顶层目录及编译后的 `dist/index.js`。无须在 Deck 上安装 Node.js 或编译插件。

亮度接口参考 [Decky Display 类型定义](https://github.com/SteamDeckHomebrew/decky-frontend-lib/blob/main/src/globals/steam-client/system/Display.ts)。系统自适应状态读取 `CMsgSystemManagerSettings` 的 `display_adaptive_brightness_enabled` 字段（7）；未携带该字段的增量通知不会被误判为关闭。控制器随插件加载，独立于面板挂载，对快速连续请求合并待发送值，所有发送值均经过当前下限限制。没有对 Steam 全局接口做拦截。

后续验证重点：睡眠唤醒与重启、实际 45 Hz、开启 MAKO 时的 HDR 组合、外接屏幕暂停。系统自适应需额外证明在实际生效前受限且不会争抢，才能开放。

## 发布方式

本仓库公开源码并独立分发，使用 GitHub Releases 发布可直接安装的 ZIP，暂无提交 Decky 商店的计划。当前版本是开发预览，实际亮度效果仍需在自己的 Steam Deck 上验证。

本项目的主要代码使用生成式 AI 编写。后续修改通过本仓库的测试与构建流程验证，再安装到真实设备上验收。

本项目代码使用 BSD-3-Clause 许可证，第三方库和图标保留各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
