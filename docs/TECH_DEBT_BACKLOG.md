| 2026-11-04 | TD-07 完成 | 渲染进程崩溃自动重建窗口，主进程异常落盘并在设置页展示 |
| 2026-11-04 | TD-11 完成 | 移除启动自动预热，保留显式“预加载声线” |
| 2026-11-04 | TD-12 完成 | 窗口标题与选中文字开启前需明确确认 |
| 2026-11-04 | TD-02 部分完成 | 新增 decision-bus（优先级/租约/抢占），接入自主动作与场景陪伴；Presence 维持原仲裁 |
| 2026-11-04 | TD-04 完成 | 抽出 gaze.ts（归一化/待机扫视/像素比），9 项单测覆盖 |

# 日奈桌宠技术债与改进清单

> 审计日期：2026-11-04
> 基线版本：Deskpet v1.0.2（工作区当前状态，审计时尚无版本控制）
> 审计范围：`src/`、`tests/`、`content/`、`scripts/`、`packaging/`、`docs/`、本机运行产物
> 状态：P0 已完成；TD-01/04/07/11/12/15 已完成；TD-02 部分完成；TD-14 已缓解

本清单是后续修改的**依据文档**。任何重构、缺陷修复或功能扩展，都应先在此登记对应编号，再在 `DEV_LOG.md` 追加验收记录。编号一经分配不再复用。

## 0. 结论摘要

工程质量明显高于同类个人项目：类型纪律、持久化可靠性、IPC 校验和 AI 侧防御都做得扎实，功能覆盖已达可日用程度。真正的短板不在"能不能跑"，而在三处：

1. **可维护性**：主进程存在 2,617 行的上帝模块，行为决策分散在四套并行机制中。
2. **发布工程**：无版本控制、无 CI、无 lint，签名和分发链路未成形。
3. **证据一致性**：主 e2e 套件运行的不是默认运行模式，验收截图停留在旧版本。

这三类问题现在处置成本低，功能继续堆叠后成本会成倍上升。

## 1. 审计基线与实测数据

以下数据为本机实测，可作为修复前后的对比基线。

| 项目                   | 实测值                                                                    | 备注                                                          |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 源码总行数             | 16,612                                                                    | 主进程 9,074 / 渲染层 5,579 / 共享 1,720 / preload 239        |
| 单元测试               | 30 个文件、163 项全通过                                                   | 共 4,000+ 行；审计后新增 tts-maintenance 8 项                 |
| E2E 测试               | 9 个 spec、19 项                                                          | 共 1,693 行，日志记录 19/19 通过                              |
| 类型逃逸               | `any` / `as any` / `@ts-ignore` 共 0 处                                   | `src` 全量检索                                                |
| 遗留标记               | `TODO` / `FIXME` 共 0 处                                                  | `src` 全量检索                                                |
| `npm run typecheck`    | 通过                                                                      | 无输出即通过                                                  |
| `npm run build`        | 通过                                                                      | 1.21 秒                                                       |
| `npm run format:check` | 通过                                                                      | 审计时为红色，已修正并纳入 `npm run verify`                   |
| 应用版本               | v1.0.2                                                                    | `~/Applications/日奈桌宠.app`                                 |
| 签名状态               | ad-hoc（`codesign -`），arm64 单架构                                      | 无 Developer ID、未公证                                       |
| 工作区体积             | 8.6 GB                                                                    | `dist/` 7.3 GB、`assets/` 785 MB、`node_modules/` 538 MB      |
| 本地 TTS 外部资产      | 11 GB                                                                     | `~/.local/share/deskpet-tts`，不在项目目录内                  |
| 语音缓存               | 137 MB / 406 个文件                                                       | `~/Library/Application Support/Deskpet/tts-cache`，无淘汰机制 |
| TTS 服务日志           | 10,227 行 / 975 KB                                                        | `irodori-server.log`，无轮转                                  |
| 单次合成耗时           | 约 3.6 秒（约 3.7 秒音频）                                                | 来自服务日志实测，仅预生成命中时才有低延迟                    |
| 内容体量               | 13 条行为规则、52 条固定台词、41 条预生成语音、13 段官方语音              | 14 个对白池                                                   |
| 存在前置状态机         | `behavior-engine`、`autonomous-behavior`、`presence-*`、`scene-companion` | 详见 TD-02                                                    |

