# 日奈桌宠“活人感”工程实施方案

> 文档版本：1.4  
> 基线版本：Deskpet v1.0.0  
> 编制日期：2026-10-25  
> 状态：M5.1～M5.7 全部完成，活人感 v1 已发布  
> 适用范围：用户本机的 macOS Apple Silicon 版本  
> 关联文档：`IMPLEMENTATION_PLAN.md`、`DEV_LOG.md`、`docs/DESKTOP_CONTEXT_AI.md`

---

## 0. 结论

“活人感”不以台词数量、动作数量或 AI 调用频率衡量，而由以下能力共同决定：

1. 日奈能注意到刚刚发生了什么。
2. 她的反应有原因、有前后连续性。
3. 她可以主动说，也可以选择沉默。
4. 情绪和关系不会因一次点击瞬间翻转。
5. 动作、视线、文字和语音在时间上协调。
6. 她知道什么该记住、什么不该记录。

因此，下一阶段不再继续堆叠独立随机系统，而是建立一个统一的
`Presence Core`：

```text
桌面场景 / 用户互动 / 语音生命周期 / 对话结果
                         ↓
                   Presence Events
                         ↓
           上下文归一化与派生状态
                         ↓
       本地规则候选 → 过滤 → 优先级仲裁
                         ↓
      沉默 / 视线 / 动作 / 对白 / 语音
                         ↓
             渲染器、窗口与持久化记录
```

首个可交付目标是 M5.1：只负责主动行为的事件驱动仲裁器，以及当前进程内的
基础返回上下文。它不接管用户直接互动，不做跨重启持久化，不接长期记忆和主动 AI。

---

## 1. 当前基线

### 1.1 已具备能力

- Electron 透明桌宠窗口、托盘、多显示器和鼠标穿透。
- Three.js GLB 渲染、23 个官方动作、表情、视线、呼吸和头发摆动。
- 点击、双击、长按、拖拽、行为规则、冷却和好感/心情/精力存档。
- 本地 TTS、官方语音、预生成 WAV、中文气泡和日文语音。
- 场景分类、时段分类、系统空闲和锁屏/睡眠感知。
- 用户主动触发的 DeepSeek 上下文分析与选中文字解释。
- 自动动作和场景对白的相对独立调度。
- 完整 Electron E2E、单元测试、签名应用和迁移包。

### 1.2 当前主要限制

| 限制                      | 当前表现                               | 后果                                |
| ------------------------- | -------------------------------------- | ----------------------------------- |
| 两套独立调度器            | 自动动作与场景台词分别计时             | 可能同时抢表现，缺少统一优先级      |
| 台词以加权抽选为主        | 主要按场景、时段、数值过滤             | 同一类提醒容易显得机械              |
| 记忆范围很短              | 行为池只保留最近若干表演 ID            | 重启后失去连续性，无法自然 callback |
| 情绪近似单值状态          | 心情是 0～100 的数值                   | 缺少惯性、原因和持续时间            |
| 好感主要是等级门槛        | 高等级解锁更多台词                     | 关系变化较少体现在距离感和动作边界  |
| DeepSeek 是无历史单轮调用 | 只接收本次批准的上下文                 | 无法引用真正发生过的共同经历        |
| 表现通道未统一            | 语音、动作、视线主要由各调用点自行协调 | 缺少统一的打断、等待和恢复规则      |

---

## 2. 范围与边界

### 2.1 本方案范围

- 统一事件模型与行为仲裁。
- 会话记忆、防重复和返回识别。
- 情绪惯性、社交电量和关系修饰。
- 本地、可审计的情节记忆。
- 受约束的主动 AI 表演计划。
- 动作、视线、语音的生命周期协调。
- 场景回放测试、长时运行和可观察性。

### 2.2 明确不做

- 不持续截屏、OCR、录屏或读取屏幕像素。
- 不记录键盘输入、剪贴板内容或聊天正文。
- 不默认保存窗口标题、选中文字或代码内容。
- 不引入常驻麦克风、环境声音监听或说话人识别。
- 不允许 AI 执行终端命令、修改文件或控制其他应用。
- 不把日奈变成每隔十几秒说一句的高频聊天机器人。
- 不要求先完成 Live2D/Spine 才能实施本方案。
- 不因“活人感”升级破坏现有固定对白、语音、存档和渲染回退。

---

## 3. 设计原则

### 3.1 本地优先

绝大多数行为由本地事件和规则决定。AI 只处理开放问题、少量高价值主动发言和
语义总结；无网络时仍保持完整基础体验。

### 3.2 因果优先

每个主动表现必须能追溯到一个或多个事件。例如：

```text
连续开发 40 分钟 → 产生专注里程碑 → 允许一次轻提醒
离开 2 小时后返回 → 产生返回事件 → 允许一次返回问候
```

不允许只有“冷却到了，所以抽一句”的孤立行为。

### 3.3 沉默是一等结果

仲裁器没有合适候选时应明确返回 `silent`。沉默不是失败，也不会触发补偿性连续发言。

### 3.4 单次只做适量的事

一次决策最多输出：

- 一个动作或一个微动作序列。
- 一个表情。
- 一个可选视线目标。
- 一段可选对白和语音。

动作可以在不抢语音的情况下独立播放，但对白必须经过语音通道仲裁。

### 3.5 用户可查看、可关闭、可删除

任何跨会话记忆都必须在设置页可关闭；长期情节记忆必须可逐条查看和删除。

### 3.6 可回放、可回滚

仲裁逻辑使用注入时钟和随机源。所有规则可用固定事件序列回放测试，并保留环境变量开关切回旧调度器。

---

## 4. 目标架构

### 4.1 数据流

```text
TimeSceneMonitor ─┐
Interaction IPC ──┤
Voice Lifecycle ──┼→ PresenceEventNormalizer
AI Reply ─────────┤          ↓
System Power ─────┘    PresenceContext
                              ↓
                    PresenceRuleRegistry
                              ↓
                    Candidate[] + Silence
                              ↓
          隐私 / 可见性 / 冷却 / 预算 / 打断过滤
                              ↓
                      PresenceArbiter
                              ↓
                    PresenceDecision
                              ↓
              RendererCommand + Memory/State Update
```

### 4.2 主进程中的职责

1. **PresenceController**
   - 接收现有模块产生的事件。
   - 维护当前场景、交互、语音和可见性状态。
   - 调用纯函数式规则和仲裁器。
   - 将最终决定转换为现有 `RendererCommand`。

