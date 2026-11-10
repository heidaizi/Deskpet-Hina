# 空崎日奈多形态情绪声线训练

> 更新日期：2026-10-24  
> 范围：常态、泳装、礼服三套官方语音  
> 用途：仅限本机私人桌宠声线训练

## 1. 语料来源

```text
https://bluearchive.wiki/wiki/Hina/audio
https://bluearchive.wiki/wiki/Hina_(Swimsuit)/audio
https://bluearchive.wiki/wiki/Hina_(Dress)/audio
```

| 形态 | 有效条数 |
| ---- | -------: |
| 常态 |       75 |
| 泳装 |       79 |
| 礼服 |       87 |

- 原始去重音频：244 条。
- 剔除不足 0.8 秒的语气片段：3 条。
- 有效训练音频：241 条。
- 总时长：约 22 分 56 秒。
- 所有音频均转为 48 kHz、单声道、16-bit PCM。
- 音频质检未发现异常采样率、严重削波或低于 -40 dBFS 的样本。

## 2. 情绪分类 v2

训练 caption 使用以下 10 类：

1. `neutral`：平静、客观、低抑扬。
2. `tired`：疲惫、低能量、缓慢。
3. `soft`：对老师放松、温柔、克制。
4. `happy`：安静喜悦、安心、成就感。
5. `embarrassed`：害羞、慌张、强撑。
6. `annoyed`：不耐烦、轻微恼怒。
7. `stern`：凛然、命令、战斗专注。
8. `sad`：歉意、失落、悔意。
9. `surprised`：突然受惊、惊呼、停顿。
10. `playful`：轻微戏弄、冷淡幽默。

第一版中，部分战斗动作被文件族规则统一归为 `stern` 或 `sad`。第二版逐项复核台词语义和角色语境，修正 30 条，例如：

- “はあ、めんどくさい……”：`stern` → `tired`。
- “……なに、どうすればいい？”：`stern` → `surprised`。
- 泳装胜利后“あんまりじっと見ないでほしい”：`happy` → `embarrassed`。
- “戻ったら反省会ね、先生”：`sad` → `stern`。

有效音频分类分布：

| 情绪        |  v1 |  v2 |
| ----------- | --: | --: |
| annoyed     |   8 |   9 |
| embarrassed |  29 |  35 |
| happy       |  41 |  39 |
| neutral     |  17 |  23 |
| playful     |   4 |   4 |
| sad         |  19 |  16 |
| soft        |  41 |  39 |
| stern       |  69 |  56 |
| surprised   |   5 |   6 |
| tired       |   8 |  14 |

v2 会记录 `classificationSource` 和 `classificationConfidence`。人工修正置信度记为 0.95，其次为明确文本规则 0.8、动作族规则 0.65、默认平静 0.5。

完整 CSV 只保存在本机私有目录：

```text
assets/characters/hina-swimsuit/private/audio/training/multiform/hina-multiform-emotion-labels-v2.csv
```

## 3. 数据切分与平衡

- 按情绪分层、按样本 ID 哈希确定性切分。
- 训练集：192 条。
- 验证集：49 条。
- 验证集不参与 latent 编码。
- 验证集与训练集只有 1 条文本重叠，且不在当前受控试听集中。

Speaker Inversion manifest 会对少于 12 条的稀有情绪补到 12 条，共 221 行。

情绪 LoRA 使用独立的均衡 manifest：

- 每类 24 行，共 240 行。
- 多数类确定性抽取 24 条，并尽量轮换常态、泳装、礼服。
- 少数类保留全部唯一训练样本后重复采样。
- 同一情绪轮换 3 种日文 caption 表述。
- 重复行不是独立证据；报告同时记录 `availableUnique`、`duplicateRows`。

稀有情绪原有唯一训练样本仍然很少：

| 情绪      | 唯一训练条数 | LoRA 有效行 |
| --------- | -----------: | ----------: |
| tired     |           12 |          24 |
| annoyed   |            7 |          24 |
| surprised |            5 |          24 |
| playful   |            3 |          24 |