## 2. 问题总表

| 编号  | 问题                                | 优先级 | 影响面                | 预估工作量            |
| ----- | ----------------------------------- | ------ | --------------------- | --------------------- |
| TD-01 | 主进程上帝模块 `index.ts`           | P1     | 可维护性              | 1.5～2 天             |
| TD-02 | 行为决策四套机制并行                | P1     | 可维护性 / 行为一致性 | 2～3 天               |
| TD-03 | 主 E2E 套件运行 legacy 模式         | P0     | 回归可靠性            | 0.5 天                |
| TD-04 | 渲染层缺少单元测试                  | P1     | 回归可靠性            | 1～1.5 天             |
| TD-05 | 无版本控制、无 CI、无 lint          | P0     | 全部工作的安全网      | 0.5 天                |
| TD-06 | 缓存与日志无界增长                  | P0     | 长期稳定性            | 0.5 天                |
| TD-07 | 缺少崩溃兜底                        | P1     | 稳定性                | 0.5 天                |
| TD-08 | `vrm-renderer` 为不可达分支         | P2     | 维护成本              | 0.25 天               |
| TD-09 | 验收证据已过期                      | P0     | 验收可信度            | 0.5 天                |
| TD-10 | 内容体量偏薄                        | P2     | 产品体验              | 2～5 天（含创作）     |
| TD-11 | 本地 TTS 默认开启且冷启昂贵         | P1     | 首启体验 / 磁盘       | 1 天                  |
| TD-12 | AI 隐私提示不足                     | P1     | 隐私 / 合规感         | 0.5 天                |
| TD-13 | 分发链路未成形                      | P2     | 对外可用性            | 1～2 天（另需证书）   |
| TD-14 | LaunchServices 拒绝 ad-hoc 应用启动 | P1     | 可用性                | 已缓解（LaunchAgent） |
| TD-15 | 设置页是单列长页面                  | P1     | 可用性                | 已完成                |

## 3. 问题详情

### TD-01 主进程上帝模块 `index.ts`

- **状态**：已完成（commit `cbf09be`）
- **优先级**：P1
- **证据**：`src/main/index.ts` 2,617 行、86 个顶层函数、34 个 IPC handler，同时承载窗口、托盘、菜单、AI 装配、Presence 装配、电源策略、显示器、拖拽、自动行走、资源统计。
- **影响**：任何跨模块改动都要在同一文件内跳转；冲突合并风险高；无法单测；`registerIpcHandlers()` 单个函数即覆盖上百行。
- **处置**：按职责拆为 `window/`、`tray/`、`ipc/`、`ai/`、`presence-wiring/`、`power/`、`resources/` 七个模块，`index.ts` 只保留启动编排。
- **完成判据**：`index.ts` ≤ 300 行；每个新模块可被独立导入；`typecheck`、`test`、`e2e` 全绿且行为无变化。

### TD-02 行为决策四套机制并行

- **状态**：部分完成（Presence 已通过 observeDecision 记账；仅剩 legacy 模式退役未做）

- **优先级**：P1（架构层面最值得优先处理的一项）
- **证据**：同一件事"日奈现在该做什么"由四处分别决定：
  1. `src/main/domain/behavior-engine.ts`：JSON 规则匹配，13 条 `content/actions.json` 规则，自带 priority、权重、条件、冷却。
  2. `src/main/autonomous-behavior.ts`：`AutonomousBehaviorScheduler`，固定 5 种自主动作，独立定时器。
  3. `src/main/presence/presence-arbiter.ts` + `presence-controller.ts`（1,454 行）：候选生成、仲裁、预算。
  4. `src/shared/scene-companion.ts`：`SceneCompanion`，场景表现候选，自有关闭条件。
- **影响**：无单一事实来源，冲突靠散落条件兜底；`DESKPET_PRESENCE_MODE` 可在 `legacy` 与 `active` 间切换，说明两套体系至今并存；新增一个互动要同时判断是否与另外三套冲突。
- **处置**：引入统一 `DecisionBus`，所有候选实现同一接口（来源、优先级、冷却、可否打断），由单点仲裁并输出可解释日志。
- **完成判据**：所有出话或出动作的路径只经过 `DecisionBus`；`npm run presence:replay` 可复现同一输入下的同一选择；日志能回答"为什么选 A 不选 B"。

