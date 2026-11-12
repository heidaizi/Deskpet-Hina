# 语音链路

## 从回复到播放

```
DeepSeek 回复
  → spokenText（日文，去除开头省略号等）
  → 预生成音频查找（按文本索引）
  → 没有则实时合成
  → 渲染进程播放（EQ + 音量）
```

## 引擎与模型

| 项       | 约定                                                              |
| -------- | ----------------------------------------------------------------- |
| 引擎     | AivisSpeech Engine，默认 `127.0.0.1:10101`                        |
| 引擎目录 | `~/Library/Deskpet/engine/run`                                    |
| 模型目录 | `~/Library/Application Support/AivisSpeech-Engine/Models/*.aivmx` |
| 模型命名 | speaker 优先 `hina`，样式建议 `neutral` / `soft` / `annoyed`      |

应用启动时自动拉起引擎，约 10 秒就绪；之后每 10 分钟探活一次，
失联会重启。合成前若发现引擎不可用也会先尝试拉起。

## 降级顺序

1. 预生成音频（存在且文本匹配）
2. AivisSpeech 实时合成
3. macOS `say`（没有模型/引擎时）

流式播放仅用于旧引擎（Irodori）；AivisSpeech 采用整段合成，避免句间断开。

## 音色与音量

- 合成后经过 WebAudio：70Hz 高通 + 3kHz 高频搁架 +3.5dB；
- 官方语音与合成语音分别设播放增益，保证切换时响度一致；
- 关系阶段会影响对话语气（阶段 3 起才允许 `soft`）。

## 各服装官方语音

日常互动和问候会优先使用当前服装的官方片段：

```
private/audio/outfit/<swimsuit|dress|normal>/*.ogg
```

- 有对应片段 → 播放官方原声，气泡显示该服装的中文翻译；
- 没有对应片段 → 该场景改用 TTS（同一 AIVMX），不借用其他服装的声音；
- 场景陪伴（idle 对白）没有对应片段时会直接跳过该表演。

## 训练自己的模型

见 [VOICE_TRAINING.md](VOICE_TRAINING.md)。仓库不包含模型文件，
模型放入引擎目录即可使用。
