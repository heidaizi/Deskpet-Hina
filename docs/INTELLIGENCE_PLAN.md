# 日奈智能化设计方案

> 版本：v1（设计草案）
> 日期：2026-11-04
> 状态：阶段 1 已实现（工作记忆、语义记忆最小版、反馈采集）；阶段 2 待开始
> 适用范围：本机 macOS 桌宠、单用户、私有资产

本文把「让日奈更聪明」拆成可落地的工程改造，目标是**在不更换模型、不显著增加云端成本的前提下**，让角色从「会说固定台词」变成「记得住、懂分寸、学得会」。

## 1. 目标与非目标

### 1.1 目标

| 维度 | 现在的体验                     | 目标体验                               |
| ---- | ------------------------------ | -------------------------------------- |
| 记忆 | 不记得上一句说了什么           | 能接住上一轮话题，记得几天前的事       |
| 分寸 | 固定每小时预算，专注时也会打扰 | 按「这次说值不值」决定，专注时自动收敛 |
| 适应 | 阈值永远不变                   | 被忽略、被打断后会自己调低频率         |
| 表达 | 固定 1～2 句                   | 语气与长度随关系、场景变化             |

### 1.2 非目标

- 不更换或升级云端模型（DeepSeek 现有能力足够）。
- 不做屏幕截图、不做全量剪贴板监听、不做键盘记录。
- 不做多用户、不做账号体系。
- 不做自主写操作（改文件、发消息）——最多到只读工具。
- 不在本阶段引入 embedding 检索或本地大模型推理。

## 2. 现状基线

以下为 2026-11-04 的实际实现，改造必须建立在这些既有结构上。

| 能力     | 位置                                                          | 现状                                                                                                                                               |
| -------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 场景感知 | `src/main/time-scene-monitor.ts`                              | 前台应用类别、时段、周末、系统空闲、电源、锁屏                                                                                                     |
| 候选生成 | `src/main/presence/presence-rules.ts`                         | 7 条规则：return-greeting、focus-long/first-milestone、late-night-first、rest-needed、idle-micro-motion、autonomous-walk，外加 `scene-companion:*` |
| 仲裁     | `src/main/presence/presence-arbiter.ts` `arbitratePresence()` | 固定优先级 + 冷却 + 每小时上限（3/6/9 条，按强度档位）                                                                                             |
| 主动 AI  | `presence-controller.ts`                                      | 仅高价值候选（priority ≥ 40），每小时 2/4/6 次                                                                                                     |
| 情绪     | `src/main/presence/emotion-engine.ts`                         | 六维状态 + 成因衰减                                                                                                                                |
| 情节记忆 | `src/main/presence/episodic-memory.ts`                        | 上限 100 条；检索分 = 0.45 标签 + 0.3 新近 + 0.2 重要性 + 0.05 新颖                                                                                |
| 对话     | `src/main/domain/deepseek-client.ts`                          | **单轮**：每次只发 system + 当前上下文，`max_tokens` 150～160                                                                                      |
| 上下文   | `src/main/domain/ai-context-service.ts`                       | 场景、时段、窗口标题（默认关）、选中文字（默认关）                                                                                                 |
| 仲裁总线 | `src/main/behavior/decision-bus.ts`                           | 优先级 + 租约，Presence 只记账不拦截                                                                                                               |
| 遥测     | `src/shared/types.ts` `PresenceTelemetrySnapshot`             | performed、speeches、interruptions、repeats、静默比例、运行时长                                                                                    |

结论：**感知够用、记忆缺失、决策粗放、反馈为零**。优先级应依次是记忆 → 反馈 → 决策 → 感知。

## 3. 总体架构

```text
                    ┌─────────────────────────────┐
   L4 反馈闭环  ───▶ │  FeedbackStore / HabitProfile│ ──▶ 影响 L2 成本项
                    └─────────────────────────────┘
                              │
  L0 感知 ──▶ ContextSnapshot ─┤
                              ▼
  L1 记忆 ──▶ 检索结果 ──▶ L2 决策（效用函数）──▶ 是否开口
                              │
                              ▼
                         L3 表达（文本/语音/动作）
                              │
                              ▼
                       L4 采集反馈事件（回到顶部）
```

四层职责：