#### legacy 退役评估（2026-11-04）

实测结论：两套系统按模式互斥，不存在同时运行的情况。

- `presence-controller.observeScene()` 在 `legacy` 模式下直接早退，返回“只保留旧调度器”，因此 legacy 模式下 Presence 完全不投递。
- Presence 已覆盖两项关键能力：`autonomous-walk`（走动）与 `scene-companion:*`（场景陪伴台词）。
- 其余 Presence 规则：return-greeting、focus-long/first-milestone、late-night-first、rest-needed、idle-micro-motion。

退役可回收约 860 行（`autonomous-behavior.ts` 140 + `behavior/autonomous.ts` 183 + `scene-companion.ts` 379 + `observer.ts` 场景部分），并消除模式开关。

**但当前不建议直接删除**，原因是存在真实行为差异：

- legacy 调度器会按 12～28 秒的随机间隔播放 `wave` / `stretch` / `look_at_cursor`，属于“无场景触发的自发小动作”。
- Presence 的同类动作挂在 `scene-companion:*` 候选上，需要场景稳定 20 秒等前置条件，触发频率明显更低。
- 直接退役会让角色在日常挂机时显得更“静止”。

建议路径：

1. 先给 Presence 增加一条 `ambient-motion` 候选，复刻随机挥手/伸展的频率与冷却；
2. 达到行为等价后，把 `DESKPET_PRESENCE_MODE=legacy` 降级为 `active` 的别名并打印弃用告警；
3. 再删除上述四个文件与对应 E2E（`m4-smoke` 的自主行为用例、`scene-companion.spec.ts` 的 legacy 用例），预计减少约 860 行。

### TD-03 主 E2E 套件运行 legacy 模式

- **优先级**：P0
- **状态**：已修复（commit `f78f15c`）
- **证据**：`tests/e2e/m4-smoke.spec.ts:21`、`:533`、`:583`、`:609` 均传 `DESKPET_PRESENCE_MODE: 'legacy'`；而 `src/shared/presence.ts:282` 的 `parsePresenceMode` 在未设置时返回 `active`，即用户实际运行的模式。
- **影响**：最大的一套回归（640 行）验证的不是默认路径；默认路径仅由较小的 spec 覆盖，主回归存在盲区。
- **处置**：主套件改用默认 `active`；legacy 保留独立 spec 或显式矩阵，明确其"冻结兼容"地位。
- **完成判据**：主 E2E 在 `active` 下全绿；legacy 的覆盖范围在本文档和 `DEV_LOG.md` 中写明。

### TD-04 渲染层缺少单元测试

- **状态**：已完成（视线归一化、待机扫视与渲染像素比抽为 gaze.ts，新增 9 项单测）

- **优先级**：P1
- **证据**：渲染层 5,579 行，单测仅覆盖 `action-map`、`glb-action-map`、`procedural-motion`、`renderer-csp`；`glb-renderer.ts`（1,010 行）、`renderer/src/main.ts`（1,352 行）、`settings.ts`（1,043 行）无单测。
- **影响**：视线、微动作、窗口包络、缩放换算等纯逻辑只能靠 E2E 间接验证，改一处要跑整条链路，失败定位困难。
- **处置**：把纯数学与状态计算抽成无 DOM 依赖的函数模块（如 `gaze-math`、`micro-motion-state`、`envelope`），逐个补单测；渲染调用本身继续留给 E2E。
- **完成判据**：抽出的纯逻辑模块覆盖率≥80%；`glb-renderer` 中的计算部分不再直接持有 DOM 状态。

### TD-05 无版本控制、无 CI、无 lint

- **优先级**：P0（所有其他工作的前置条件）
- **状态**：已修复（commit `5ae0991`、`913d676`）
- **证据**：项目根目录不存在 `.git`；无 `.github/`；`package.json` 无 `lint` 脚本，质量门禁只有 `prettier` 与 `tsc`。审计时 `npm run format:check` 本身已为红色（`INSTALL_CHECKLIST.md` 表格对齐），说明门禁在无 CI 的情况下不会被持续执行。
- **影响**：改动不可回滚、不可审阅、不可二分定位；多人或多次改动无法归因。
- **处置**：初始化仓库并把当前状态打为基线标签；加入提交前或 CI 门禁：`typecheck` + `test` + `format:check` + `build`。
- **完成判据**：存在 `v1.0.2-baseline` 标签；门禁命令在干净克隆上可一次跑通。