2. **PresenceEventNormalizer**
   - 将 15 秒场景轮询转换为边沿事件，例如 `scene_changed`。
   - 把持续时长转换为 `focus_milestone`、`return_episode`。
   - 去重和拒绝过期事件。

3. **PresenceRuleRegistry**
   - 本地方规则列表。
   - 每条规则只返回候选，不直接发送命令或修改状态。

4. **PresenceArbiter**
   - 使用固定优先级、冷却、预算和上下文进行选择。
   - 只输出一个 `PresenceDecision`。

5. **MemoryStore / EmotionEngine**
   - 在决策后记录必要历史。
   - 不参与窗口、渲染或 IPC 权限判断。

6. **PresenceExecutor**
   - 发送现有 `RendererCommand`。
   - 更新最后主动发言时间、已使用规则和诊断数据。

### 4.3 渲染进程职责

渲染进程继续负责：

- 执行动作与表情。
- 显示气泡。
- 播放和分段管理语音。
- 汇报语音生命周期，不自行决定何时主动说话。

新增一个最小反向事件通道：

```text
renderer → main
speech_started
speech_completed
speech_interrupted
```

每条语音事件必须携带当前命令的 `deliveryId`。主进程只接受来自桌宠窗口、
类型和字段均在白名单内、且 `deliveryId` 与当前表演一致的晚到事件。

`action_completed` 暂不纳入 M5.1，因为现有 Renderer 没有统一的完成和取消回调；
它属于 M5.6 的渲染器改造范围。

---

## 5. 建议模块与文件

### 5.1 M5.1 新增

```text
src/shared/presence.ts
src/main/presence/presence-context.ts
src/main/presence/presence-events.ts
src/main/presence/presence-rules.ts
src/main/presence/presence-arbiter.ts
src/main/presence/presence-controller.ts
tests/unit/presence-events.test.ts
tests/unit/presence-arbiter.test.ts
tests/unit/presence-rules.test.ts
tests/fixtures/presence/*.json
```

### 5.2 M5.2 以后新增

```text
src/main/presence/session-memory.ts
src/main/presence/emotion-engine.ts
src/main/presence/episodic-memory.ts
src/main/presence/memory-retrieval.ts
src/main/presence/ai-intent-service.ts
src/main/presence/presence-diagnostics.ts
```

### 5.3 需要改造但不重写的现有模块

- `src/main/index.ts`
  - 创建 `PresenceController`。
  - 将互动、场景、电源和 AI 回复事件送入统一入口。
  - M5.1 只让 Presence 观测直接互动，不改变其现有执行权。
  - 最终仍调用现有 `sendRendererCommand`。
- `src/main/autonomous-behavior.ts`
  - 第一阶段保留动作选择函数，去掉其独立计时职责。
- `src/shared/scene-companion.ts`
  - 第一阶段保留表演数据，作为候选来源之一。
  - 冷却和最终选择逐步迁入中央仲裁器。
- `src/renderer/src/main.ts`
  - 汇报语音生命周期。
  - 保持“无台词动作不得中断语音”的既有约束。
- `src/main/domain/deepseek-client.ts`
  - M5.5 才扩展为结构化表演计划。

---

## 6. 核心数据契约

### 6.1 PresenceEvent

事件必须包含稳定 ID、时间和来源。第一版建议使用可辨识联合：

```ts
type PresenceEvent =
  | BaseEvent<'app_started'>
  | BaseEvent<'app_resumed'>
  | BaseEvent<'return_episode', ReturnEpisode>
  | BaseEvent<'scene_changed', { from: SceneKind; to: SceneKind }>
  | BaseEvent<'scene_stable', { scene: SceneKind; durationMs: number }>
  | BaseEvent<'focus_milestone', { scene: SceneKind; durationMs: number }>
  | BaseEvent<'user_interaction', { kind: InteractionKind; area: string }>
  | BaseEvent<'dragging_changed', { dragging: boolean }>
  | BaseEvent<'speech_state_changed', { state: SpeechState }>
  | BaseEvent<'speech_completed', { dialogueId?: string }>
  | BaseEvent<'ai_reply_ready', { replyId: string }>
  | BaseEvent<'power_changed', { suspended: boolean; screenLocked: boolean }>
  | BaseEvent<'periodic_tick', { at: number }>

interface BaseEvent<T extends string, P = Record<string, never>> {
  id: string
  at: number
  epoch: number
  source: 'main' | 'scene' | 'renderer'
  type: T
  payload: P
}

interface ReturnEpisode {
  id: string
  awayStartedAt: number
  returnedAt: number
  awayMs: number
  reason: 'unlock' | 'wake' | 'system-idle' | 'restart'
  greeted: boolean
}
```

事件中默认不携带窗口标题、选中文字、文件路径或完整 AI 请求正文。

事件合并规则：

- 点击、电源、锁屏和用户主动 AI 请求立即处理。
- 场景、专注里程碑和微动作在 100 ms 窗口内合并。
- 每个决策带 `eventEpoch`；执行前若 epoch 已变化，普通候选作废。
- `app_resumed`、电源变化和系统空闲恢复由 Normalizer 合并成一个
  `return_episode`，同一 episode 最多消费一次问候。

### 6.2 PresenceContext

数据类型按里程碑演进而非一次性铺满：

#### PresenceContextV1（M5.1）

```ts
interface PresenceContextV1 {
  now: number
  scene: TimeSceneContext
  pet: {
    mood: number
    energy: number
    affectionLevel: number
  }
  runtime: {
    visible: boolean
    dragging: boolean
    clickThrough: boolean
    speechState: SpeechState
    interactionsPaused: boolean
  }
}
```

`SessionContext` 在 M5.2 以可选字段加入，`EmotionState` 在 M5.3 以可选字段加入。
M5.1 不得依赖尚未定义的情绪或持久化类型。

### 6.3 PresenceCandidate

规则只返回候选：

```ts
interface PresenceCandidate {
  ruleId: string
  priority: number
  cooldownKey: string
  cooldownMs: number
  speech: 'none' | 'optional' | 'required'
  bodyPolicy: 'none' | 'overlay' | 'replace'
  canRunWhileSpeaking: boolean
  action?: PetAnimation
  modelClip?: string
  expression?: PetExpression
  dialogue?: string
  voice?: string
  spokenText?: string
  reason: string
  tags: string[]
}
```

### 6.4 PresenceDecision

```ts
type PresenceDecision =
  | {
      kind: 'silent'
      reason: string
    }
  | {
      kind: 'perform'
      candidate: PresenceCandidate
      eventEpoch: number
      selectedAt: number
      score: number
    }
```

