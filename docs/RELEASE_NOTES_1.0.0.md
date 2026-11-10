# Deskpet v1.0.0 发布说明

> 发布日期：2026-10-25  
> 角色：空崎日奈（泳装）macOS 桌宠  
> 里程碑：M0～M5.7 全部完成

## 主要能力

- 2D/3D 渲染、官方 GLB、23 段动作、点击/长按/拖拽。
- 官方语音、本地 Irodori 日奈声线、11 种情绪风格。
- DeepSeek 用户主动对话与受约束主动规划。
- Presence 会话连续性、情绪惯性、结构化情节记忆。
- 动作预备/恢复、语音与微动作协调、点击打断。
- 时间/场景感知、低功耗渲染和 TTS 生命周期治理。

## 最终 Presence 策略

- 默认强度：平衡。
- 可选：克制、平衡、活泼。
- 可一键关闭全部主动行动。
- 详细预算和边界见 `PRESENCE_RELEASE_POLICY.md`。

## 验收

- 单元测试：29 个文件、155 项通过。
- Electron E2E：19/19 通过。
- 8/24 小时虚拟回放：全部预算通过。
- 状态机回放报告：`dist/presence-soak-report.json`。
- 安装版签名、arm64、版本和 TTS 健康检查通过。

## 安装与迁移

- 安装版：`~//Applications/日奈桌宠.app`
- 迁移包：`dist/Deskpet-transfer-1.0.0-macos-arm64.zip`
- SHA-256：以同级 `Deskpet-transfer-1.0.0-macos-arm64.zip.sha256` 文件为准

## 已知边界

- 8/24 小时验收为虚拟时钟加速回放，不是真实墙钟驻留。
- 真实 CPU/内存已做 25 秒安装版采样，长期曲线仍应在日常使用中继续观察。
- `.app` 为本地 ad-hoc 签名，不是 Apple Developer ID 公证发行版。