- **L0**：只回答「现在是什么情境」，全部本地计算。
- **L1**：只回答「我知道什么」，工作记忆 + 情节记忆 + 语义记忆。
- **L2**：只回答「现在该不该说」，用效用函数替代硬预算。
- **L3**：只回答「怎么说」，沿用现有语音/动作/气泡管线。
- **L4**：只回答「上次说得对不对」，把用户行为变成权重。

## 4. L0 感知层

### 4.1 数据结构

新增 `src/main/domain/context-snapshot.ts`：

```ts
export interface ContextSnapshot {
  version: 1
  now: number
  scene: SceneKind
  timePeriod: TimePeriod
  isWeekend: boolean
  /** 同一前台应用连续停留的分钟数。 */
  focusMinutes: number
  /** 最近 30 分钟内的交互次数，用于区分「赶工」与「摸鱼」。 */
  interactionDensity: number
  /** 距离上一次任何交互的秒数。 */
  secondsSinceInteraction: number
  systemIdleSeconds: number
  onBatteryPower: boolean
  screenLocked: boolean
  suspended: boolean
  /** 0..1，越高越不适合打扰。 */
  focusPressure: number
}
```

### 4.2 采集规则

- 采样间隔沿用 15 秒（`DESKPET_TIME_SCENE_INTERVAL_MS`）。
- `focusMinutes`：前台 app 类别不变即累加；切换即归零。
- `interactionDensity`：环形缓冲区记录最近 30 分钟的交互时间戳。
- `focusPressure` 计算：

```text
focusPressure = clamp01(
  0.5 * smoothstep(10, 45, focusMinutes) +
  0.3 * smoothstep(2, 8, interactionDensity) +
  0.2 * (scene === 'development' || scene === 'focus' ? 1 : 0)
)
```

- 窗口标题、选中文字**不进入** snapshot，仍走现有「主动触发才读取」的路径。

## 5. L1 记忆层

### 5.1 三层记忆

| 层       | 作用                       | 容量                | 生命周期                    |
| -------- | -------------------------- | ------------------- | --------------------------- |
| 工作记忆 | 最近对话，保证能接话       | 12 轮，超出滚动摘要 | 小时级，重启保留最近 2 小时 |
| 情节记忆 | 专注、深夜、返回、关系升级 | 100 条（现有）      | 天～周                      |
| 语义记忆 | 事实与偏好（新增）         | 200 条              | 月级，可遗忘                |

### 5.2 数据结构

新增 `src/main/domain/memory/` 目录：

```ts
export interface ConversationTurn {
  id: string
  at: number
  role: 'user' | 'pet'
  text: string
  emotion?: string
  memoryIds?: string[]
}

export interface SemanticMemory {
  id: string
  /** 只有用户明确说出或再次确认的信息才允许写成 fact。 */
  kind: 'fact' | 'preference' | 'routine'
  statement: string
  confidence: number // 0..1
  source: 'explicit' | 'inferred'
  evidenceCount: number
  firstSeenAt: number
  lastSeenAt: number
  /** 推断类记忆允许过期。 */
  expiresAt?: number
}
```

### 5.3 存储选型

**阶段 1～2 继续用 JSON + 原子写**（沿用 `writeJsonAtomic`），理由：

- 现有数据层已经稳定（原子写、坏档备份、schemaVersion 迁移）。
- 引入 `better-sqlite3` 需要原生模块重建，会破坏当前「npx 直接打包」的简单链路。
- 数据量在千条以内，全量加载到内存完全够用。

等语义记忆超过 1,000 条或需要向量检索时，再评估 `node:sqlite` 或外置索引。

文件布局：

```text
~/Library/Application Support/Deskpet/
  memory/
    episodic.json      # 现有情节记忆迁移至此
    semantic.json
    conversation.json
    feedback.json
    habit.json
```

### 5.4 检索

阶段 1 沿用现有线性打分，补两个乘子：

```text
score = 0.40 * tagMatch
      + 0.25 * recency
      + 0.20 * importance
      + 0.10 * feedbackWeight   // 新：被用户回应过的记忆加分
      + 0.05 * novelty
```

- `feedbackWeight`：该记忆被引用后 30 秒内用户有交互，`+0.05`，上限 0.2。
- 检索结果按分数取前 5 条注入 prompt，总字符数不超过 600。

### 5.5 上下文组装（prompt 预算）

每次请求的硬预算：

| 区块               | 上限       |
| ------------------ | ---------- |
| system prompt      | 600 tokens |
| 当前情境（JSON）   | 300 tokens |
| 对话历史（压缩后） | 600 tokens |
| 检索到的记忆       | 300 tokens |
| 输出               | 160 tokens |