最终执行仍转换为现有 `RendererCommand`，避免首版同时修改渲染 API。

### 6.5 SpeechState

```ts
type SpeechState = 'idle' | 'synthesizing' | 'speaking' | 'interrupted'
```

规则：

- `synthesizing` 和 `speaking` 时，普通主动对白不得进入。
- `speech='none'`、`bodyPolicy='overlay'` 且 `canRunWhileSpeaking=true` 的微动作
  可以在语音中使用。
- 完整身体动作（`bodyPolicy='replace'`）默认等待语音结束，避免替换正在表演的动作。
- 用户主动点击可以打断语音，并由互动规则决定是否立即回应。
- AI 旧回复晚到且已被取消时，必须丢弃，不得补播。

### 6.6 Delivery 关联

```ts
interface RendererCommand {
  // 现有字段保持不变
  deliveryId?: string
}

interface DeliveryLifecycleEvent {
  deliveryId: string
  type: 'speech_started' | 'speech_completed' | 'speech_interrupted'
  reason?: 'user' | 'new-speech' | 'power' | 'stop' | 'error'
}
```

`deliveryId` 只关联一次主动或用户触发的表演，不包含正文。主进程忽略不存在的、
已经结束的或不属于当前表演的 ID。

---

## 7. 仲裁策略

### 7.1 固定优先级

| 层级         | 优先级 | 示例                          |
| ------------ | -----: | ----------------------------- |
| 电源与安全   |    100 | 锁屏、睡眠、暂停、窗口隐藏    |
| 用户直接互动 |     80 | 点击、长按、拖拽、用户触发 AI |
| AI 当前回复  |     70 | 已获确认的用户请求            |
| 会话转换     |     60 | 离开后返回、跨天首次启动      |
| 明确场景事件 |     40 | 持续专注里程碑、进入深夜      |
| 普通主动陪伴 |     25 | 安静陪伴、场景评论            |
| 微动作       |     10 | 视线移动、重心变化            |

M5.1 的 Presence 只负责主动行为；点击、长按、拖拽和用户主动 AI 仍走现有
直接执行链。这些事件会通知 Presence 抑制普通主动行为，但不会在首版被重新仲裁。

### 7.2 候选评分

第一版使用可解释的加法评分，不做黑盒模型：

```text
score =
  basePriority
  + contextBonus
  + relationshipBonus
  + noveltyBonus
  - repetitionPenalty
  - interruptionPenalty
  + deterministicJitter
```

- `contextBonus`：场景和时段吻合程度。
- `relationshipBonus`：只有确实满足关系条件时添加。
- `noveltyBonus`：长时间未使用的候选略微加权。
- `repetitionPenalty`：同规则、同 tag、同文本的近时使用。
- `interruptionPenalty`：正在语音、拖拽或用户刚互动时。
- `deterministicJitter`：由注入的随机源产生，保证测试可重现。

同一批候选按 `cooldownKey` 去重，再按分数排序。执行前必须再次验证 `eventEpoch`、
语音状态和预算，防止异步事件在排队期间使决定过期。

### 7.3 全局预算

默认“平衡”模式建议：

| 限额                 |              默认值 | 目的           |
| -------------------- | ------------------: | -------------- |
| 两次主动对白最小间隔 |               45 秒 | 避免连续说话   |
| 普通主动对白         |     每小时最多 6 次 | 保持日奈克制   |
| 主动 AI 调用         |     每小时最多 4 次 | 控制延迟和成本 |
| 完全重复文本         |      30 分钟内 0 次 | 避免明显复读   |
| 同语义提醒           |      15 分钟内 0 次 | 避免重复催促   |
| 主动行走             | 每 10 分钟最多 1 次 | 减少桌面干扰   |

M5.1 先执行最小间隔和规则级冷却；30 分钟全局文本去重、语义 tag 冷却和主动 AI
预算分别从 M5.2、M5.5 开始生效。

每小时 6 次用于普通主动表现；返回、专注里程碑等优先级 40 以上的事件可额外使用
最多 2 个保留名额，因此硬上限为每小时 8 次。普通场景评论不能占满关键事件预算。

数值先作为默认策略，M5.7 根据实际日志调整。

---

## 8. 第一版行为规则

M5.1 不迁移全部 27 条场景表现。先实现以下高价值规则：

| 规则                    | 触发                       | 默认表现               |
| ----------------------- | -------------------------- | ---------------------- |
| `return-greeting`       | 当前进程锁屏/唤醒/空闲返回 | 简短注意或问候         |
| `focus-first-milestone` | 连续专注 40 分钟           | 短暂视线或轻提醒       |
| `focus-long-milestone`  | 连续专注 90 分钟           | 更强的休息建议，仅一次 |
| `late-night-first`      | 首次进入深夜工作           | 一条深夜提醒           |
| `scene-arrival`         | 新场景稳定 20 秒           | 场景相关轻反应         |
| `quiet-company`         | 高好感、低打扰场景         | 不说或只说短句         |
| `rest-needed`           | 精力低                     | 休息动作或睡意表现     |
| `idle-micro-motion`     | 长时间无互动               | 仅视线/微动作，不说    |
| `hard-silence`          | 用户刚互动、语音中、锁屏等 | 不产生普通主动行为     |

每条规则必须：

- 有唯一 `ruleId`。
- 有明确触发原因。
- 有独立冷却。
- 可通过注入时钟单测。
- 有 `silent` 或低打扰回退。

M5.1 的 tag 使用封闭词表，不从自由文本临时生成：

```ts
type PresenceTag = 'late_night' | 'rest' | 'focus' | 'return' | 'affection' | 'scene_comment'
```

### 8.1 内容条目

主动表演内容使用独立、可校验的格式，规则只引用内容 ID：

```ts
interface PresenceContentEntry {
  id: string
  textZh: string
  spokenJa?: string
  tags: PresenceTag[]
  action: PetAnimation
  expression: PetExpression
  voicePath?: string
  cooldownClass: 'short' | 'medium' | 'long'
  minimumAffection?: number
  maximumEnergy?: number
}
```

约束：

- 固定主动台词必须命中官方语音或预生成 WAV，避免突然启动重型 TTS。
- 动态 AI 台词必须同时提供中文与日文，且通过长度和动作白名单校验。
- 每条内容必须有 tag、冷却类别和至少一个可用回退动作。
- 角色审查分开检查“情境是否合理”“语气是否符合日奈”“中文与日文语义是否一致”。

