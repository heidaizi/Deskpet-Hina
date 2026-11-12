# 系统架构

Deskpet 是一个 Electron 应用，三个进程/层：

```
主进程 (src/main)      窗口、状态、TTS、AI、感知、主动行为
预加载 (src/preload)   受限 IPC API（window.deskpet）
渲染进程 (src/renderer) 桌宠 3D/2D、聊天窗、设置页
```

## 主进程模块

### 窗口

- `window/pet-window.ts`：透明、置顶、可拖拽的桌宠窗口；
- `chat/bridge.ts`：聊天窗口与对话链路；
- `settings/bridge.ts`：设置窗口、应用状态初始化。

### 桌宠状态

- `domain/pet-controller.ts`：状态机（心情、体力、好感、互动冷却）；
- `domain/behavior-engine.ts`：按 `content/actions.json` 的规则匹配互动，
  结算效果与每日上限；
- `domain/dialogue-service.ts`：按对话池挑选台词与语音。

### 主动行为（Presence）

```
候选生成 → 仲裁（冷却/预算/效用/分寸） → 投递 → 渲染命令
```

- `presence/presence-controller.ts`：调度、场景、主动 AI 规划；
- `presence/presence-arbiter.ts`：过滤与打分；
- `presence/manners.ts`：社交分寸（刚互动、被忽略、专注、深夜、久别）；
- `presence/emotion-engine.ts`：心情随场景与互动演化；
- `presence/episodic-memory.ts`：记住一起经历过的事。

### AI

- `domain/deepseek-client.ts`：对话、解释、主动规划，JSON 输出；
- `domain/reply-quality.ts`：日文回复校验与一次重试；
- `domain/glossary.ts` / `translation-memory.ts`：术语与已确认译文；
- 提示词组成：基础规则 → 角色语气 → few-shot → 官方台词参考 →
  术语 → 关系 → 记忆/画像 → 感知数据。

### 记忆

| 模块                         | 内容               | 存储                    |
| ---------------------------- | ------------------ | ----------------------- |
| `memory/conversation-buffer` | 最近对话           | `conversation.json`     |
| `memory/long-term-memory`    | 摘要 + 向量        | `memory/long-term.json` |
| `memory/user-profile`        | 项目/偏好/作息     | `memory/profile.json`   |
| `domain/relationship-state`  | 关系阶段与认识天数 | `relationship.json`     |

向量使用本地 `multilingual-e5-small`（384 维），模型不可用时退回词面匹配。

### 语音

`domain/local-tts-service.ts` 统一调度：预生成音频 → AivisSpeech →
macOS `say`。服装相关的官方语音由 `shared/official-voices-outfit-data.ts`
按 `rendererId` 解析。详见 [VOICE.md](VOICE.md)。

### 服装

- `content/character.json` 定义三套 3D 模型；
- `domain/outfit-rotation.ts` 负责每 N 天自动轮换；
- `domain/outfit-voice.ts` 提供各服装的登录/返回固定台词。

### 感知

`perception/*` 读取浏览器页面、屏幕截图、音乐、日程，注入对话与主动规划。
详见 [PERCEPTION.md](PERCEPTION.md)。

## 数据与隐私

- 运行时数据：`~/Library/Application Support/Deskpet/`
- 日志：`~/Library/Logs/Deskpet/`
- API Key 使用 macOS `safeStorage` 加密保存；
- 无遥测、无云端存档；感知内容只在本地处理，发送给用户自己的 DeepSeek API。

## 设计原则

1. **本地优先**：能本地完成的绝不外发；
2. **失败降级**：素材/模型/权限缺失时退回可用状态，而不是崩溃；
3. **主动性可控**：候选、仲裁、分寸三层，避免打扰；
4. **显式授权**：屏幕录制、自动化、辅助功能都由用户手动授予。