超过预算时按「记忆 → 历史 → 情境」的顺序裁剪，system prompt 永不裁剪。

## 6. L2 决策层

### 6.1 从预算到效用

现有实现只判断「配额是否用完」。改造后：

```text
utility = value - cost - inertia

value   = 0.30 * basePriorityNorm
        + 0.25 * sceneFit
        + 0.25 * memoryHit
        + 0.20 * relationship

cost    = 0.45 * focusPressure
        + 0.30 * recentDisturbance
        + 0.25 * lateNightPenalty

inertia = 0.6 * repeatPressure + 0.4 * cooldownPressure
```

各项定义：

| 项                  | 取值                  | 来源                                 |
| ------------------- | --------------------- | ------------------------------------ |
| `basePriorityNorm`  | 候选 `priority` / 100 | `PresenceCandidate.priority`         |
| `sceneFit`          | 0..1                  | 规则标签 × 当前场景匹配度            |
| `memoryHit`         | 0..1                  | 5.4 的检索分归一化；无命中为 0       |
| `relationship`      | 0..1                  | `affectionLevel / 8`                 |
| `focusPressure`     | 0..1                  | L0 输出                              |
| `recentDisturbance` | 0..1                  | 最近 30 分钟负反馈的指数滑动平均     |
| `lateNightPenalty`  | 0..1                  | 23:00–06:00 为 1，其余按小时线性衰减 |
| `repeatPressure`    | 0..1                  | 同规则最近使用间隔 / 冷却时长的反比  |

### 6.2 阈值与硬上限

```text
threshold = 0.42 + 0.25 * focusPressure + 0.15 * recentDisturbance
speak  ⇔  utility >= threshold
```

**硬上限继续保留**作为兜底（每小时 3/6/9 条），效用函数只在配额内排序，不允许突破上限。这样可以避免调参失误导致「突然话很多」。

### 6.3 与仲裁总线的关系

- `decision-bus` 仍负责跨来源抢占（交互 > Presence > 场景 > 自主）。
- 效用函数只解决「Presence 内部选谁、要不要说」。
- 两者职责不重叠：总线管「谁有资格动」，效用管「这次动值不值」。

### 6.4 伪代码

```ts
export function scoreCandidate(
  candidate: PresenceCandidate,
  context: PresenceContextV1,
  snapshot: ContextSnapshot,
  memoryHit: number,
  habits: HabitProfile,
): number {
  const value =
    (0.3 * candidate.priority) / 100 +
    0.25 * sceneFit(candidate, snapshot) +
    0.25 * memoryHit +
    (0.2 * context.pet.affectionLevel) / 8
  const cost =
    0.45 * snapshot.focusPressure +
    0.3 * habits.recentDisturbance +
    0.25 * lateNightPenalty(snapshot.now)
  const inertia =
    0.6 * repeatPressure(candidate, context) + 0.4 * cooldownPressure(candidate, context)
  return value - cost - inertia
}
```

## 7. L3 表达层

### 7.1 对话延续

- 被动问答（用户主动触发）：带上工作记忆最近 6 轮，允许追问一次。
- 主动开口：只带最近 2 轮，避免「她突然接一句几天前的话」。

### 7.2 语气自适应

| 关系等级 | 句长上限 | 语气          |
| -------- | -------- | ------------- |
| 1–2      | 20 字    | 克制、简短    |
| 3–4      | 30 字    | 正常          |
| 5–6      | 40 字    | 略带关心      |
| 7–8      | 50 字    | 允许撒娇/玩笑 |

实现方式：在 prompt 里注入 `maxChars` 与 `tone` 字段，并在输出校验阶段截断。

## 8. L4 反馈闭环

### 8.1 事件定义

```ts
export type FeedbackKind = 'dismissed' | 'interrupted' | 'engaged' | 'ignored'

export interface FeedbackEvent {
  id: string
  at: number
  ruleId: string
  scene: SceneKind
  timePeriod: TimePeriod
  kind: FeedbackKind
  /** 从台词出现到用户动作的毫秒数。 */
  latencyMs: number
}
```

### 8.2 采集点