## 4. Speaker Inversion：三形态声线覆盖

- 基础模型：`Irodori-TTS-v4.1-Small`。
- 方法：冻结基础模型，只训练 16 个 speaker token。
- 热启动：泳装 run2-300 检查点。
- 设备：Apple M5 MPS，`fp32`。
- Batch 1，梯度累积 4。
- 450 步，约 26 分钟。
- 最终日志 RF loss：`0.636610`。

固定 seed、10 条留出对白上的 WavLM speaker similarity：

| 检查点   |  平均相似度 |  最低相似度 |
| -------- | ----------: | ----------: |
| run2-300 | **0.94131** | **0.88549** |
| run3-225 |     0.93162 |     0.74190 |
| run3-300 |     0.93700 |     0.80253 |
| run3-375 |     0.92236 |     0.69664 |
| run3-450 | **0.94928** |     0.84484 |

run3-450 的平均值略高于基线，但 10 个配对样本的 bootstrap 95% 区间跨 0，不能证明显著提升。Speaker Inversion 只学习声线 token，本身不会学习“caption 到情绪的映射”；它不能替代情绪 LoRA。

## 5. 情绪 LoRA 实验

### 第一轮：扩散层联合适配

- 目标模块：`diffusion_attn_mlp`。
- 可训练参数：29,261,057（包含 duration predictor）。
- 计划 300 步，实际保存到 250 步。
- 250 步后 MPS 统一内存达到系统上限，训练中止。
- 该检查点完整可读，没有 NaN/Inf。

结果：

- 五类粗粒度情绪分类在受控样本上从 20% 提升到 23%–30%。
- 自然留出对白上 WavLM 十类命中率从 30% 提升到 40%。
- 五类命中率从 40% 提升到 50%–60%。
- 但平均 speaker similarity 降至约 0.914–0.925，最低值约 0.745–0.758。
- 情绪跨 seed 一致性没有稳定提升。

结论：暂不进入生产。扩散层适配对声音身份影响偏大，证据不足以抵消声线风险。

### 第二轮：只适配 caption 交叉注意力

- 目标正则：`^blocks\.\d+\.attention\.(wk_caption|wv_caption)$`。
- 说话人编码器和主干注意力保持不变。
- 可训练参数：22,471,937（包含 duration predictor）。
- 计划 300 步，实际保存到 275 步。
- 275 步后 MPS 再次达到系统上限，训练中止。
- 275 步检查点完整可读。

默认推理参数下的结果：

| 指标                    | run3-450 基线 | caption LoRA 275 |
| ----------------------- | ------------: | ---------------: |
| 自然对白 WavLM 十类命中 |          0.30 |         **0.40** |
| 自然对白 WavLM 五类命中 |          0.40 |         **0.60** |
| 已见 caption 五类命中   |          0.20 |         **0.30** |
| 未见 caption 五类命中   |         0.267 |        **0.300** |
| 未见 caption 声学分离比 |         0.567 |        **0.577** |
| 平均 speaker similarity |   **0.94928** |          0.94268 |
| 最低 speaker similarity |       0.84484 |      **0.86636** |
| 最大削波比例            |      0.000937 |         0.001118 |

提高 caption CFG 到 4.5、speaker CFG 降到 4.5、speaker KV scale 提到 1.3 后：

- speaker 平均值略升至 0.94338，最低值 0.87217。
- 自然留出对白的五类命中仍为 60%。
- 未见 caption 的五类命中降回 0.167，声学分离比没有改善。

因此 tuned 参数不优于默认参数，当前候选固定为：

```text
~/.local/share/deskpet-tts/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275
```

用户试听接受该结果后，caption LoRA 275 已与 run3-450 speaker embedding 一起提升为生产组合。

## 6. 情绪分类器

### 手工声学特征

