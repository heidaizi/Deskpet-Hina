# Deskpet — Hina Desktop Companion

An Electron desktop pet of **Hina (空崎ヒナ)** from _Blue Archive_: 3D/2D
renderer, streaming dialogue, local voice synthesis, long-term memory and
opt-in screen awareness.

> **Unofficial fan project.** Not affiliated with NEXON Games / Yostar.
> This repository contains **source code only** — no character models, voice
> clips or trained voice models. See [NOTICE.md](NOTICE.md).

[中文说明](#中文说明)

## Features

- Electron + Three.js / VRM + PixiJS, transparent always-on-top pet window.
- Chat with DeepSeek (JSON replies, glossary, translation quality checks).
- Local voice: AivisSpeech + your own Style-Bert-VITS2 voice model, with
  macOS `say` fallback.
- Long-term memory: semantic recall, user profile, relationship stages.
- Optional perception: browser page context, screenshots analysed by
  `deepseek-flash`, now-playing music, calendar and reminders.
- Proactive behaviour with "manners": quiet hours, focus detection,
  ignored-streak backoff, hourly greeting.

## Requirements

| Item    | Requirement                                                 |
| ------- | ----------------------------------------------------------- |
| macOS   | 13+ (Apple Silicon recommended)                             |
| Node.js | 22+ (developed on 24)                                       |
| Disk    | ~2 GB for dependencies and caches                           |
| API key | DeepSeek API key (entered in Settings)                      |
| Assets  | 3D model / voice clips / voice model — **you supply these** |

## Quick start

```bash
git clone https://github.com/heidaizi/Deskpet-Hina.git deskpet
cd deskpet
npm install
npm run dev
```

Then follow **[docs/SETUP.md](docs/SETUP.md)** — it covers assets, the
AivisSpeech engine, voice models, permissions, packaging and autostart.

### What you need to prepare

1. **3D model** — `assets/characters/hina-swimsuit/private/3d/official/hina-swimsuit-official.glb`
2. **Voice model** — a `.aivmx` file placed in
   `~/Library/Application Support/AivisSpeech-Engine/Models/`
3. **AivisSpeech Engine** — extracted to `~/Library/Deskpet/engine/` (so that
   `~/Library/Deskpet/engine/run` exists)
4. **DeepSeek API key** — Settings → AI

Without assets the app still starts: the renderer falls back to a 2D
placeholder and voice falls back to macOS `say`.

## Build & package

```bash
npm run verify       # typecheck + format + unit tests + build
npm run test:e2e     # optional, requires private assets
npm run package:app  # build and install to ~/Applications
```

`package:app` signs with a local self-signed identity when available,
otherwise ad-hoc. Re-signing resets macOS Screen Recording / Automation
permissions — re-grant them after each package.

## Project layout

```
src/main        Electron main process (windows, TTS, presence, AI, memory)
src/preload     IPC bridge
src/renderer    Pet window / chat / settings UI
src/shared      Types shared by main and renderer
content         Dialogue, affection, glossary, prebuilt TTS manifests
scripts         Build, packaging and voice-training helpers
docs            Setup, architecture, perception, voice and dev guides
```

## Testing

- Unit tests run without private assets: `npm test`.
- E2E tests need the 3D model and voice clips; they are skipped locally if
  the assets are missing.
- `npm run test:e2e` uses Playwright and launches a separate app instance.

## Icon

The app icon source lives at `docs/acceptance/hina-app-icon-source.png`
(artwork by **Gz**, PID **91677457**). `npm run package:app` regenerates the
`.icns` from it. See [NOTICE.md](NOTICE.md) for attribution.

## License

Source code: [MIT](LICENSE). Character IP, icon artwork and third-party
components: see [NOTICE.md](NOTICE.md). Assets and voice models are **not**
included and must not be redistributed with this repository.

---

# 中文说明

一个 _蔚蓝档案_ **空崎日奈** 的 Electron 桌面宠物：3D/2D 渲染、流式对话、
本地语音合成、长期记忆，以及可选的屏幕感知。

> **非官方同人项目**，与 NEXON Games / Yostar 无关。本仓库**只包含源代码**，
> 不含角色模型、官方语音或训练好的语音模型，详见 [NOTICE.md](NOTICE.md)。

## 功能

- Electron + Three.js / VRM + PixiJS，透明置顶的桌宠窗口；
- DeepSeek 对话：JSON 回复、术语表、翻译质量校验；
- 本地语音：AivisSpeech + 自己训练的 Style-Bert-VITS2 模型，
  没有模型时退回 macOS `say`；
- 长期记忆：语义召回、用户画像、关系阶段；
- 可选感知：浏览器页面、屏幕截图（`deepseek-flash` 视觉）、
  正在播放的音乐、日历与提醒；
- 有分寸的主动性：深夜静默、专注检测、连续被忽略后退让、每小时问候。

## 环境要求

| 项目    | 要求                                      |
| ------- | ----------------------------------------- |
| macOS   | 13 及以上（推荐 Apple Silicon）           |
| Node.js | 22 及以上（开发环境为 24）                |
| 磁盘    | 依赖与缓存约 2GB                          |
| API Key | DeepSeek API Key（在设置里填写）          |
| 素材    | 3D 模型 / 语音片段 / 语音模型，**需自备** |

## 快速开始

```bash
git clone <你的仓库地址> deskpet
cd deskpet
npm install
npm run dev
```

然后按 **[docs/SETUP.md](docs/SETUP.md)** 操作：素材、AivisSpeech 引擎、
语音模型、系统权限、打包与开机自启都写在里面。

### 需要你自备的东西

1. **3D 模型** — `assets/characters/hina-swimsuit/private/3d/official/hina-swimsuit-official.glb`
2. **语音模型** — 放到 `~/Library/Application Support/AivisSpeech-Engine/Models/` 的 `.aivmx`
3. **AivisSpeech 引擎** — 解压到 `~/Library/Deskpet/engine/`，确保存在 `run`
4. **DeepSeek API Key** — 设置 → AI

没有素材也能启动：渲染会退回 2D 占位图，语音退回 macOS `say`。

## 构建与打包

```bash
npm run verify       # 类型检查 + 格式 + 单测 + 构建
npm run test:e2e     # 可选，需要私有素材
npm run package:app  # 构建并安装到 ~/Applications
```

注意：重新签名会重置 macOS 的「屏幕录制 / 自动化」授权，每次打包后需要重新授权。

## 目录结构

```
src/main        主进程（窗口、TTS、主动行为、AI、记忆）
src/preload     IPC 桥接
src/renderer    桌宠 / 聊天 / 设置界面
src/shared      主进程与渲染进程共享类型
content         对话、好感度、术语表、预生成语音清单
scripts         构建、打包、语音训练脚本
docs            部署、架构、感知、语音与开发文档
```

## 测试

- 单测不依赖私有素材：`npm test`
- E2E 需要 3D 模型与语音片段，缺素材时会跳过
- `npm run test:e2e` 使用 Playwright，会启动独立的测试实例

## 图标

应用图标源文件位于 `docs/acceptance/hina-app-icon-source.png`
（作者 **Gz**，PID **91677457**），`npm run package:app` 会由它生成 `.icns`。
署名信息见 [NOTICE.md](NOTICE.md)。

## 许可证

代码采用 [MIT](LICENSE)。角色 IP、图标与第三方组件见 [NOTICE.md](NOTICE.md)。
素材与语音模型不随仓库分发，请勿一并转载。