---

## 9. 连续性记忆

### 9.1 第一版只做会话记忆

建议文件：

```text
~/Library/Application Support/Deskpet/presence-session.json
```

```ts
interface SessionContextV1 {
  schemaVersion: 1
  sessionStartedAt: number
  lastSeenAt: number
  lastInteractionAt: number | null
  lastExternalScene: SceneKind | null
  lastTimePeriod: TimePeriod | null
  recentDialogues: RecentDialogue[]
  recentIntentKeys: Record<string, number>
}

interface RecentDialogue {
  at: number
  dialogueId: string
  textHash: string
  tags: PresenceTag[]
}
```

结构：

```json
{
  "schemaVersion": 1,
  "sessionStartedAt": 1760000000000,
  "lastSeenAt": 1760003600000,
  "lastInteractionAt": 1760003000000,
  "lastExternalScene": "development",
  "lastTimePeriod": "late_night",
  "recentDialogues": [
    {
      "at": 1760002500000,
      "dialogueId": "late-night-gentle",
      "textHash": "sha256-prefix",
      "tags": ["late_night", "rest"]
    }
  ],
  "recentIntentKeys": {
    "rest-reminder": 1760002500000
  }
}
```

### 9.2 返回识别

以下任一情况产生 `return_episode`：

- 应用重启后，距 `lastSeenAt` 超过阈值。
- 锁屏/睡眠超过阈值后恢复。
- 系统空闲超过阈值后重新出现用户活动。

需避免重复问候：

- 每个返回 episode 只允许一次高优先级问候。
- 用户刚点击日奈时，返回问候让位于直接互动。
- 深夜、会议/沟通场景可以降级为不说。

### 9.3 防重复

- `DialogueService` 继续保留快速池内轮换。
- Presence 层新增按文本哈希的 30 分钟去重。
- 同一 tag 有额外冷却。
- 规则重试不能绕过硬去重。
- 30 分钟全局去重只约束场景、专注、返回等主动表现；用户直接点击仍使用原有
  池内防重复，不会因为全局去重而突然沉默。

### 9.4 写入策略

- 关键事件后 1 秒 debounce 保存。
- 应用退出、休眠和系统关机前 flush。
- 使用现有“临时文件 + rename”原子写入模式。
- 文件损坏时备份并重建，不影响 `pet-state.json`。

---

## 10. 情绪与关系状态

### 10.1 新状态不与旧存档混写

情绪初版保存到独立文件：

```text
~/Library/Application Support/Deskpet/presence-emotion.json
```

原因：

- 不提升 `pet-state.json` schema，降低迁移风险。
- 可一键关闭情绪系统。
- 原有 `mood` 和 `energy` 继续驱动现有点击规则。

### 10.2 EmotionState

```ts
type EmotionKind = 'calm' | 'content' | 'concerned' | 'embarrassed' | 'annoyed' | 'tired'

interface EmotionState {
  schemaVersion: 1
  valence: number
  activation: number
  fatigue: number
  patience: number
  socialBattery: number
  dominant: EmotionKind
  causes: EmotionCause[]
  updatedAt: number
}

interface EmotionCause {
  source: string
  delta: number
  label: string
  startedAt: number
  expiresAt?: number
}
```

### 10.3 变化规则

- 单次点击不能直接让情绪从负值跳到正值。
- 情绪变化使用缓动和最短持续时间。
- 重复刺激的边际影响递减。
- 深夜、持续专注和系统空闲可以增加疲劳。
- 安静陪伴、成功休息和低刺激互动可以恢复社交电量。
- 高好感影响耐心恢复速度和允许的互动距离，不取消边界。

M5.3 前，`pet-state.json` 中的 `mood` 和 `energy` 仍是现有点击规则与互动奖励的
权威状态。`EmotionState` 是 Presence 的行为修饰层，不直接写回旧状态；如果未来
需要双向同步，必须单独升级 schema 并设计迁移。

### 10.4 关系修饰

不新增第二套好感 XP。关系由现有 `affectionLevel` 与关键 flags 派生：

```text
低等级：更常保持距离，较少主动靠近
中等级：允许安静陪伴，提醒更直接
高等级：更少客套，更愿意承认担心，容忍部分重复互动
```

输出到行为层的只是修饰系数，不直接拼接台词。

---

## 11. 情节记忆

### 11.1 记忆内容

长期记忆只接受结构化、可解释的 episode：

```ts
interface EpisodicMemory {
  id: string
  kind:
    | 'late_night_work'
    | 'long_focus'
    | 'frequent_return'
    | 'relationship_milestone'
    | 'explicit_preference'
  summary: string
  tags: string[]
  importance: number
  createdAt: number
  lastReferencedAt: number | null
  expiresAt: number | null
  sourceEventIds: string[]
}
```

### 11.2 生成原则

- 先由本地模板生成，不让 AI 自由编造共同经历。
- `summary` 只能由固定模板和受控参数生成，不接受任意自由文本。
- `sourceEventIds` 必须存在。
- 不保存具体代码、文档正文、窗口标题或选中文字。
- 同一 episode 在时间窗口内合并，不重复生成。
- 默认最多 100 条、保留 30 天；关系里程碑可长期保存。

### 11.3 检索

第一版不需要向量数据库。使用：

```text
score =
  0.45 × tagMatch
  + 0.30 × recency
  + 0.20 × importance
  + 0.05 × novelty
```

只有 `score` 超过阈值且未在近时被引用时才进入 AI 上下文。

### 11.4 设置页

M5.4 增加最小管理界面：

- 记忆模式：`关闭` / `仅本次会话` / `长期记忆`
- 查看最近 20 条记忆
- 删除单条
- 清空全部
- 显示保存位置

---

## 12. AI 集成

### 12.1 保持本地优先

- 微动作、防重复、基本提醒和返回问候完全本地完成。
- 普通场景评论不默认调用 AI。
- 用户主动触发的 DeepSeek 流程保持现有隐私预览。
- 主动 AI 默认只在用户开启 AI 且满足高价值事件时使用。

DeepSeek 客户端在 M5.5 拆分为两个契约，避免改变现有用户请求语义：

```text
replyForUser()       用户明确触发，必须返回可播放回复
planProactiveReply() 主动判断，允许 should_speak=false
```

两者共享 JSON 和动作白名单校验，但使用不同的结果类型。

### 12.2 主动 AI 许可条件

必须同时满足：