### TD-06 缓存与日志无界增长

- **优先级**：P0
- **状态**：已修复（commit `c19efaa`）
- **证据**：`src/main/domain/local-tts-service.ts:130` 将缓存固定在 `userData/tts-cache`，代码只有写入与临时文件清理，无容量或条目上限；当前已 137 MB / 406 个文件。`irodori-server.log` 已 10,227 行 / 975 KB，无轮转。
- **影响**：长期使用后磁盘占用不可预期；日志无界会拖慢排查并泄露更多历史内容。
- **处置**：缓存加容量上限与 LRU 淘汰（建议 300 MB 或 600 条，先到为准）；日志按大小轮转，保留 5 份、每份 2 MB。
- **完成判据**：写入超过上限后最早条目被淘汰且不影响命中；日志目录稳定在上限附近。

### TD-07 缺少崩溃兜底

- **状态**：已完成（自动重建窗口 + 本地错误日志 + 设置页展示）

- **优先级**：P1
- **证据**：`src/main/index.ts` 中检索 `render-process-gone`、`child-process-gone`、`uncaughtException`、`unhandledRejection` 均为 0 处命中；仅存在 `requestSingleInstanceLock` 与 `before-quit`。
- **影响**：渲染进程崩溃（WebGL 上下文丢失是桌面 3D 常见情形）或未捕获异常时，桌宠可能静默消失，用户只能看到空窗口，且无本地记录可查。
- **处置**：监听 `render-process-gone` 并带退避重建窗口；捕获主进程未处理异常写入本地日志；在设置页暴露"最近一次异常"。
- **完成判据**：手动 kill 渲染进程后窗口自动恢复；异常信息落到本地文件。

### TD-08 `vrm-renderer` 为不可达分支

- **优先级**：P2
- **证据**：`src/renderer/src/main.ts:205` 依据 `assetPath` 是否以 `.glb` 结尾选择 `GLBPetRenderer`，否则落到 `VRMRenderer`；而 `content/character.json` 只有 `2d-placeholder` 与 `3d-glb` 两个渲染器，仓库内唯一 `.vrm` 是 `assets/characters/placeholder/three-vrm-sample.vrm`。
- **影响**：`vrm-renderer.ts`（417 行）与 `@pixiv/three-vrm` 依赖长期零使用、零验证，属并行维护负担。
- **处置**：删除该分支与依赖，或在文档中显式标注为"实验路径、不随版本验证"。
- **完成判据**：仓库中不存在未声明的渲染分支；依赖树减少对应条目。

### TD-09 验收证据已过期

- **优先级**：P0
- **状态**：已修复（`docs/acceptance/README.md` 索引 + `npm run acceptance:capture` 重新取证）；历史迁移包已于 2026-11-04 删除，需要时用 `npm run transfer:bundle` 重新生成
- **证据**：`docs/acceptance/m4-settings.png` 标注 `Deskpet v0.4.0`，文案为"3D VRM 占位""10 条行为规则已加载"；当前已是 v1.0.2、官方 GLB 渲染、13 条规则。`docs/TRANSFER_GUIDE.md` 仍对应 1.0.1 迁移包，而 `dist/` 内迁移包也停留在 1.0.1。
- **影响**：验收截图不能作为当前版本依据，新增判定缺少可信基线；文档与产物版本互相矛盾。
- **处置**：按 1.0.2 重拍全部验收图，文件名与文档标注版本；迁移包要么重新生成并与版本对齐，要么在 README 与本文档中明确其为历史产物。
- **完成判据**：`docs/acceptance/` 中每张图都能对应到当前版本；迁移包版本与应用版本一致或已明确标注为历史。

### TD-10 内容体量偏薄

