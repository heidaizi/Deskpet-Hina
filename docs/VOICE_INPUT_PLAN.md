# 语音输入方案调研

> 状态：设计稿，尚未实现。目标是先确定技术路线，再分阶段落地。

## 1. 需求与约束

- 主要语言：中文；次要语言：日语（角色语气、术语）
- 交互要快：说完到出字 < 1.5 秒（短句）
- 隐私优先：默认本地识别，音频不落盘、不上传
- 不引入重型 Python 运行时（AivisSpeech 已经是外部引擎，ASR 不应再叠加一套）
- 与现有聊天、TTS、桌宠状态、权限体系一致
- 平台：macOS 13+，Apple Silicon 优先

## 2. 候选方案

| 方案                                 | 中/日文 | 延迟  | 体积/依赖                  | 隐私     | 工程成本   |
| ------------------------------------ | ------- | ----- | -------------------------- | -------- | ---------- |
| whisper.cpp（Metal）                 | 好      | 低-中 | 模型 150–500MB，C++ 二进制 | 本地     | 中         |
| Apple Speech（SFSpeechRecognizer）   | 好      | 低    | 无模型，需原生桥接         | 本地     | 中-高      |
| transformers.js Whisper ONNX         | 中      | 中-高 | 复用现有 transformers/ORT  | 本地     | 低（原型） |
| faster-whisper（Python）             | 好      | 低    | 需 Python 环境             | 本地     | 高（分发） |
| 云端 ASR（OpenAI/Deepgram/Azure 等） | 最好    | 中    | 新 API Key + 网络          | 上传音频 | 低         |

### 结论

- **默认推荐 whisper.cpp（small 量化 + Metal）**：模型体积可接受、中文/日文稳定、可完全离线、能打包成独立二进制。
- **Apple Speech 作为备选**：零模型下载、系统级低延迟，但需要写 Swift/ObjC 原生桥，且术语偏置、离线可用性受系统限制。
- **transformers.js 只用于技术验证**：复用现有依赖最快，但 Node 端推理速度和内存不如 whisper.cpp，不建议作为最终形态。
- **云端只做可选开关**：适合低配机器或高精度需求，但必须明确告知音频会上传。

## 3. 推荐交互

### 3.1 两个入口

1. **聊天框内按住说话**
   - 鼠标按住麦克风按钮开始，松开结束
   - 不依赖系统快捷键，最容易做对
2. **全局快捷键（切换式）**
   - 默认 `⌥ Space`：按一次开始，再按一次结束
   - **不做按住说话**：Electron 的 `globalShortcut` 只有按下事件，没有松开事件；按住需要 native event tap + 辅助功能权限，成本和风险都高

### 3.2 状态机

```
空闲 → 聆听中（波形 + 音量） → 识别中（转圈） → 文本预览 → 发送
                ↓ Esc / 再按快捷键
              取消
```

- 识别结果**先放进输入框**，可编辑，不自动发送（设置里可开自动发送）
- 最长录音 60 秒；静音 1.5–2 秒自动结束
- 聆听时桌宠气泡显示「……在听。」，并暂停随机语音/TTS
- TTS 正在播放时不启动录音，避免把日奈自己的声音录进去

## 4. 技术架构

```
Chat Renderer
  getUserMedia → AudioWorklet → 48k 重采样 16k 单声道 → Int16 PCM
        ↓ IPC（分片或结束时整段）
Main AsrService
  静音检测（VAD）→ whisper.cpp（常驻进程 / server 模式）
        ↓
  文本后处理（术语偏置、标点、空白）
        ↓
  IPC → 聊天输入框预览
```

### 4.1 音频采集

- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`
- 用 AudioWorklet，不用已废弃的 ScriptProcessor
- 统一转成 **16kHz 单声道 PCM16**，whisper.cpp 直接支持；不要引入 ffmpeg
- 保留 300ms 预录，避免第一个字被切掉
- 60 秒 16k 单声道约 1.9MB，内存压力可忽略

### 4.2 识别引擎

**whisper.cpp**

- 以本地 server 形式常驻（如 `127.0.0.1:10102`），模型只加载一次；避免每次启动 CLI 的冷启动
- 模型建议 `small` 量化（约 180–250MB）；低配可退 `base`，高配可上 `medium`
- 语言先自动检测，设置里允许固定「中文 / 日语 / 自动」
- 用 `initial_prompt` 注入术语：`日奈、老师、格黑娜、风纪委员会、空崎日奈`
- 音频以 16k WAV 临时内存文件传入，识别后立即删除

**Apple Speech（备选）**

- Swift 小工具：stdin 收 PCM，stdout 输出 JSON；`SFSpeechRecognizer(locale:)` + `requiresOnDeviceRecognition`
- 需要 `NSSpeechRecognitionUsageDescription` 与语音识别授权
- 优点：无模型下载；缺点：原生桥接 + 系统可用性差异

### 4.3 流式与延迟

- 第一版：**整段识别**（松手后一次返回），实现简单、准确率最高
- 第二版：每 2–3 秒切块 + 重叠，返回临时结果，用于「边说边出字」
- whisper 本身不是流式模型，分块会有断句问题；第一版不做

## 5. 权限与分发

| 项               | 处理                                                                |
| ---------------- | ------------------------------------------------------------------- |
| 麦克风描述       | 当前包内是 Electron 默认英文文案，需改成中文并在打包脚本注入        |
| 麦克风授权       | `systemPreferences.askForMediaAccess('microphone')`，设置页提供跳转 |
| 语音识别权限     | 仅 Apple Speech 方案需要，加 `NSSpeechRecognitionUsageDescription`  |
| 沙盒 entitlement | 当前未启用 App Sandbox，无需 `audio-input`；若以后上架需补          |
| 模型分发         | 首次使用时下载，或安装包内置 small；下载失败要能降级到 Apple/云端   |
| 二进制签名       | whisper.cpp 需 universal（arm64 + x64）或仅 arm64，随包签名         |

## 6. 与现有系统集成

- 新增 `AsrService`（主进程），与 `LocalTtsService` 平级
- IPC：
  - `asr:start` / `asr:audio` / `asr:stop` / `asr:cancel`
  - 事件：`asr:partial` / `asr:final` / `asr:error` / `asr:level`
- 聊天窗：麦克风按钮、录音状态、文本预览；复用现有 `sendChatMessage`
- 桌宠：聆听状态、音量波形；录音时暂停随机语音和 TTS
- 设置 → 语音输入：
  - 开关、快捷键、语言、自动发送、云端开关
  - 输入设备选择（`enumerateDevices`）
  - 麦克风权限状态与「打开系统设置」
- 术语表：复用 `content/glossary.json` 生成 `initial_prompt`

## 7. 文本后处理

- 去掉语气填充词（えっと、あの、那个、就是）
- 日语结果：显示原文，可选翻译成中文再发送；中文结果直接进输入框
- 专有名词按术语表纠正（日奈、老师、风纪委员会）
- 空结果/纯噪声：提示「没听清」，不发送

## 8. 性能目标（M1，small-q5）

| 指标             | 目标                         |
| ---------------- | ---------------------------- |
| 5 秒语音识别耗时 | < 800ms                      |
| 冷启动到可识别   | < 3s（常驻进程可到 < 500ms） |
| 常驻内存         | < 800MB                      |
| 空闲 CPU         | 0                            |
| 识别准确率       | 安静环境常用句 > 90%         |

这些数字需要用真实录音基准验证，不能只看模型参数。

## 9. 分阶段计划

### Phase 0：技术验证（1–2 天）

- 录 20 条样本：中文日常、日语、混合、含术语
- 对比 whisper.cpp small / transformers.js base / Apple Speech
- 记录：耗时、内存、准确率、断句、幻觉
- 产出：选型结论 + 是否值得继续

### Phase 1：聊天窗按住说话（3–4 天）

- 麦克风权限 + 录音 + VAD + whisper.cpp 整段识别
- 文本预览，不自动发送
- 基础错误处理

### Phase 2：全局快捷键 + 桌宠状态（2–3 天）

- 切换式快捷键
- 聆听 HUD、波形、暂停 TTS、气泡提示
- 设置页与设备选择

### Phase 3：可选增强

- 流式临时结果
- Apple Speech 降级
- 云端高精度模式
- 日语自动翻译

## 10. 风险与待确认

1. **Electron 全局快捷键没有 keyup**：按住说话只能做在聊天窗内，全局用切换式。
2. **whisper 静音幻觉**：必须做 VAD + 最小时长 + no-speech 阈值。
3. **TCC 权限重置**：重装/换签名后需重新授权，要有引导。
4. **中英日混合与术语**：需要 `initial_prompt` + 真实样本测试。
5. **模型下载体积**：首次下载几百 MB，需要进度和失败降级。
6. **回声**：外放时可能录到 TTS，录音期间必须暂停播放或加耳机提示。
7. **隐私承诺**：默认不保存音频；云端模式必须显式开关与提示。

## 11. 建议

先做 **Phase 0 基准验证**，确认 whisper.cpp small 在本机的中文准确率和延迟，再决定是否值得投入 Phase 1。

如果目标是「尽快可用、少下载」，Apple Speech 可以先做一个原型对比；如果目标是「长期稳定、可离线、可分发」，whisper.cpp 更合适。