脚本使用 F0、能量、频谱质心、带宽、roll-off、flatness、ZCR、onset 和 13 维 MFCC 统计量，训练 SVC。验证集十类 balanced accuracy 仅约 0.145，不作为主判决。

### WavLM 表示

同一模型缓存中的 `microsoft/wavlm-base-plus-sv` 同时提供：

- speaker x-vector，用于声线相似度。
- 第 6 层和最后隐藏层的 mask mean/std，用于情绪分类。

以训练集拟合 SVC 后，49 条留出原始音频达到：

- 十类 accuracy：0.408。
- 十类 balanced accuracy：0.345。
- 五类 accuracy：0.571。
- 五类 balanced accuracy：0.593。

这比手工特征可靠，但仍远不足以把分类器当成绝对真值。所有报告都保留原始逐样本预测，并明确标注为 screening。

## 7. 试听产物

自然留出对白 A/B 顺序均为“基线 → 候选”，每类之间有间隔：

```text
assets/characters/hina-swimsuit/private/audio/multiform-caption-lora/ab-baseline-vs-caption275.wav
```

未见 caption 的受控 A/B：

```text
assets/characters/hina-swimsuit/private/audio/multiform-unseen-control/ab-baseline-vs-caption275.wav
```

候选完整十类试听：

```text
assets/characters/hina-swimsuit/private/audio/multiform-caption-lora/natural-275/emotion-eval-all.wav
```

## 8. 复现命令

```bash
npm run tts:fetch-hina-multiform
npm run tts:prepare-hina-multiform
npm run tts:balance-hina-multiform
npm run tts:audit-hina-multiform
npm run tts:audit-hina-audio
npm run tts:reclassify-hina-multiform
npm run tts:build-hina-emotion-lora-manifest
npm run tts:train-hina-multiform
npm run tts:train-hina-emotion-lora
```

固定 seed 生成十类验证音频：

```bash
npm run tts:evaluate-hina-emotion -- \
  --checkpoint <speaker.safetensors> \
  --lora-adapter <adapter-directory> \
  --label <label> \
  --output-dir <dir> \
  --validation-manifest ~/.local/share/deskpet-tts/data/hina-multiform/dataset/metadata-validation.jsonl
```

同文本、三 seed、情绪 caption 受控测试：

```bash
npm run tts:evaluate-hina-emotion -- \
  --checkpoint <speaker.safetensors> \
  --lora-adapter <adapter-directory> \
  --label <label> \
  --output-dir <dir> \
  --spec content/hina-emotion-control-eval.json \
  --repeats 3
```

评估：

```bash
npm run tts:score-hina-speaker -- --evaluation-dir <dir...>
npm run tts:classify-hina-emotion -- --evaluation-dir <dir...>
npm run tts:classify-hina-emotion-wavlm -- --evaluation-dir <dir...>
```

## 9. 私有数据边界

原始 OGG、转录、情绪 CSV、质检报告、latent、训练检查点、LoRA adapter 和生成音频只保存在本机私有目录，不进入公开发行包。

## 10. 降噪与削波治理

### 诊断结果

- run3-450 的 `stern` 和 `annoyed` 样本出现约 1.0%–1.2% 满幅采样，帧噪声底约 -28 至 -30 dBFS。
- caption LoRA 275 已将多数样本的噪声底降至约 -62 dBFS，但仍存在少量削波和宽频高频纹理。
- 13 个官方播放片段存在约 0.03% 的削波和较高的 Ogg 高频纹理。
- 数据集内部分战斗片段包含动作音效，频谱平坦度明显高于普通对白，不能按同一强度清理。

### 当前策略

固定使用温和降噪，避免把呼吸、尾音和高频辅音一起抹掉：

```text
noisereduce 3.0.3
stationary=True
prop_decrease=0.45
high-pass=55 Hz
low-pass=14 kHz
target peak=-1 dBFS
output=PCM 16-bit
```

没有采用 0.65 强度：虽然噪声底更低，但频谱平坦度显著上升，容易出现乐音状残留和“水下感”，因此淘汰。