- **优先级**：P2
- **证据**：固定台词 52 条（14 个池）、预生成语音 41 条、官方语音 13 段、行为规则 13 条。
- **影响**：「活人感」依赖变化度，现有体量在日常使用一到两周后易出现重复感；AI 兜底只能缓解，且默认关闭。
- **处置**：按场景（时段 × 前台类别 × 好感等级）扩充对白与预生成语音，优先补齐高频路径（摸头、拖拽、专注、深夜）。
- **完成判据**：高频互动池各≥20 条；连续 100 次互动内无重复台词。

### TD-11 本地 TTS 默认开启且冷启昂贵

- **状态**：已完成（取消自动预热，仅保留显式预加载）

- **优先级**：P1
- **证据**：`src/main/domain/pet-state.ts:234` 将 `localTtsEnabled` 缺省为 `true`；服务日志实测单次合成约 3.6 秒；模型资产 11 GB 且位于项目目录外。
- **影响**：首次启动即可能拉起重资产服务，影响启动速度与磁盘预期；换机或清理外部目录后功能静默退化。
- **处置**：默认改为关闭，或在首次真正需要合成时才启动并给出可取消的提示；设置页显示模型是否就绪。
- **完成判据**：冷启动不加载 TTS 模型；关闭状态下无相关进程与日志增长；命中预生成时行为不变。

### TD-12 AI 隐私提示不足

- **状态**：已完成（开启敏感读取需二次确认）

- **优先级**：P1
- **证据**：`src/main/domain/ai-context-service.ts:12` 与 `src/main/domain/deepseek-client.ts:14` 对窗口标题限长 160 字符，选中文字限长后进入云端 prompt；设置项默认关闭（`pet-state.ts:250` 起），但界面未对"这段文字将上传"给出显式提示。
- **影响**：用户在开启后可能低估外发内容范围；隐私承诺与实际界面之间缺少闭环。
- **处置**：设置页在开启"读取选中文字"时展示明确说明并要求二次确认；发送前在气泡或设置页给出可感知提示。
- **完成判据**：开启该能力必须经过一次显式确认；`docs/DESKTOP_CONTEXT_AI.md` 与界面文案一致。

### TD-13 分发链路未成形

- **优先级**：P2
- **证据**：`scripts/package-macos-app.zsh:100` 使用 `codesign --force --deep --sign -`（ad-hoc）；产物为 arm64 单架构；README 的启动路径指向本机 `~/Applications`；`dist/` 中迁移包为 1.0.1 且无自动更新机制。
- **影响**：仅限本机自用；换机需绕过 Gatekeeper；无法安全升级。
- **处置**：自行保留现状即可；一旦计划分发，需 Developer ID 签名、公证、`electron-updater` 与版本对齐流程。
- **完成判据**：如决定分发，干净机器可双击安装并通过 Gatekeeper；否则在 README 明确"仅个人本机使用"。

### TD-14 LaunchServices 拒绝 ad-hoc 应用启动

- **优先级**：P1
- **状态**：已缓解（LaunchAgent 方案，见 `docs/MACOS_LAUNCH.md`）
- **证据**：2026-11-04 覆盖安装后实测，`open`／双击启动的进程在 80 毫秒内以退出码 0 结束，主进程 JS 从未执行。系统日志为 `AMFI: libffmpeg.dylib has no CMS blob? → Unrecoverable CT signature issue, bailing out`；崩溃报告为 `Library not loaded: @rpath/Electron Framework.framework/Electron Framework ... different Team IDs`。对照实验：本项目构建、旧 1.0.1 迁移包、未改动的官方 Electron 45 全部无法经 `open` 启动，系统自带计算器正常；同一批产物直接执行二进制均正常。官方 Electron 45 的发行 zip 内不含 `_CodeSignature`，只有 linker 签名。
- **影响**：双击这一最自然的启动方式失效；用户此前能持续使用，是因为进程跨越了系统更新一直未重启。
- **处置**：短期用 `~/Library/LaunchAgents/local.deskpet.launcher.plist` 直接执行二进制，登录自启、`launchctl kickstart` 手动拉起；长期需要 Developer ID 签名 + 公证。
- **完成判据**：在干净机器上双击可启动并通过 Gatekeeper；或确认永久接受 LaunchAgent 方案并在 `docs/MACOS_LAUNCH.md` 固化。

### TD-15 设置页是单列长页面