- `aiEnabled=true`
- 用户启用主动 AI
- 当前不是锁屏、睡眠、拖拽、完全穿透或语音播放
- 事件优先级达到阈值
- 近 15 分钟没有相同主题
- 未超过每小时主动 AI 预算
- 上下文只包含允许保存的场景摘要

### 12.3 返回结构

M5.5 扩展 DeepSeek 返回：

```json
{
  "should_speak": true,
  "intent": "gentle_reminder",
  "reply_zh": "先停一下。喝口水再继续。",
  "reply_ja": "少し休んで。お水を飲んでからでいい。",
  "emotion": "calm",
  "action": "look_at_cursor",
  "memory_reference_ids": ["memory-id"],
  "confidence": 0.82
}
```

约束：

- `should_speak=false` 时必须允许静默。
- `action` 只能来自白名单。
- 引用的记忆 ID 必须由程序提供，不能由模型虚构。
- 文本长度、日文一致性和情绪字段继续做严格校验。
- 超时、网络错误或结构非法时回退到本地规则或沉默。

### 12.4 请求生命周期

```text
高价值事件
→ 本地候选通过
→ 创建 requestId
→ 请求 DeepSeek
→ 期间用户互动/锁屏/新请求可取消
→ 返回后检查 requestId 是否仍有效
→ 再经过预算、防重复和语音仲裁
→ 执行
```

旧请求的结果不得覆盖新状态。

---

## 13. 动作、视线与语音协调

### 13.1 表演时间线

建议的单次表演：

```text
0 ms       注意方向变化 / 轻微预备
120-250 ms 主动作或转头
250-450 ms 表情到位
同时或稍后 显示气泡并开始语音
结束后     回到基础待机，不机械立即抽下一个
```

### 13.2 打断

- 用户点击：允许立即停止语音并回应。
- 用户拖拽：动作立即切换，语音停止或完成后不再续播。
- 普通待机：只允许动作层，不允许语音层。
- 新 AI 回复：取消旧 AI 请求和旧回复。
- 锁屏/睡眠：停止语音并保存状态。

### 13.3 动画分层目标

短期不必重写模型系统，先增加行为约束：

- 视线与头部跟随不抢主动作。
- 微动作不反复切换完整 AnimationClip。
- 只在有意义的规则下播放完整官方动作。
- 动作结束后保持稳定待机，不连续随机换 clip。

M5.6 再评估是否需要渲染器级别的 additive motion 通道。

### 13.4 语音情绪

- 情绪由统一的 `EmotionState` 决定。
- 情绪种子派生时加入关系等级和规则 ID，降低同句重复感。
- 预生成音频优先，动态 TTS 只用于新文本。
- 所有主动台词必须准备可接受的无语音回退。

---

## 14. 设置与可观察性

### 14.1 用户设置

M5.2 已加入：

- 连续记忆开关；关闭后不读取、不写入会话记忆。

M5.3 已加入：

- 情绪惯性开关；关闭后不恢复或写入情绪状态。
- 设置页显示当前情绪、疲劳、耐心和社交电量。

M5.4 以后继续增加：

- 主动活跃程度：`克制` / `平衡` / `活泼`
- 主动场景发言：开/关
- 主动 AI：开/关
- 长期记忆管理

### 14.2 诊断数据

渲染页或仅开发模式记录：

```text
presence.lastEventType
presence.lastRuleId
presence.lastDecision
presence.lastDecisionReason
presence.speechState
presence.duplicateSuppressedCount
presence.lastReturnAwayMs
presence.lastAiRequestId
```

生产环境日志默认不记录文本正文，只记录规则 ID、哈希和结果。

### 14.3 调试开关

```text
DESKPET_PRESENCE_MODE=legacy|shadow|active
DESKPET_PRESENCE_LOG=1
DESKPET_PRESENCE_CLOCK_SCALE=1
DESKPET_PRESENCE_RANDOM_SEED=...
```

三种模式定义：

| 模式     | 旧调度器     | 新仲裁器           | 说明               |
| -------- | ------------ | ------------------ | ------------------ |
| `legacy` | 执行         | 只观察             | 默认回滚路径       |
| `shadow` | 执行         | 计算并记录，不执行 | 用于对照和问题排查 |
| `active` | 停止主动路径 | 独占主动行为       | 当前生产默认模式   |

模式切换时必须清空未执行的候选和 `deliveryId`，避免新旧调度器同时发言。

---

## 15. 里程碑

默认按以下依赖顺序推进：

```text
M5.1 → M5.2 → M5.3 → M5.4 → M5.5 → M5.6 → M5.7
```

在 M5.2 完成后，M5.3 与 M5.4 可以部分并行；但 M5.5 必须同时依赖二者，
M5.6 不得早于 M5.1 的语音关联和 M5.3 的情绪映射。

### M5.1：Presence Core v1

**目标**：只接管主动行为，统一事件入口、规则候选和仲裁；先用 shadow 模式与旧调度器
对比，不接管用户直接互动，不做跨重启持久化。

**交付**

- Presence 类型和纯仲裁器。
- 场景、互动、语音、电源的适配事件。
- `legacy` / `shadow` / `active` 互斥运行模式。
- 6～8 条高价值本地规则。
- 当前进程内返回 episode 和最小上下文，仅内存保存。
- 带 `deliveryId` 的语音生命周期关联。
- 语音期间 overlay 微动作不打断语音的回归保护。
- 场景回放测试。

**验收**

- 40 分钟专注事件在固定随机种子下稳定产生同一决定。
- 语音播放中普通待机不会发送新对白。
- 语音播放期间只允许声明为 `overlay` 的微动作。
- 用户点击、长按和拖拽继续走旧直接执行链，但会抑制普通主动行为。
- 锁屏、拖拽、完全穿透时没有主动表现。
- `legacy` 和 `active` 模式下旧、新调度器不会同时发言。
- 晚到旧 `deliveryId` 事件不会改变新语音状态。
- shadow 输出记录拟执行规则、原因和得分，但不发送命令。
- `DESKPET_PRESENCE_MODE=legacy` 可立即回退。
- 现有 7 个 Electron E2E 保持通过。

**相对工作量**：2～3 个开发周期。

### M5.2：会话连续性与防重复

**目标**：日奈记得刚说过什么，并在应用重启或跨天返回时表现连续。

**交付**

- `presence-session.json`。
- 最近 20～30 条对白记录。
- 30 分钟全局防重复和语义 tag 冷却。
- 跨重启返回 episode 和一次性问候。
- 损坏存档恢复。
- 设置页连续记忆开关。

**验收**

