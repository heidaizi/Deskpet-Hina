# 部署指南（macOS）

本文从零开始，把 Deskpet 跑在自己的 Mac 上。全程不需要 Docker。

> English summary: install Node 22+, `npm install`, supply a GLB model,
> install AivisSpeech Engine to `~/Library/Deskpet/engine`, place your
> `.aivmx` voice model in the engine's Models folder, then `npm run dev`
> or `npm run package:app`, enter your DeepSeek key and grant macOS
> permissions.

## 0. 环境检查

```bash
sw_vers            # 建议 macOS 13+
uname -m           # 推荐 arm64（Apple Silicon）
node -v            # 需要 22+
npm -v
git --version
```

如果 Node 版本过低：

```bash
brew install node@22
```

## 1. 获取代码并安装依赖

```bash
git clone <仓库地址> deskpet
cd deskpet
npm install
```

依赖里包含 `onnxruntime-node`（约 200MB+ 原生库）和 `sharp`，首次安装会比较慢。
如果安装中断，重试一次即可。

## 2. 准备角色素材

所有私有素材都放在：

```
assets/characters/hina-swimsuit/private/
```

### 2.1 3D 模型（已包含）

```
assets/characters/hina-swimsuit/private/3d/official/hina-swimsuit-official.glb
```

- 仓库已包含该文件（约 5.5MB），无需额外下载
- 格式：`.glb`（glTF Binary），文件名需保持一致
- 仅允许个人、非商业使用，见 `LICENSE-ASSETS.md`
- 没有模型时应用会退回 2D 占位模式

### 2.2 官方语音（可选）

```
assets/characters/hina-swimsuit/private/audio/official-denoise45/*.wav
```

这些是固定台词的原始语音。**没有也能用**：找不到音频时会实时合成。

### 2.3 预生成语音（可选）

```
assets/characters/hina-swimsuit/private/audio/generated-dialogue/*.wav
```

清单在 `content/prebuilt-tts-ja.json` 与 `content/prebuilt-tts-supplemental.json`，
按文本索引。缺少对应音频时会自动回退到实时合成。

> 不要把这些音频提交到公开仓库。仓库的 `.gitignore` 已经忽略了 `private/`。

## 3. 安装 AivisSpeech 引擎

语音合成依赖独立的 AivisSpeech Engine（VOICEVOX 兼容 API，端口 10101）。