### 效果

caption LoRA 275 的自然留出对白：

| 指标           |      降噪前 |       降噪 0.45 |
| -------------- | ----------: | --------------: |
| p90 帧噪声底   | -62.70 dBFS | **-93.84 dBFS** |
| 最大削波比例   |    0.001094 |           **0** |
| WavLM 十类命中 |        0.40 |        **0.40** |
| WavLM 五类命中 |        0.60 |        **0.60** |
| 平均声线相似度 | **0.94268** |         0.94155 |
| 最低声线相似度 |     0.86636 |     **0.86965** |

13 个官方播放片段的最大削波比例从 0.000301 降至 0；p90 帧噪声底从 -81.41 dBFS 降至约 -95.85 dBFS。

### 接入位置

- 官方语音改用 `audio/official-denoise45/*.wav`。
- 非官方日文对白在 Irodori 新合成并写入缓存前执行同一降噪链。
- `modelRevision` 已加入 `denoise45`，旧缓存不会被继续复用。
- 降噪失败时回退到原始 Irodori WAV，不会导致语音不可用。
- 处理脚本：`scripts/denoise-hina-audio.py`。

### 前后试听

官方语音，每段为“原 Ogg → 降噪”：

```text
assets/characters/hina-swimsuit/private/audio/official-denoise45/ab-original-vs-denoise45.wav
```

caption LoRA 275，每段为“原合成 → 降噪”：

```text
assets/characters/hina-swimsuit/private/audio/multiform-caption-lora/natural-275-denoise45/ab-raw-vs-denoise45.wav
```

## 11. 桌面宠物实际对白验收

生产接入参数：

```text
speaker embedding: run3-multiform-emotion/checkpoint_0000450.speaker.safetensors
LoRA adapter: caption-run2/checkpoint_0000275
modelRevision: hina-caption-lora275-run3-450-denoise45
```

`content/tts-ja.json` 当前有 40 条需要本地 TTS 的中文对白，覆盖全部 11 种情绪：

```text
neutral, tired, annoyed, stern, suspicious, soft,
embarrassed, reluctant, warning, deadpan, calm
```

逐句验收：

- 40/40 条成功生成。
- 中文对白总时长约 130.2 秒。
- 单句时长 1.48～6.08 秒。
- 降噪后最大峰值 0.87738，削波比例为 0。
- 所有句子均通过格式、时长、静音和噪声底检查。
- 实际对白 WavLM 五类粗分类命中率 42.5%。

11 种情绪样式在固定日语台词上各生成 3 个 seed：

- 33/33 条成功。
- 单句时长 3.24～3.36 秒。
- 最大峰值 0.74335，削波比例为 0。
- 跨 seed 声学分离比为 0.6437。
- WavLM 五类粗分类命中率 30.3%。

分类器不是情绪真值；实际验收同时依赖用户已完成的候选试听确认。

本地服务联调：

- 实际 `POST /v1/audio/speech` 返回 200。
- `x-irodori-messages` 明确包含 `loading LoRA adapter: .../checkpoint_0000275`。
- 同一请求同时使用 `speaker inversion embedding tokens=16`。
- 服务返回 WAV 与直接推理评估文件 SHA-256 完全一致，说明服务和评估走的是同一 LoRA/声线组合。
- Electron 单元测试确认 `loraAdapter` 会进入请求体和缓存键。

验收产物：

```text
assets/characters/hina-swimsuit/private/audio/app-tts-eval/acceptance-report.json
assets/characters/hina-swimsuit/private/audio/app-tts-eval/dialogues-report.csv
assets/characters/hina-swimsuit/private/audio/app-tts-eval/emotions-report.csv
assets/characters/hina-swimsuit/private/audio/app-tts-eval/dialogues/dialogues-all.wav
assets/characters/hina-swimsuit/private/audio/app-tts-eval/emotions/emotions-all.wav
```