| 信号                 | 采集位置                       | 判定          |
| -------------------- | ------------------------------ | ------------- |
| 气泡 3 秒内被关闭    | 渲染进程 `#bubble` 关闭事件    | `dismissed`   |
| 语音被点击打断       | 现有 `speech_interrupted` 上报 | `interrupted` |
| 台词后 30 秒内有交互 | 主进程 `notifyUserInteraction` | `engaged`     |
| 30 秒内无任何交互    | 主进程定时器                   | `ignored`     |

### 8.3 如何影响决策

```text
recentDisturbance = ema(kind 的权重, 半衰期 30 分钟)
权重：dismissed 1.0，interrupted 0.8，ignored 0.3，engaged -0.5
```

- 负值会把 `recentDisturbance` 往下拉，即「说对了」会降低后续的打扰成本。
- 同时按 `scene` 维度单独统计，形成 `dismissRateByScene`，用于 `sceneFit` 修正。

## 9. L5 行动层（可选，最后做）

- 只读工具：天气、日程、当前项目状态，全部走本地 MCP server，不联网的可离线。
- 写操作：必须二次确认，且只在用户明确要求时执行。
- 工具调用结果进入 prompt，但**不写入记忆**，除非用户明确说「记住」。

## 10. 模块与接口规划

### 10.1 新增文件

| 文件                                            | 职责                                 |
| ----------------------------------------------- | ------------------------------------ |
| `src/main/domain/context-snapshot.ts`           | 汇总 L0 指标，输出 `ContextSnapshot` |
| `src/main/domain/memory/conversation-buffer.ts` | 工作记忆与滚动摘要                   |
| `src/main/domain/memory/semantic-memory.ts`     | 语义记忆的增删查与置信度衰减         |
| `src/main/domain/memory/feedback-store.ts`      | 反馈事件存储与 EMA 计算              |
| `src/main/domain/memory/habit-profile.ts`       | 活跃时段、专注窗口、场景打扰率       |
| `src/main/presence/utility.ts`                  | 效用函数与阈值                       |

### 10.2 修改点

| 文件                                       | 改动                                                |
| ------------------------------------------ | --------------------------------------------------- |
| `src/main/presence/presence-arbiter.ts`    | 在配额判断前插入效用排序                            |
| `src/main/presence/presence-controller.ts` | 传入 snapshot / memory / habits；记录反馈           |
| `src/main/domain/deepseek-client.ts`       | `messages` 支持 `history`；新增 `maxChars` / `tone` |
| `src/main/domain/ai-context-service.ts`    | 上下文加入 `focusMinutes`、`recentTopics`           |
| `src/main/ipc/handlers.ts`                 | 反馈上报通道、设置项读写                            |
| `src/preload/index.ts`                     | `reportFeedback`、`getIntelligenceStatus`           |
| `src/renderer/src/settings.ts`             | 「数据」或新增「智能」分页的开关                    |
| `src/shared/types.ts`                      | 新增设置项与遥测字段                                |

### 10.3 设置项

```ts
interface AppSettings {
  // ...现有字段
  intelligenceLevel: 'off' | 'basic' | 'adaptive' // 默认 basic
  semanticMemoryEnabled: boolean // 默认 false
  feedbackLearningEnabled: boolean // 默认 true
  maxTurnsInContext: number // 默认 6
}
```

`intelligenceLevel = 'off'` 时完全回退到当前行为，便于 A/B 对比与紧急关闭。

## 11. 路线图

### 阶段 1：记得住（已实现）

- 工作记忆缓冲 + 注入 prompt（被动问答优先）
- 语义记忆最小版：只支持用户显式说「记住」
- 反馈事件采集与存储（先只记录，不影响决策）
- **验收**：连续 3 轮对话不重复自我介绍；能引用上一轮内容；单次请求 token 增幅 < 30%
- **风险**：历史注入导致模型过度引用旧话题 → 限制主动开口只带 2 轮
- **实现状态**：已完成（2026-11-04）
  - 工作记忆：`conversation-buffer.ts`，磁盘 24 轮、注入 240 字符预算；
  - 历史注入：`buildChatMessages()` 纯函数，单测断言开销 ≤ 30%；
  - 语义记忆：`semantic-memory.ts` + 设置页“记住这段”；
  - 反馈采集：`feedback-store.ts`，30 秒窗口内记 engaged / interrupted / ignored；
  - 未覆盖：`dismissed`（气泡无手动关闭入口），留待有交互入口后再补。

### 阶段 2：懂分寸（约 2 周）

