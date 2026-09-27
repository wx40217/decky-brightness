# 亮度下限

Brightness Floor — a Decky plugin for Steam Deck OLED that remembers a user-calibrated minimum brightness and clamps its own brightness controls.

为 Steam Deck OLED 保存最低可接受亮度，并在 Decky 面板内调光。首版 0.1.1 使用手动调节；系统自适应下限尚未开放。真机 SDR、HDR 和刷新率兼容性待验证。

[下载预发布安装包](https://github.com/wx40217/decky-brightness/releases) · [反馈问题](https://github.com/wx40217/decky-brightness/issues)

## 安装与使用

1. Steam Deck 已安装 Decky Loader。将 `decky-brightness-floor-0.1.1.zip` 复制到 Deck，无需解压。
2. 在游戏模式打开 Decky 设置，启用开发者模式，使用“从 ZIP 安装插件 / Install Plugin from ZIP”选择安装包。
3. 关闭 Steam 系统自适应亮度，用系统滑块找到你确认可接受的最低亮度。
4. 打开“亮度下限”，点击“将当前亮度保存为下限”。若还未取得当前值，先在系统中略微调亮，再回到所需位置。
5. 确认“我已关闭系统自适应”，之后通过插件滑块调光。“回到最低亮度”可直接回到保存的位置。

下限以原始数值保存在 Decky 的插件设置目录中；关闭面板、重启和正常更新不会清除它。每次插件重新加载后需重新确认系统自适应已关闭。插件不会在启动时自动改变亮度；需要时点击“回到最低亮度”。

系统滑块、亮度快捷键和系统自适应仍可能使亮度低于下限。插件不使用事后调回机制，不宣称全局保护。外接显示器连接、桌面模式、非 OLED 设备或无法确认内置屏幕时，插件暂停调光。卸载清除监听，保持卸载当时亮度。

界面显示的是 Steam 亮度控制值，不是实测屏幕亮度或频闪检测。设置后必须收到符合目标值且不低于下限的系统回报才显示确认；没有回报、接口失败或回报无效时会提示错误。系统回报也不等于物理屏幕测量。

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

亮度接口参考 [Decky Display 类型定义](https://github.com/SteamDeckHomebrew/decky-frontend-lib/blob/main/src/globals/steam-client/system/Display.ts)。控制器随插件加载，独立于面板挂载；对快速连续请求合并待发送值，所有发送值均经过下限限制。没有对 Steam 全局接口做拦截。

后续验证重点：系统版本与接口回报、调亮后返回精确下限、关闭面板与重新打开、睡眠唤醒与重启、进出 SDR/HDR 游戏及 45/60/90 Hz、外接屏幕暂停。系统自适应需额外证明在实际生效前受限且不会争抢，才能开放。

## 发布方式

本仓库公开源码并独立分发，使用 GitHub Releases 发布可直接安装的 ZIP，暂无提交 Decky 商店的计划。当前版本是开发预览，实际亮度效果仍需在自己的 Steam Deck 上验证。

本项目的主要代码使用生成式 AI 编写。后续修改通过本仓库的测试与构建流程验证，再安装到真实设备上验收。

本项目代码使用 BSD-3-Clause 许可证，第三方库和图标保留各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
