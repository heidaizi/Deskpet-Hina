# macOS 本地 TTS

> 更新日期：2026-10-24  
> 状态：Irodori-TTS 日奈声线主路径已接入，系统 `say` 保留为回退

## 1. 运行时优先级

桌宠对白按以下顺序获取语音：

```text
已有官方日语 WAV（由原始 OGG 降噪派生）
    ↓ 没有官方语音
固定中文对白的预生成日奈 WAV
    ↓ 没有预生成语音
Irodori-TTS Speaker Inversion（日奈声线）→ 温和降噪
    ↓ 启动等待 12 秒后仍失败
macOS say（Kyoko / Tingting）
```

官方语音始终优先，不会被本地生成语音覆盖。现有 40 条固定中文对白和 1 条 AI 等待应答已经预生成并随应用打包，命中时不会启动 Irodori 服务；只有 DeepSeek 新生成等未知台词才走动态 TTS。当前官方播放资源已转为预先降噪的 WAV；Irodori 新生成的 WAV 在写入缓存前也会经过同一降噪链。

降噪固定参数：

```text
prop_decrease=0.45, high-pass=55 Hz, low-pass=14 kHz, peak=-1 dBFS
```

对应脚本为 `scripts/denoise-hina-audio.py`，依赖 Irodori Python 环境中的 `noisereduce`。如果降噪进程失败，应用会回退到原始合成 WAV，不会阻断语音。

## 2. 声线模型

当前使用：

- 模型：`Irodori-TTS-v4.1-Small`
- 适配方法：Speaker Inversion
- 可训练声线参数：16 个 speaker token
- 训练数据：用户已授权使用的常态、泳装、礼服日奈官方日语片段，共 241 段、约 22 分 56 秒
- 声线检查点：run3 多形态 `checkpoint_0000450.speaker.safetensors`
- 情绪适配：caption 交叉注意力 LoRA 275 步
- LoRA 路径：`~/.local/share/deskpet-tts/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275`
- 运行设备：Apple Silicon MPS，`fp32`

模型和检查点保存在项目之外：

```text
~/.local/share/deskpet-tts/models/Irodori-TTS-v4.1-Small/model.safetensors
~/.local/share/deskpet-tts/models/Semantic-DACVAE-Japanese-32dim/weights.pth
~/.local/share/deskpet-tts/models/modernbert-ja-tokenizer/
~/.local/share/deskpet-tts/outputs/hina-speaker-inversion-run3-multiform-emotion/checkpoint_0000450.speaker.safetensors
~/.local/share/deskpet-tts/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275/
```

模型资产合计约 3.5 GB。它们不进入项目仓库，也不复制进公开分发包。

## 3. 训练素材与授权边界

训练素材来源、原始下载 URL、时长和 SHA-256 位于：

```text
assets/characters/hina-swimsuit/private/audio/training/hina-training-expanded.json
```

原始 OGG 与训练转写保留在：

```text
assets/characters/hina-swimsuit/private/audio/training/source-expanded/
assets/characters/hina-swimsuit/private/audio/training/hina-training-expanded.json
```

`assets/characters/**/private/` 已被 `.gitignore` 排除。用户已声明获得这些片段的本地训练授权；这些素材、训练后的声线检查点和生成音频仅用于本机私有桌宠，不应公开分发、上传或用于第三方服务。

## 4. 准备环境

本地训练和推理使用独立 Python 环境：

```text
~/.local/share/deskpet-tts/Irodori-TTS/.venv
```

当前关键版本：

```text
Python 3.12.14
PyTorch 2.10.0
MPS 可用
Transformers 5.12.1
FastAPI 0.129.2
noisereduce 3.0.3
```

音频后期依赖可用以下命令补齐：

```bash
uv pip install \
  --python ~/.local/share/deskpet-tts/Irodori-TTS/.venv/bin/python \
  noisereduce
```

下载并校验主模型与声码器：

```bash
npm run tts:download-models
```

获取 80 段带日文文本的泳装日奈语音，筛除不足 0.8 秒的片段后保留 79 段：

```bash
npm run tts:fetch-hina-expanded
npm run tts:prepare-hina-expanded
```

输出目录：

```text
~/.local/share/deskpet-tts/data/hina-expanded/dataset/
~/.local/share/deskpet-tts/data/hina-expanded/latents/
~/.local/share/deskpet-tts/data/hina-expanded/hina-expanded_manifest.jsonl
```

## 5. 声线训练

训练实现位于项目外的本地 Irodori 工具链：

```text
~/.local/share/deskpet-tts/Irodori-TTS/
```

本轮使用的训练入口：