- **优先级**：P1
- **状态**：已完成
- **证据**：改造前设置页完整高度约 8,762 px（1000 px 宽），九个区块顺序堆叠，需要长时间滚动才能到达 AI 与数据区；E2E 也因此只能依赖“所有控件同页可见”的假设。
- **影响**：常用设置被埋在滚动流里；控件一多就继续变长；测试无法区分分页内外的可见性。
- **处置**：改为顶部标签栏五页结构（形象 / 关系 / 行为 / AI / 数据），同一时刻只渲染一页；AI 事件可自动切换到 AI 页。
- **完成判据**：每页高度不超过约 1,600 px；跨页操作需显式切页；E2E 覆盖切页路径。

## 4. 改进路线

顺序有依赖关系，不建议跳跃执行。

### P0 接手第一周（不改产品行为）

1. **TD-05**：建仓库、打基线、加门禁。
2. **TD-03**：主 E2E 切到 `active`，确认默认路径全绿。
3. **TD-06**：缓存上限与日志轮转。
4. **TD-09**：重拍验收图、对齐迁移包版本。

P0 合计约 2 天。完成后的状态是：**有安全网、有可信回归、有可长期运行的资源边界**。

### P1 结构性改造（决定后续迭代成本）

5. **TD-01** 拆分 `index.ts`（先做，因为 TD-02 要在拆好的模块上落位）。
6. **TD-02** 统一 `DecisionBus`。
7. **TD-04** 抽取渲染层纯逻辑并补单测。
8. **TD-07** 崩溃兜底。
9. **TD-11** TTS 默认值与冷启策略。
10. **TD-12** 隐私提示与二次确认。

P1 合计约 5～7 天，建议每完成一项单独发一个补丁版本。

### P2 产品层（需要先做决策）

11. **TD-10** 内容扩充（依赖内容创作，不依赖工程排期）。
12. **TD-08** 渲染分支清理。
13. **TD-13** 分发链路（仅在决定对外时启动）。

## 5. 修复验收方式

任何一项的完成，都必须同时满足：

1. `npm run typecheck`、`npm run format:check`、`npm test`、`npm run build` 全部通过。
2. 涉及运行时的改动，`npm run test:e2e` 在 `active` 模式下通过。
3. 在 `DEV_LOG.md` 追加记录，包含时间、编号、改动、验证方式与结果、遗留问题。
4. 涉及界面的改动，更新对应验收截图并标注版本。

## 6. 明确不做的事

为控制范围，以下方向已评估并暂缓，除非另行决策：

- 不引入前端框架重写设置页（现有原生 DOM 可维护）。
- 不做 Windows / Linux 支持。
- 不接入任何遥测或崩溃上报服务（维持纯本地）。
- 不为 2D 渲染引入 Spine / Live2D 运行时，直到美术方案确定（见 `IMPLEMENTATION_PLAN.md` 第 17 节）。

## 7. 变更记录

| 日期       | 变更             | 说明                                                                            |
| ---------- | ---------------- | ------------------------------------------------------------------------------- |
| 2026-11-04 | 初版             | 接手前审计，建立 TD-01～TD-13 基线                                              |
| 2026-11-04 | TD-05 完成       | git 基线 `5ae0991` + 标签 `v1.0.2-baseline`；新增 `npm run verify`（`913d676`） |
| 2026-11-04 | TD-03 完成       | 主 E2E 改跑 `active`；修复拖拽托起被 Presence 演出打断（`f78f15c`）             |
| 2026-11-04 | TD-06 完成       | 缓存 300 MB / 600 条上限，日志 2 MB × 5 份轮转，新增 8 项单测（`c19efaa`）      |
| 2026-11-04 | TD-09 完成       | 新增 v1.0.2 验收截图与 `docs/acceptance/README.md` 索引，迁移包标注为历史       |
| 2026-11-04 | TD-14 记录并缓解 | 发现 macOS 27 拒绝 ad-hoc 应用经 LaunchServices 启动，改用 LaunchAgent          |
| 2026-11-04 | TD-01 完成       | index.ts 2,617 → 115 行，拆为 17 个模块（`cbf09be`）                            |
| 2026-11-04 | TD-15 完成       | 设置页改为五页标签结构，E2E 覆盖切页路径                                        |