- 效用函数接入仲裁
- 反馈 EMA 参与成本项
- 设置页新增「智能」分页
- **验收**：同一场景下主动台词接受率提升 20%；专注场景打扰 ≤ 0.5 次/小时
- **风险**：调参过度导致过于安静 → 保留强度档位与硬上限，提供 `intelligenceLevel=off` 回退

### 阶段 3：有习惯（约 2～4 周）

- 习惯画像（活跃时段、专注窗口）
- 按场景的打扰率自学习
- **验收**：主动行为 90% 落在用户活跃时段；静默原因可在诊断里解释
- **风险**：画像漂移 → 每周衰减重算，避免长期固化

### 阶段 4：能办事（可选）

- 只读工具接入
- 确认式写操作
- **验收**：工具调用有明确来源与超时；失败有兜底台词

## 12. 度量与埋点

| 指标         | 定义                                      | 采集位置                    | 目标       |
| ------------ | ----------------------------------------- | --------------------------- | ---------- |
| 主动性接受率 | 未被 3 秒关闭/打断的主动台词 / 总主动台词 | `feedback-store`            | 基线 +20%  |
| 专注打扰率   | 专注场景每小时主动次数                    | `PresenceTelemetrySnapshot` | ≤ 0.5      |
| 记忆命中率   | 主动台词引用了有效记忆的比例              | 候选 `memoryReferenceIds`   | ≥ 40%      |
| 24h 重复率   | 重复台词 / 总台词                         | 现有 repeats 计数           | < 5%       |
| 对话延续轮数 | 单次会话平均轮数                          | `conversation-buffer`       | ≥ 2.5      |
| 首字延迟     | 台词出现到首音节                          | 现有语音链路                | < 800 ms   |
| 每小时成本   | DeepSeek token 估算                       | `deepseek-client`           | 设定硬上限 |

回归工具：扩展现有 `npm run presence:replay`，为效用函数增加固定输入输出用例；新增 `npm run intelligence:replay` 跑多场景脚本。

## 13. 隐私、成本与延迟边界

- **本地优先**：L0、L1、L4 全部只在本地计算与存储。
- **云端只拿必要信息**：情境 JSON、压缩历史、检索摘要；不含原始窗口内容、不含完整对话全文。
- **成本**：按每次 < 2,000 tokens、每小时 ≤ 6 次主动估算，日成本控制在可接受范围内；超预算自动降级为固定台词。
- **延迟**：文本先出、语音异步；沿用现有预生成 WAV 命中策略，未命中才走 Irodori。

## 14. 失败模式与回滚

| 失败模式         | 表现               | 处置                                            |
| ---------------- | ------------------ | ----------------------------------------------- |
| 记忆注入过多     | 回答啰嗦、答非所问 | 收紧 5.5 预算，降 `maxTurnsInContext`           |
| 效用阈值过高     | 一天不说话         | 保留强度档位；恢复硬下限（每小时至少 1 次候选） |
| 反馈学偏         | 越来越安静         | `feedbackLearningEnabled=false` 一键回退        |
| 模型产生越界内容 | 出现系统操作声明   | 沿用输出白名单校验 + 动作白名单                 |
| 成本失控         | API 费用异常       | 每小时 token 预算硬截断，超限只走本地台词       |

## 15. 明确不做的事

- 不做屏幕截图或 OCR。
- 不做全量剪贴板监听。
- 不把语义记忆用于对外分享或导出。
- 不引入本地大模型推理（评估过，收益/复杂度不划算）。
- 不让角色主动评价用户的工作内容（容易滑向冒犯）。

## 16. 与现有技术债的关系

| 关联  | 说明                                                            |
| ----- | --------------------------------------------------------------- |
| TD-02 | 效用函数运行在 `decision-bus` 之上，两者边界已在本方案 6.3 明确 |
| TD-11 | 记忆与反馈都在本地，不触发 TTS 预加载                           |
| TD-12 | 新增的语义记忆默认关闭，且只从显式语句提取，符合现有隐私立场    |
| TD-14 | 与启动链路无关，不受签名问题影响                                |

## 17. 变更记录

| 日期       | 变更                                                      |
| ---------- | --------------------------------------------------------- |
| 2026-11-04 | 初版：分层设计、效用函数、四阶段路线与度量                |
| 2026-11-04 | 阶段 1 实现：工作记忆、历史注入、语义记忆最小版、反馈采集 |
| 2026-11-04 | 新增独立对话窗口（chat.html），作为连续对话入口           |