- 同一台词 30 分钟内不再出现。
- 应用重启后仍能抑制刚说过的台词。
- 离开 2 小时后返回只问候一次。
- 同一返回由锁屏、唤醒和空闲恢复同时触发时，只生成一个 episode。
- 返回后立即点击日奈时只回应点击，不重复问候。
- 记忆文件损坏不影响好感存档。
- 关闭连续记忆后不读取旧历史、不创建新的主动历史，也不会产生跨重启问候。

**相对工作量**：2～3 个开发周期。

### M5.3：情绪惯性与关系修饰

**目标**：情绪有原因、持续时间和衰减，不再一次点击瞬变。

**交付**

- 独立 `EmotionEngine`。
- `valence`、`activation`、`fatigue`、`patience`、`socialBattery`。
- 互动、专注、深夜、休息的事件映射。
- 基于好感等级的关系修饰。
- 行为权重和语音情绪接入。

**验收**

- 连续三次摸头后耐心下降，但不会立刻把好感变负。
- 安静陪伴后负面状态缓慢恢复。
- 同一事件在不同关系等级下产生不同但不崩人设的候选。
- 情绪状态重启后恢复，并能安全迁移。
- 单次互动不能越过情绪变化上限。

**相对工作量**：3～4 个开发周期。

### M5.4：情节记忆

**目标**：日奈能记住少量真正有意义的共同经历，并可在之后自然引用一次。

**交付**

- 结构化 episode 生成。
- 最多 100 条、30 天保留和去重合并。
- 标签/时间/重要度检索。
- 设置页记忆管理。
- 本地隐私审计与测试。

**验收**

- “连续深夜开发”跨天可被检索，但不会保存代码正文。
- 同一事件不会生成大量重复记忆。
- 被删除的记忆不再进入 AI 上下文。
- 关闭长期记忆后不创建新 episode。
- 100 条上限和过期清理通过单元测试。

**相对工作量**：4～5 个开发周期。

### M5.5：受约束的主动 AI

**目标**：AI 能参与行为计划，但只在真正值得时调用，并支持静默。

**交付**

- Presence 摘要进入 AI 上下文。
- 结构化 `should_speak`、intent、action 和 memory reference。
- 请求取消、过期结果丢弃和每小时预算。
- 主动 AI 设置项。
- 失败回退到本地规则。

**验收**

- 普通微动作不触发 AI 请求。
- 主动 AI 每小时不超过预算。
- 用户切换场景或点击后，旧请求不会晚到抢话。
- 非法 JSON、未知动作和虚构记忆引用均被拒绝。
- 主动 AI 关闭、无网络或 TTS 不可用时仍可静默运行。

**相对工作量**：3～4 个开发周期。

**实施结果（v0.4.9）**

- 主动规划默认关闭，必须同时开启 DeepSeek 和“允许日奈主动规划”。
- 只有 `priority >= 40` 且有台词的本地候选进入云端规划；普通微动作和自主行走不调用 AI。
- 每小时默认最多 4 次请求，超限直接回到本地候选。
- 规划结果支持 `should_speak=false`；AI 可选择完全不表现，或只做动作。
- 用户互动、场景/时段切换、锁屏/睡眠、隐藏桌宠、完全穿透、关闭设置和退出都会取消未完成请求。
- 晚到结果通过 generation epoch 丢弃；主动 AI 不改变用户直接互动和用户触发的 DeepSeek 回复链路。
- 主动上下文只包含场景类别、时段、情绪、关系距离、本地触发原因和最多 5 条受控记忆摘要；不含窗口标题、应用名称或选中文字。
- 结构化动作、情绪、意图和记忆 ID 均经过白名单校验；模型无法引用未提供的记忆。
- AI 实际引用记忆时才更新 `lastReferencedAt`；失败、静默和取消不计为引用。
- 设置页显示主动 AI 开关、每小时用量、预算以及最近一次结果；AI 总开关关闭时主动开关不可操作。

### M5.6：微动作、打断与语音协调

**目标**：减少完整动作机械切换，让注意、开口和恢复更有时间层次。

**交付**

- 渲染器语音/动作生命周期回报。
- 动作预备、表情到位和恢复序列。
- 普通待机只叠加微动作的策略。
- 点击、拖拽、AI 回复的打断规则。
- 情绪到语音速度和情绪种子的映射。

**验收**

- 主动语音播放期间动作不会截断语音。
- 点击打断后产生明确恢复，不会原句继续。
- 同一待机 5 分钟内不连续重复同一个完整 clip。
- 视线、呼吸和主动作没有明显争抢。
- 低功耗模式下不增加持续高频渲染。

**相对工作量**：4～6 个开发周期。

**实施结果（v0.5.0）**

- 新增动作表演状态机：`idle → preparing → performing → recovering → idle`。
- 渲染器会回报 action prepared/started/completed/interrupted、micro started/completed 和 recovery started/completed。
- 表情先于主动作到位；活跃模式预备 70 ms，低功耗模式为 0 ms。
- 单次动作完成后执行 120 ms 恢复延迟和 220 ms 恢复窗口，并把表情恢复为 neutral。
- 普通待机微动作改为 `overlay`，不再切换完整 clip，只叠加视线、呼吸和头发程序化运动。
- 语音期间允许 overlay 微动作，同时拒绝新的 replace 类完整动作。
- 用户点击、拖拽、AI 新回复、锁屏、睡眠和渲染器切换会中断旧动作/语音；旧 delivery 和 performance token 的晚到事件被丢弃。
- 同一 ambient 完整 clip 在 5 分钟内不会连续重复；Presence 和渲染器各有一层防护。
- GLB 渲染在完整动作期间降低程序化呼吸/头发/视线权重到 0.42，减少主动作与微动作争抢。
- 环境动作标记为 `ambient`，不会重置用户活动计时或退出低功耗；用户互动仍会立即恢复高响应渲染。
- 新增情绪语速映射：疲劳更慢、高激活略快、annoyed/warning 更短促，语速限制在 0.90～1.12；seed 仍按情绪和激活度确定。

### M5.7：调优与长时验收

**目标**：根据真实行为日志调整频率、冷却和角色边界。

**交付**

- 事件回放工具。
- 8 小时和 24 小时运行测试。
- 主动发言频率、重复率和打断率报告。
- 默认策略定稿。
- 新版本 `.app` 与迁移包。

**验收**

