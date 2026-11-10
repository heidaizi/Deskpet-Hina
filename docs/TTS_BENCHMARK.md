# TTS 选型基准

> 日期：2026-11-05
> 目的：对比 Irodori-TTS 与候选引擎（AivisSpeech）的首包延迟与整句耗时。

## 1. 方法

- 测试集：`scripts/tts-bench-sentences.json`，20 句，四类各 5 句：
  - `short`：5～11 字，日常短句；
  - `medium`：26～33 字，一般对白；
  - `long`：44～56 字，长回复；
  - `emotion`：16～28 字，带情绪语气。
- 指标：
  - **首包**：请求发出到第一块可播放音频；
  - **总耗时**：请求发出到全部音频返回；
  - **RTF**：总耗时 / 音频时长（<1 表示快于实时）。
- 工具：`node scripts/bench-tts.mjs [--stream] [--steps N] [--repeat N]`。
- 环境：本机 M 系列、服务已预热、24 步采样、降噪开启。

## 2. Irodori 基线（2026-11-05 实测）

```text
short    首包 2458ms  总 2458ms
medium   首包 3241ms  总 5411ms
long     首包 3298ms  总 9362ms
emotion  首包 2941ms  总 5062ms
```

逐句 RTF 在 0.39～0.58 之间，说明 Irodori **本身快于实时**；
短句的延迟主要来自固定开销（模型调度、编解码、HTTP），而不是采样步数。

结论：短句仍有约 2.2～3.1 秒首包，长句首包 2.5～3.7 秒、总耗时 8.5～10 秒。

## 3. AivisSpeech 验证计划（当前受阻）

预期做法：

1. 下载 `AivisSpeech-Engine-macOS-arm64`（约 194 MB）或完整应用包（约 350 MB）；
2. 以 `--port 10101` 启动引擎，确认 `/speakers` 返回可用模型；
3. 用同一 20 句跑基准；
4. 记录首包、总耗时与主观日语自然度。

**当前阻塞**：本机无法访问 GitHub Releases 与 Hugging Face（`curl` 返回 000），
npm 镜像可用但 AivisSpeech 不走 npm 分发。

解除阻塞的三种方式：

1. 在本机开通可访问 GitHub 的网络（代理 / VPN），我可以直接下载并跑完；
2. 你手动下载 `AivisSpeech-macOS-arm64-1.0.0.zip`（350 MB）放到
   `~/Library/Deskpet/vendor/`，我负责解压、启动与基准；
3. 若只需要引擎：下载 `AivisSpeech-Engine-macOS-arm64-1.2.0.7z.001` 及后续分卷。

## 4. 对比时需要注意

- AivisSpeech 使用 **VOICEVOX 兼容 API**（`/audio_query` + `/synthesis`），
  与 OpenAI 兼容格式不同，基准工具需要一个小适配器；接口顺序是
  「先取 query，再合成」，因此首包测量口径要额外记录 query 的往返。
- AivisSpeech 的日语自然度依赖具体 AIVM 模型；官方模型与自训 Hina 模型
  的表现要分开测。
- 自训 Hina 声线不在本轮范围内，需要先完成训练流程。

## 5. 复现命令

```bash
# Irodori：非流式
node scripts/bench-tts.mjs --steps 24

# Irodori：流式（服务端切句）
node scripts/bench-tts.mjs --stream --steps 24

# 指定其它 OpenAI 兼容端点
TTS_ENDPOINT=http://127.0.0.1:10101/v1/audio/speech TTS_VOICE=... node scripts/bench-tts.mjs
```

## 6. AivisSpeech 实测（2026-11-05）

环境：AivisSpeech 1.0.0 macOS arm64，内置模型「まお」，CPU 推理（`--use_gpu` 提示不可用，自动回落），
API 为 VOICEVOX 兼容（`/audio_query` + `/synthesis`）。

### 分类对比（首包 / 总耗时）