1. 从 [AivisSpeech Engine Releases](https://github.com/AivisSpeech/AivisSpeech-Engine/releases)
   下载 macOS（arm64）版本。
2. 解压到：

```bash
mkdir -p ~/Library/Deskpet/engine
# 解压后确认二进制位于：
ls ~/Library/Deskpet/engine/run
chmod +x ~/Library/Deskpet/engine/run
```

3. 应用会在启动时自动拉起引擎（约 10 秒），日志在：

```
~/Library/Logs/Deskpet/aivis-engine.log
```

自定义位置可用环境变量：

```bash
export DESKPET_AIVIS_ENGINE="$HOME/path/to/engine"
export DESKPET_AIVIS_URL="http://127.0.0.1:10101"
```

## 4. 安装语音模型

从 [GitHub Releases](https://github.com/heidaizi/Deskpet-Hina/releases)
下载 `hina.aivmx`（约 238MB），放到：

```
~/Library/Application Support/AivisSpeech-Engine/Models/
```

例如：

```
~/Library/Application Support/AivisSpeech-Engine/Models/hina.aivmx
```

模型仅允许个人、非商业使用（见 `LICENSE-ASSETS.md`）。
如果想训练自己的模型，见 [VOICE_TRAINING.md](VOICE_TRAINING.md)。

要求与约定：

| 项         | 约定                                                        |
| ---------- | ----------------------------------------------------------- |
| speaker 名 | 优先 `hina`；找不到时使用第一个说话人                       |
| 样式名     | 建议包含 `neutral`、`soft`、`annoyed`（缺失时用第一个样式） |
| 重启       | 放置模型后需要重启应用/引擎                                 |

验证引擎是否加载：

```bash
curl -s http://127.0.0.1:10101/speakers | head -c 400
```

## 5. 配置应用

### 5.1 开发模式

```bash
npm run dev
```

### 5.2 打包安装

```bash
npm run package:app
```

- 有本地签名证书时使用它；没有则退化为 ad-hoc 签名
- 安装到 `~/Applications/空崎日奈.app`
- 打包脚本会带上 AppleEvents entitlement（用于浏览器/音乐/日历感知）

打包后启动：

```bash
open ~/Applications/空崎日奈.app
# 如果系统拦截未公证应用：
xattr -dr com.apple.quarantine ~/Applications/空崎日奈.app
```

### 5.3 填写 API Key

打开设置（菜单栏图标 → 设置），在 AI 页填入 DeepSeek API Key。
Key 使用 macOS `safeStorage` 加密保存在本地。

### 5.4 语音开关

- 设置 → 语音：引擎选择 **AivisSpeech**
- 质量选择 `quality`（更自然，稍慢）或默认
- 如果没有模型，会退回 macOS `say`

## 6. 系统权限

| 权限     | 用途                             | 位置                    |
| -------- | -------------------------------- | ----------------------- |
| 辅助功能 | 点击穿透恢复、全局快捷键         | 隐私与安全性 → 辅助功能 |
| 屏幕录制 | 屏幕理解（截图 + 视觉）          | 隐私与安全性 → 屏幕录制 |
| 自动化   | 读取浏览器页面、音乐、日历、提醒 | 隐私与安全性 → 自动化   |
| 通知     | 主动提醒                         | 系统设置 → 通知         |

注意事项：

- **每次重新打包/重新签名，屏幕录制与自动化授权会被重置**，需要重新勾选；
- 授权后必须**完全退出并重新启动**应用才生效；
- 屏幕录制权限缺失时，屏幕理解会自动跳过，其他功能不受影响。

## 7. 可选：开机自启（LaunchAgent）

创建 `~/Library/LaunchAgents/local.deskpet.launcher.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>local.deskpet.launcher</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/YOUR_NAME/Applications/空崎日奈.app/Contents/MacOS/Electron</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>ProcessType</key><string>Interactive</string>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>StandardOutPath</key><string>/Users/YOUR_NAME/Library/Logs/Deskpet/launcher.out.log</string>
  <key>StandardErrorPath</key><string>/Users/YOUR_NAME/Library/Logs/Deskpet/launcher.err.log</string>
</dict>
</plist>
```

把 `YOUR_NAME` 替换成你的用户名，然后：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.deskpet.launcher.plist
launchctl kickstart -k gui/$(id -u)/local.deskpet.launcher
```

卸载自启：

```bash
launchctl bootout gui/$(id -u)/local.deskpet.launcher
```

## 8. 启动后自检

按顺序确认：

1. **桌宠出现**：透明窗口、可拖动；缺模型时应显示 2D 占位
2. **对话可用**：打开聊天窗，发一句，能收到中文 + 日文回复
3. **语音可用**：回复会播放；日志中应有 `aivis-tts`
4. **记忆可用**：聊两句后重新打开设置，好感经验应增加
5. **感知可用**（可选）：问「你知道我现在在做什么吗」，应能说出页面/屏幕内容

查看日志：

```bash
tail -f ~/Library/Logs/Deskpet/launcher.err.log
tail -f ~/Library/Logs/Deskpet/aivis-engine.log
```

## 9. 常见问题

### 没有声音

```bash
curl -s http://127.0.0.1:10101/speakers | head -c 200
```

- 无响应：引擎未启动，检查 `~/Library/Deskpet/engine/run` 是否存在且可执行
- 有响应但没有模型：检查 Models 目录与 `.aivmx` 文件
- 有模型仍无声：设置里的语音引擎是否选了 AivisSpeech

### 引擎启动超时

首次启动要加载 BERT 与模型，约 10～20 秒；超时日志为
`AivisSpeech 引擎启动超时`。可直接手动运行排查：

```bash
cd ~/Library/Deskpet/engine && ./run --host 127.0.0.1 --port 10101
```

### 屏幕理解一直「看不到」

- 检查「屏幕录制」权限；
- 重新签名后权限会失效，需要重新勾选并重启；
- 对话窗与设置窗默认对截图透明，属于正常设计。

### 浏览器/音乐/日历读不到

- 检查「自动化」里是否允许了对应应用；
- 首次触发会弹窗，需要点允许；
- 应用必须自带 AppleEvents entitlement（打包脚本已包含）。

### 代理环境

应用启动时会读取 macOS 系统代理（`scutil --proxy`）并注入给网络请求；
无需手动配置。若代理未开启，会直接连接。

### 安装依赖失败

```bash
rm -rf node_modules package-lock.json
npm install
```

原生模块（onnxruntime / sharp）需要与 Node 版本匹配；升级 Node 后需重装。

### E2E 测试报错

E2E 需要私有素材（GLB、语音）。没有素材时只跑单测：

```bash
npm test
```