```bash
cd ~/.local/share/deskpet-tts/Irodori-TTS
uv run --python 3.12 --no-sync python train.py \
  --config configs/train_hina_mps.yaml \
  --manifest ~/.local/share/deskpet-tts/data/hina-expanded/hina-expanded_manifest.jsonl \
  --init-checkpoint ~/.local/share/deskpet-tts/models/Irodori-TTS-v4.1-Small/model.safetensors \
  --speaker-inversion-init-embedding ~/.local/share/deskpet-tts/outputs/hina-speaker-inversion-run1/checkpoint_0000225.speaker.safetensors \
  --output-dir ~/.local/share/deskpet-tts/outputs/hina-speaker-inversion-run2-expanded \
  --device mps \
  --precision fp32 \
  --max-steps 300 \
  --save-every 25 \
  --log-every 10 \
  --batch-size 1 \
  --num-workers 0 \
  --gradient-checkpointing
```

训练过程每 25 步保存一个 `.speaker.safetensors` 检查点。run3 从泳装 run2-300 热启动，在三形态 221 行平衡 manifest 上训练 450 步；生产组合采用 run3-450 声线，并叠加 caption LoRA 275。单个声线检查点只有约 48 KB，但推理时仍需要加载完整的 2.9 GB 基础模型和 410 MB 声码器。

如果要重新训练并更换声线：

1. 更新检查点文件。
2. 更新 `~/.local/share/deskpet-tts/voices/hina/hina-swimsuit.speaker.safetensors` 软链接。
3. 如有情绪 LoRA，同步修改 `content/tts-ja.json` 的 `loraAdapter`。
4. 同步修改 `content/tts-ja.json` 的 `modelRevision`。
5. 删除或保留旧缓存，重启桌宠。

`modelRevision` 会进入缓存键，避免切换到新检查点后继续播放旧声线缓存。

## 6. 启动与生命周期

Irodori OpenAI-compatible 服务由桌宠按需启动：

```bash
zsh scripts/start-hina-irodori-server.zsh
```

服务只监听本机回环地址：

```text
127.0.0.1:8788
```

启动脚本会：

- 检查 Python 环境和声线检查点。
- 将当前检查点链接为 `hina-swimsuit.speaker.safetensors`。
- 强制 Hugging Face 离线模式，避免运行时下载。
- 使用 MPS、`fp32`、单并发和预加载。
- 使用 Sway sampling、independent CFG、24 步采样和逐句日文情绪 caption。
- 将 speaker K/V 条件设为 1.2，在声线贴合度与稳定性之间取折中。

服务日志：

```text
~/Library/Application Support/Deskpet/irodori-server.log
```

手动检查：

```bash
curl http://127.0.0.1:8788/health
```

只有 `health.runtime.loaded` 为 `true` 时，桌宠才会把 Irodori 标记为就绪。服务首次启动时，语音请求最多等待 12 秒，避免模型仍在加载时错误播放系统声音。

运行时状态：

- `unloaded`：Irodori 未加载，这是应用正常启动后的默认状态。
- `starting`：正在启动服务并加载模型。
- `ready`：模型已加载，可以合成语音。
- `suspended`：睡眠或锁屏期间已释放模型。
- `disabled`：用户关闭本地 TTS。
- `error`：启动失败，状态面板会显示最近错误。

资源策略：

- 应用启动和重新开启 TTS 开关都不会自动加载 3 GB 模型。
- 首次需要未缓存的本地语音，或用户点击“预加载声线”时才启动服务。
- 所需 WAV 已存在时直接读取缓存，不启动模型。
- 连续 5 分钟没有语音请求后自动释放模型。
- 关闭 TTS、睡眠、锁屏、退出应用时立即发送 `SIGTERM`；4 秒仍未退出时再发送 `SIGKILL`。
- 唤醒和解锁后保持在 `unloaded`，不会立即重新占用内存；下一条语音再懒加载。
- 设置页每 2.5 秒显示声线状态、TTS 内存、Electron 内存/CPU、缓存及日志大小。

## 7. 生成一条测试语音

```bash
curl http://127.0.0.1:8788/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "irodori-tts",
    "input": "先生、今日もお疲れさま。",
    "voice": "hina-swimsuit",
    "response_format": "wav",
    "irodori": {
      "caption": "落ち着いた低めの女性話者。先生に対して、少し気だるげで親しみのある話し方。"
    }
  }' \
  --output /tmp/hina-test.wav
```

## 8. 日文朗读稿

`content/tts-ja.json` 将项目自写的中文对白映射为日语朗读稿。官方日语对白继续使用原始 OGG；自定义对白先查日文映射，再送入 Irodori。

当前每个需要本地 TTS 的对白都必须有日文映射。单元测试会检查新增对白是否遗漏映射。

