# Deskpet v1.0.1 跨设备迁移说明

> 适用：同一用户拥有的 Apple Silicon Mac  
> 架构：macOS `arm64`  
> 私有性质：迁移包包含官方角色模型、官方语音和日奈本地声线资产，不得公开分发。
> 版本说明：本指南描述的是 **v1.0.1 迁移包**。当前应用已是 v1.0.2（含 P1 改造），且 v1.0.1 迁移包已于 2026-11-04 删除；需要迁移时请执行 `npm run transfer:bundle` 重新生成当前版本的包。

## 1. 解压迁移包

双击：

```text
Deskpet-transfer-1.0.1-macos-arm64.zip
```

解压后应得到：

```text
Deskpet-transfer-1.0.1-macos-arm64/
```

不要直接在 ZIP 预览窗口里运行脚本。

## 2. 退出正在运行的桌宠

如果目标 Mac 已经运行日奈桌宠，先从托盘菜单选择“退出 Deskpet”。

安装脚本发现应用仍在运行时，会中止安装。

## 3. 执行安装

双击：

```text
install.command
```

如果 macOS 阻止运行：

1. 右键 `install.command`。
2. 选择“打开”。
3. 再次确认“打开”。

也可以打开“终端”运行：

```bash
cd ~/Downloads/Deskpet-transfer-1.0.1-macos-arm64
chmod +x install.command verify.command
./install.command
```

安装过程需要联网，用于恢复 Python 3.12 和本地 TTS 推理依赖。

## 4. 安装位置

安装完成后：

```text
应用：
~/Applications/日奈桌宠.app

本地 TTS：
~/.local/share/deskpet-tts/
```

安装脚本会备份已有的应用和 TTS 环境。

应用数据保存在：

```text
~/Library/Application Support/Deskpet/
```

## 5. 首次启动

打开：

```text
~/Applications/日奈桌宠.app
```

首次启动通常需要：

1. 在设置中重新填写 DeepSeek API Key。
2. 在“系统设置 → 隐私与安全性 → 辅助功能”中重新授权日奈桌宠。
3. 检查主动行为强度，默认是“平衡”。

迁移包不包含 DeepSeek API Key，也不会绕过 macOS 权限。

## 6. 验证安装

双击：

```text
verify.command
```

或在终端运行：

```bash
cd ~/Downloads/Deskpet-transfer-1.0.1-macos-arm64
./verify.command
```

完整检查本地语音服务：

```bash
./verify.command --start-tts
```

看到以下内容即成功：

```text
TTS health: OK
PASS: 迁移包与安装结果验证通过。
```

验收内容包括：

- 迁移包逐文件 SHA-256。
- 应用签名和 arm64 架构。
- 官方 GLB 与官方语音素材。
- TTS 基础模型、codec、speaker embedding 和 LoRA。
- Python 3.12 推理依赖。
- 可选的 Irodori `/health` 启动测试。

## 7. 存档迁移规则

迁移包内包含：

```text
optional-user-data/
├── pet-state.json
├── settings.json
├── presence-session.json
├── presence-emotion.json
└── presence-memory.json
```

对应内容：

- 好感、心情、精力、互动和冷却状态。
- 渲染、语音、情绪、记忆、主动行为和 AI 设置。
- 短期会话连续性。
- 情绪惯性。
- 结构化情节记忆。

安装规则：

- 目标 Mac 没有对应文件时，才会复制过去。
- 目标 Mac 已存在存档时，不会覆盖。
- 迁移包不包含 DeepSeek API Key、网页缓存、窗口位置或日志。

## 8. 主动行为与隐私

- Presence v1 默认强度为“平衡”。
- 可切换“克制 / 平衡 / 活泼”。
- 可关闭“允许日奈主动行动”，停止自主动作、场景对白和主动 AI。
- 点击、拖拽和用户主动 AI 不受总开关影响。
- 主动 AI 不发送窗口标题、前台应用名称、选中文字或正文。
- 设置页会显示决策、静默率、表现、语音、重复抑制和打断遥测。

## 9. 本地语音说明

没有恢复 TTS 运行时，以下功能仍可使用：

- 预生成互动语音。
- 场景主动对白。
- 官方日语片段。

恢复 TTS 后，DeepSeek 新生成的日文回复才能使用日奈本地声线。

如果目标机没有网络，可以先运行应用并使用固定语音，但动态 TTS 环境需要另行准备 Python wheel 缓存。

## 10. 源码快照

`source/Deskpet-source/` 只是源码备份，普通使用不需要处理。

需要重新开发或打包时：

```bash
cd source/Deskpet-source
npm install
npm run typecheck
npm test
npm run test:e2e
npm run package:app
```

源码需要 Node.js 24+ 与 npm。

源码已经包含应用运行所需的三类私有素材：

- `3d/official/`
- `audio/official-denoise45/`
- `audio/generated-dialogue/`

训练与评估素材不在迁移包中。

## 11. 安全边界

- 迁移包仅供同一用户自己的设备使用。
- 不要上传到公开网盘、代码仓库或聊天群。
- 官方模型、官方语音和训练声线只能在本机个人使用。
- 如迁移设备不再使用，应删除：

```text
~/Applications/日奈桌宠.app
~/.local/share/deskpet-tts
~/Library/Application Support/Deskpet
```