- 连续运行 8 小时无崩溃、无内存持续增长。
- 待机 CPU 不高于 M5 前的基线加 0.5 个百分点。
- 主动对白和 AI 调用不超过配置预算。
- 常用场景下没有连续复读同一主题。
- 用户可随时切回克制模式或关闭主动行为。

**相对工作量**：2～3 个开发周期，加长时运行。

**实施结果（v1.0.0）**

- 新增确定性 Presence 事件回放器：`npm run presence:replay`。
- 使用虚拟时钟完成 8 小时和 24 小时运行：
  - 8 小时：1920 次场景采样，101 次表现，1.13 次对白/小时，峰值 2 次/小时；
  - 24 小时：5760 次场景采样，317 次表现，0.50 次对白/小时，峰值 1 次/小时；
  - 两个场景均无 30 分钟内重复对白，记忆上限均未超过 100 条。
- 默认策略定为“平衡”，并新增用户可切换的三档强度：
  - 克制：每小时最多 3 句、最短间隔 120 秒、主动 AI 每小时 2 次、待机微动作 5 分钟；
  - 平衡：每小时最多 6 句、最短间隔 45 秒、主动 AI 每小时 4 次、待机微动作 90 秒；
  - 活泼：每小时最多 9 句、最短间隔 20 秒、主动 AI 每小时 6 次、待机微动作 45 秒。
- 新增“允许日奈主动行动”总开关；关闭后保留点击、拖拽和用户主动 AI，但所有自主候选保持静默。
- 新增内存遥测，不持续写盘：场景采样、决策、静默率、表现、语音、主动请求/回退/取消、重复抑制、动作/语音打断和分规则计数。
- 设置页实时显示运行遥测，用户可观察行为是否超出预期。
- 发布报告写入 `dist/presence-soak-report.json`，最终默认策略见 `docs/PRESENCE_RELEASE_POLICY.md`。
- 8/24 小时为虚拟时钟回放结果；真实墙钟长测仍需在后续日常运行中继续积累，不能把加速回放等价为真实 24 小时驻留。

---

## 16. 测试策略

### 16.1 单元测试

- 事件归一化、去重和过期。
- 15 秒场景轮询边界、40/90 分钟里程碑和跨日重置。
- 候选评分与固定随机种子。
- 冷却、预算和打断优先级。
- 防重复文本哈希和语义 tag。
- 锁屏、唤醒和空闲恢复合并后的返回 episode 去重。
- 晚到旧 `deliveryId` 不覆盖新语音状态。
- 设置窗口伪造 delivery event 被拒绝。
- 情绪上下限、缓动和持久化。
- 情节记忆筛选、合并、过期和删除。
- JSON 损坏和原子写入失败时保留旧存档并安全回退。
- AI JSON 校验和记忆引用合法性。

### 16.2 场景回放测试

测试夹具格式：

```json
{
  "name": "late-night-focus-then-return",
  "seed": 1234,
  "events": [
    { "at": 0, "type": "scene_changed", "payload": { "to": "development" } },
    { "at": 2400000, "type": "focus_milestone" },
    {
      "at": 7200000,
      "type": "return_episode",
      "payload": { "awayMs": 1800000, "reason": "system-idle" }
    }
  ],
  "expected": ["focus-first-milestone", "return-greeting"]
}
```

回放期间不依赖真实时间、系统声音或网络。

### 16.3 Electron E2E

- 场景事件触发一次后不重复。
- 语音期间无台词动作不截断语音。
- 点击优先于场景发言。
- 锁屏/隐藏/完全穿透下不发言。
- 设置变更后立即应用预算和隐私模式。
- AI 请求取消后旧回复不执行。

### 16.4 手工矩阵

- 正常白天工作。
- 深夜连续开发。
- 频繁切场景。
- 离开两小时后返回。
- 睡眠/锁屏恢复。
- 用户不说话但持续移动鼠标。
- 用户连续点击和拖动。
- 主动语音中再次点击。
- AI 开启/关闭、记忆开启/关闭。

---

## 17. 评价指标

### 17.1 功能性指标

- 每个主动表现均有 `ruleId` 和触发原因。
- 主动表现中的完全重复文本在 30 分钟内为 0；直接互动维持原池内规则。
- 主动对白频率在预算内。
- 用户直接互动响应优先于所有普通主动行为。
- 语音完整播放率保持 100%。

### 17.2 性能指标

- 本地仲裁 P95 小于 5 ms。
- M5.1 不增加新的固定高频轮询。
- 事件日志默认关闭，不持续写盘。
- 30 天记忆文件目标小于 5 MB。

### 17.3 主观验收

每次里程碑后按以下问题评分：

1. 她是否记得刚才发生过的事？
2. 她是否在应该安静的时候保持安静？
3. 台词是否像对当前情境的反应，而不是随机播放？
4. 情绪变化是否有原因并持续足够时间？
5. 高好感是否通过细微行为体现，而不是只增加甜台词？
6. 打断和恢复是否自然？
7. 一天后再次启动是否仍具有连续性？

---

## 18. 迁移、回滚与版本策略

### 18.1 数据迁移

- M5.1～M5.3 不修改 `pet-state.json` schema。
- 新系统使用独立 Presence 文件。
- 启动时若新文件不存在，使用安全默认值。
- 新文件损坏时备份并重建，不触碰现有存档。

### 18.2 行为回滚

- M5.1 保留旧 `AutonomousBehaviorScheduler` 和 `SceneCompanion`。
- 通过 `DESKPET_PRESENCE_MODE` 在 `legacy`、`shadow` 和 `active` 间切换。
- 当前默认使用 `active`；`shadow` 用于对照，`legacy` 作为紧急回退。
- 如果主动行为异常，可立即设置 `DESKPET_PRESENCE_MODE=legacy`。
- 如果出现高频发言或角色崩坏，优先关闭对应规则而不是回滚存档。

### 18.3 发布

- 每个里程碑单独递增 patch 版本。
- 每个里程碑更新 `DEV_LOG.md`。
- 行为默认值发生明显变化时，在设置页显示更新说明和恢复默认入口。
- 发布前重新构建 `.app`、迁移包和 SHA-256。

---

## 19. 风险与应对