这些日文不是运行时机器翻译。运行时不会调用翻译 API，而是由人工整理的固定日文朗读稿。整理时参照官方日奈台词的以下特征：

- 第一人称使用「私」，称呼老师使用「先生」。
- 句尾偏向「〜でしょ」「〜から」「〜ないで」「〜とは言ってない」等简短口语。
- 不使用中文词直接混写，例如“光环”朗读稿使用「ヘイロー」。
- 避免生硬直译，优先使用符合日奈克制、疲惫、略带疏离和偶尔迟疑语气的中文语义对应表达。

配置 Schema 2 为每条对白提供：

- `emotion`：平静、疲惫、恼火、凛然、怀疑、害羞、勉强、警告、冷淡等情绪。
- `durationScale`：逐句调整预测时长，短促反驳略快，迟疑和疲惫语句略慢。
- 确定性 seed：由模型版本、日文文本和 caption 生成，避免同一句每次重新生成时质量随机波动。
- 动态 AI 台词默认 24 步采样：相对 32 步显著降低 MPS 推理时间，同时保持声线嵌入接近参考输出。

情绪 seed 变体：

- `defaultSeedVariants` 设置没有专门配置时的变体数量。
- `emotionSeedVariants` 为每种情绪设置 3～4 个确定性 seed 变体。
- 单条对白也可通过 `seedVariants` 覆盖，或通过固定 `seed` 完全锁定演绎。
- 不同台词根据文本哈希选择不同的起始变体；同一句重复播放时轮换到下一变体。
- 每个变体单独缓存，不会因为轮换而重复进行神经网络推理。

## 9. 缓存

缓存目录：

```text
~/Library/Application Support/Deskpet/tts-cache/
```

Irodori 缓存键由以下内容生成 SHA-256：

- 引擎标识
- 声线 ID
- 声线模型 revision
- 风格 caption
- 完整日文朗读稿

同一句话只生成一次。系统 `say` 回退缓存还会包含音色和语速。

动态 AI 日文回复会按日文标点和短句拆成多个朗读段。第一段完成合成后立即开始播放，后续段在当前音频播放期间继续生成。各段复用同一个确定性 seed，并逐段进入相同缓存；重复请求可直接读取缓存。

渲染器不会在内存中缓存系统 `say` 回退结果。即使一次请求因服务故障使用了回退，Irodori 恢复后再次触发同一句话仍会重新请求日奈声线。

可通过页面诊断属性确认实际来源：

```text
body[data-last-voice-source]
body[data-last-local-tts-source]
body[data-tts-stream-chunks]
body[data-tts-first-chunk-ms]
```

可能值为：

- `official`
- `irodori-tts`
- `macos-say`

文件格式也可用于快速区分：Irodori 输出为 48 kHz WAV，系统 `say` 回退为 22.05 kHz WAV。

## 10. 测试隔离与开关

E2E 测试会设置 `DESKPET_E2E=1`，阻止预加载和 Irodori 启动，并让本地 TTS 走系统 `say` 回退。

默认启动不会预加载模型。如果确实希望应用一启动就加载 Irodori，可以显式开启：

```bash
DESKPET_IRODORI_PREWARM=1 npm run dev
```

设置页“本地 TTS 补全”关闭后：

- 官方语音仍正常播放。
- 没有官方语音的对白只显示文字。
- 正在播放的本地语音会停止，Irodori 子进程立即释放。

## 11. 当前限制

- 训练数据为 241 段、约 22 分 56 秒；稀有情绪唯一样本仍然偏少。
- Speaker Inversion 只学习声线条件；情绪由 caption LoRA 275 和逐句 caption 共同控制，长句与读音仍可能波动。
- 首次按需启动需要加载约 3.5 GB 模型，冷启动明显慢于系统 `say`；加载完成后会在空闲 5 分钟后释放。
- MPS 推理速度和内存占用取决于当前 Mac；服务固定为单并发以避免争抢显存。
- 流式分段降低的是“首段开始播放”的等待，不会改变整段文本的总推理成本；极长回复仍会让后续音频等待。
- 官方语音的版权与训练授权不等同于再分发授权。

## 12. 故障排查

如果仍听到 Tingting 或 Kyoko：

1. 检查 `irodori-server.log`。
2. 请求 `/health`，确认 `runtime.loaded`。
3. 检查 `hina-swimsuit.speaker.safetensors` 软链接是否存在。
4. 检查 `content/tts-ja.json` 是否包含该对白。
5. 确认设置页“本地 TTS 补全”已开启。

如果更换检查点后仍听到旧声音：

1. 更新 `modelRevision`。
2. 删除 `~/Library/Application Support/Deskpet/tts-cache/` 中对应旧 WAV。
3. 重启桌宠。