| 分类    | Irodori（流式首包） | AivisSpeech（整句） | 提升 |
| ------- | ------------------- | ------------------- | ---- |
| short   | 2458 ms             | **670 ms**          | 3.7× |
| medium  | 3241 ms             | **1205 ms**         | 2.7× |
| long    | 3298 ms             | **2029 ms**         | 1.6× |
| emotion | 2941 ms             | **1013 ms**         | 2.9× |

> AivisSpeech 的 `/synthesis` 返回整块 WAV，不支持流式；但它的整句耗时已经低于
> Irodori 的首块延迟，配合项目已有的句级切分与流水线合成即可获得同等体验。

### 逐句细节

- `audio_query` 往返仅 18～60 ms，可忽略；
- 合成 RTF 约 0.22～0.26（Irodori 为 0.39～0.58）；
- 音频时长与 Irodori 接近（同为 24kHz 单声道），不存在"缩短音频换速度"。

### 情绪风格

内置模型提供 6 种预设风格：ノーマル / ふつー / あまあま / おちつき / からかい / せつなめ。
同一句切换风格会明显改变语气与节奏，可作为情绪引擎的映射目标。

试听样音：

```text
docs/acceptance/tts-aivis/normal-short.wav    ノーマル
docs/acceptance/tts-aivis/amai-short.wav      あまあま
docs/acceptance/tts-aivis/karakai-medium.wav  からかい
```

### 结论

- **速度**：AivisSpeech 全面优于 Irodori，短句差距最大（3.7 倍）。
- **质量**：日语自然度需人工听感确认（样音已生成）；情绪风格是显式参数，优于自然语言描述。
- **缺口**：没有空崎日奈的 AIVM 模型，需要自训才能保持角色声线。
- **集成**：VOICEVOX API 与现有 OpenAI 兼容层不同，需要一层适配器
  （`audio_query` → `synthesis`），流式管线可继续复用"句级切分 + 流水线"。

## 7. 路线对比：Style-Bert-VITS2（AIVM） vs GPT-SoVITS

| 维度                | SBV2 → AIVM               | GPT-SoVITS                              |
| ------------------- | ------------------------- | --------------------------------------- |
| 与 AivisSpeech 集成 | ✅ 原生（.aivmx）         | ❌ 不兼容，需自建推理服务               |
| 情绪控制            | ✅ style 向量（显式参数） | ⚠️ 靠参考音频，无显式风格参数           |
| 音色稳定性          | 中（依赖数据量）          | 中偏上（参考音频影响很大）              |
| 推理延迟            | 实测短句 569ms            | 多一段 GPT 自回归，通常更慢，需实测     |
| 数据需求            | 约 30 分钟起步            | 约 20 分钟可用，约 2 小时才"像"         |
| 日语自然度          | 高                        | 高，但读音错误需 OpenJTalk 用户词典修正 |
| 训练速度（3080 Ti） | 100 epoch ≈ 1 小时        | 微调约 1～2 小时                        |
| 生态与文档          | 日文文档完善              | 中英日社区庞大                          |

### 关键判断

1. **数据量是共同瓶颈**：公开语料上限约 33 分钟，
   两个模型都处在"能用但不够像"的区间。换模型不会改变这一点。
2. **GPT-SoVITS 的参考音频比模型本身更影响音色**，
   这给了低成本试验空间：零样本合成只需几秒参考音频，不必先训练。
3. **情绪控制是分水岭**：桌宠需要按情绪切换语气，
   SBV2 的 style 向量可以直接映射；GPT-SoVITS 只能切换参考音频，
   实现上更笨重，也更容易出现音色漂移。

### 建议的验证顺序

1. **零样本试听**（不训练）：用 3～5 秒干净参考音，合成 4 句测试语；
   若音色明显更接近，再考虑投入训练。
2. **微调对比**：同一批 244 条数据训 GPT-SoVITS，生成同样 4 句，
   与 SBV2 版本盲听对比。
3. 只有 GPT-SoVITS 在音色上明显胜出，才值得放弃 AIVM 集成方案。