| 风险                     | 可能后果           | 应对                                  |
| ------------------------ | ------------------ | ------------------------------------- |
| 规则过多导致主动发言过密 | 日奈变得吵闹       | 全局预算、沉默优先、克制模式          |
| 情绪衰减过慢或过快       | 角色显得记仇或瞬变 | 最短持续时间、上限、回放调参          |
| AI 主动请求延迟          | 反应与当前场景错位 | 本地先决定、请求可取消、过期丢弃      |
| 记忆引用错误             | 角色编造共同经历   | 模板化 episode、程序提供 ID、严格校验 |
| 隐私文本进入记忆         | 数据泄露风险       | 默认只存标签和摘要，设置页可审查      |
| 新旧调度器并存冲突       | 双重发言、动作抢断 | M5.1 明确互斥模式，shadow 通过后切换  |
| 事件文件持续增长         | 磁盘和启动变慢     | 轮转、上限、30 天过期                 |
| 情绪数值与旧 mood 重复   | 状态难解释         | 旧状态为权威；EmotionState 只作修饰层 |
| 动画接入过早             | 调试变量过多       | 先稳定规则和记忆，再进入 M5.6         |

---

## 20. M5.1 实施清单

按以下顺序执行，每一步都应保持应用可启动：

1. 新增 `src/shared/presence.ts`：
   - Event、Context、Candidate、Decision 和诊断字段。
2. 新增 `presence-context.ts`：
   - 从现有场景、PetController snapshot 和电源状态构建上下文。
3. 新增 `presence-arbiter.ts`：
   - 纯函数候选过滤、评分和决策。
4. 新增 `presence-rules.ts`：
   - 先实现 6～8 条高价值规则。
5. 新增 `presence-controller.ts`：
   - 接收事件，维护内存状态，调用纯函数并执行命令。
6. 在 `src/main/index.ts` 接入：
   - 启动、场景变化、互动、拖拽、电源和 AI 回复事件。
7. 在渲染器增加白名单语音生命周期回报：
   - 使用 `deliveryId`，不传动作完成事件，不改变现有播放逻辑。
8. 实现 `legacy` / `shadow` / `active` 互斥模式：
   - `shadow` 只比较决策，不发送命令；
   - `active` 停止旧主动执行路径。
9. 添加环境开关：
   - `DESKPET_PRESENCE_MODE`、固定时钟和随机种子。
10. 增加单元、回放和 Electron E2E。
11. 更新 `RuntimeInfo.milestone` 或明确保持 M4 的兼容策略。
12. 更新 `DEV_LOG.md`、版本号和安装包。

### M5.1 Definition of Done

- 新模式可通过 `legacy` / `shadow` / `active` 明确切换。
- 所有主动表现都能显示 ruleId 和 reason。
- 至少三个固定回放场景通过。
- 语音完整播放回归仍然通过。
- 用户点击抑制主动行为、规则冷却和静默路径通过自动化验证。
- 新旧调度器不会同时执行主动语音或主动动作。
- 旧 `deliveryId` 的晚到事件不会污染新状态。
- 语音播放中只执行允许的 overlay 微动作。
- 旧行为路径仍可运行。
- 完成实际试用并记录一天内的主动发言次数。

---

## 21. 暂不锁定的决策

以下参数必须在 M5.1 和 M5.2 实机试用后决定：

- “克制 / 平衡 / 活泼”三种模式的具体预算。
- 触发返回问候的 30 分钟/2 小时阈值是否合适。
- 专注里程碑除 40/90 分钟外是否增加 150 分钟。
- 日奈对不同重复互动的耐心曲线。
- 长期记忆的默认模式。
- 主动 AI 是否默认关闭。
- 是否允许高好感关系里程碑永久保留记忆。

这些决策只影响策略参数，不应要求重写核心架构。

---

## 22. 实施进度

更新时间：2026-10-25

| 条目                   | 状态   | 说明                                             |
| ---------------------- | ------ | ------------------------------------------------ |
| Presence 数据契约      | 已完成 | Event、Context、Candidate、Decision、Diagnostics |
| 纯函数仲裁器           | 已完成 | 优先级、硬静默、冷却、预算和交互 grace           |
| `legacy/shadow/active` | 已完成 | 默认 `active`，`shadow`/`legacy` 可切换          |
| 专注 40/90 分钟候选    | 已完成 | 当前进程内每个场景 episode 一次                  |
| 首次深夜候选           | 已完成 | 当前本地日期一次                                 |
| 当前进程返回 episode   | 已完成 | 锁屏、唤醒、系统空闲恢复                         |
| 场景陪伴候选接入       | 已完成 | 仅 `active` 下由 Presence 仲裁                   |
| `deliveryId` 语音关联  | 已完成 | 自然完成、中断和晚到事件丢弃                     |
| 自动与场景调度互斥     | 已完成 | `active` 下旧主动调度停止                        |
| 八小时 shadow 审计     | 已完成 | 规则里程碑、场景候选和每小时发言预算均在范围内   |
| `active` 设为默认      | 已完成 | 新安装版默认启用；`legacy` 仍可立即回退          |
| 会话文件持久化         | 已完成 | `presence-session.json`、原子写入和 0600 权限    |
| 跨重启返回             | 已完成 | 基于 lastSeenAt 生成 restart return episode      |
| 主动文本与 tag 去重    | 已完成 | 30 分钟文本哈希和分标签冷却                      |
| 连续记忆开关           | 已完成 | 关闭后不读取、不写入、不生成 restart return      |
| 会话文件损坏恢复       | 已完成 | 备份损坏文件并安全重建，不影响好感存档           |
| 独立情绪引擎           | 已完成 | valence、activation、fatigue、patience、社交电量 |
| 情绪事件映射           | 已完成 | 点击、抚摸、拖拽、专注、深夜和休息               |
| 关系修饰               | 已完成 | 好感等级影响负向敏感度与情绪恢复速度             |
| 情绪行为权重           | 已完成 | 疲劳、耐心和社交电量修改候选评分                 |
| 情绪语音映射           | 已完成 | 情绪状态映射到 TTS 风格与确定性 seed             |
| 情绪存档与开关         | 已完成 | `presence-emotion.json`、0600 和设置页开关       |
| 情绪跨重启恢复         | 已完成 | 重启后恢复状态并继续惯性演化                     |
| 结构化情节记忆         | 已完成 | 专注、深夜、频繁返回和关系里程碑                 |
| 情节记忆合并与过期     | 已完成 | 同类去重、证据计数、100 条上限和 30 天保留       |
| 情节记忆检索           | 已完成 | tag、时间、重要度和引用新鲜度评分                |
| 情节记忆管理           | 已完成 | 设置页查看最近 20 条、单条删除和全部清空         |
| 情节记忆隐私           | 已完成 | 只保存受控摘要、标签和来源事件 ID                |
| `presence-memory.json` | 已完成 | 原子写入、0600 权限和损坏恢复                    |
