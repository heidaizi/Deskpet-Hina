# AIVM 训练可行性调研

> 日期：2026-11-05
> 结论：**技术上可行，卡在算力**——本机无 NVIDIA GPU，需走 Colab 或云端。

## 1. 格式与工具链

AIVM 不是一个训练框架，而是一个**模型打包格式**：

- `.aivm` = 带元数据的 Safetensors；
- `.aivmx` = 带元数据的 ONNX（AivisSpeech 引擎实际加载的格式）。

官方只提供打包工具，不提供训练器：

| 仓库                               | 作用                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| `AIVis-Project/aivmlib`            | Python 参考实现，`create-aivm` / `create-aivmx` CLI，PyPI 可安装 |
| `AIVis-Project/AIVM-Generator`     | 浏览器 GUI，打包与编辑元数据                                     |
| `AIVis-Project/AivisSpeech-Engine` | 推理引擎（VOICEVOX 兼容）                                        |

`aivmlib` 明确支持 **Style-Bert-VITS2（JP-Extra）** 架构：

```bash
aivmlib create-aivm  -o output.aivm  -m model.safetensors -a "Style-Bert-VITS2" \
  -h config.json -s style_vectors.npy
aivmlib create-aivmx -o output.aivmx -m model.onnx        -a "Style-Bert-VITS2" \
  -h config.json -s style_vectors.npy
```

所以完整链路是：

```text
日语音频 + 转写
   → Style-Bert-VITS2 训练（需要 NVIDIA GPU）
   → export ONNX + style_vectors.npy
   → aivmlib create-aivmx
   → AivisSpeech Engine 加载 .aivmx
```

## 2. 算力：本机不可行

Style-Bert-VITS2 官方说明：**没有 NVIDIA GPU 无法训练**（CPU 只能推理与合并）。
本机是 Apple Silicon，因此本地训练这条路走不通。

可行的替代：

| 方案         | 成本             | 说明                                           |
| ------------ | ---------------- | ---------------------------------------------- |
| Google Colab | 免费（T4）或 Pro | 官方提供 `colab.ipynb`，免费版有时长与显存限制 |
| Paperspace   | 约 $0.5～1/小时  | 官方文档有专门指引                             |
| 租用云 GPU   | 约 $1～2/小时    | 30 分钟数据训练通常数小时                      |

按 30 分钟数据、SBV2 默认 100 epoch 估计，T4 上约 3～6 小时；A10/3090 约 1～2 小时。

## 3. 语料现状

本地已有：

| 数据集                            | 样本数  | 总时长        | 转写       |
| --------------------------------- | ------- | ------------- | ---------- |
| `hina-training-expanded.json`     | 80      | 约 8 分钟     | ✅ 日文    |
| `hina-multiform-training-v2.json` | 244     | 约 23 分钟    | ✅ 日文    |
| 合计                              | **324** | **30.8 分钟** | 全部带转写 |

分布：`normal` / `swimsuit` / `dress` 三种形态，每条带 `emotion` 与 `intensity` 标签。

对照 SBV2 要求：

- ✅ 单条 2～14 秒：大部分符合，少量长句需切分；
- ✅ 转写齐全；
- ⚠️ 30 分钟属于**刚过门槛**（经验值 30 分钟起步，1～2 小时更稳）；
- ⚠️ 音频是 OGG，需转 WAV 16-bit 单声道。

## 4. 情绪风格怎么做

SBV2 的样式由**训练数据的分文件夹结构**决定，默认生成 `Neutral`，也可用
「スタイル作成」从音频单独生成样式向量。

我们的语料已有 `emotion` + `intensity` 标注，可以直接按情绪分目录：

```text
raw/
├── neutral/    # emotion 为 neutral 或未标注
├── annoyed/    # 生气
├── embarrassed/# 害羞
├── tired/      # 疲惫
└── soft/       # 温柔
```

训练后可得到与情绪引擎一一对应的 style 向量，比"自然语言描述"稳定得多。

## 5. 被替换后的集成方式

现有 `LocalTtsService` 走 OpenAI 兼容接口；AivisSpeech 是 VOICEVOX 兼容：

```text
POST /audio_query?text=...&speaker=<styleId>   → 查询 JSON
POST /synthesis?speaker=<styleId>              → WAV
```

接入改动：

1. `local-tts-service` 增加 provider 分支（`irodori` / `aivis`），配置项 `ttsEngine`；
2. 情绪 → styleId 的映射表（`emotion` + `intensity` → 样式名）；
3. 缓存键加入引擎与 styleId；
4. 保留 Irodori 作为回退，出问题可一键切回。

延迟方面：AivisSpeech 整句合成 0.7～2 秒，已低于 Irodori 首块延迟，
现有"句级切分 + 流水线"可直接复用，不需要它的流式能力。

## 6. 需要你决定/提供的

1. **算力选择**：Colab（免费，慢、有时限）还是租云 GPU（快，付费）；
2. **是否扩充语料**：如需更稳，可补其它形态的语音页（目标 1 小时以上）；
3. **用途边界**：SBV2 的 `TERMS_OF_USE` 与蔚蓝档案二次创作规约需要确认，
   个人本地使用通常没问题，分发则需要额外授权。

## 7. 风险

| 风险                   | 影响               | 缓解                                 |
| ---------------------- | ------------------ | ------------------------------------ |
| 30 分钟数据不足        | 音色不稳、偶发失真 | 扩充语料或数据增强                   |
| 情绪标注是模型分类结果 | 风格边界模糊       | 人工抽检，必要时合并类别             |
| 云端训练环境的版本漂移 | 导出格式不兼容     | 固定 SBV2 版本，训练后立刻导出 AIVMX |
| 角色声线版权           | 不能分发           | 仅本地使用，不打包进发行版           |

## 8. 补充：M5 本机训练可行性

结论：**官方不支持，社区补丁未合并，可以试但别指望稳。**

代码层面的事实（master 分支 `train_ms_jp_extra.py`）：

```python
torch.cuda.set_device(local_rank)
model.cuda(local_rank)
from torch.cuda.amp import GradScaler, autocast
```

即训练脚本硬编码 CUDA，Mac 上会直接报错。

社区情况：

- PR #240「feat: add macOS (MPS/CPU) support to training script」存在，
  改动约 60 行（设备探测 + CUDA 守卫），但**已关闭且未合并**；
- 未找到公开的 MPS fork（GitHub 搜索无结果）；
- 官方文档明确：无 NVIDIA GPU 无法训练。

若坚持本机训练，只能自己打 #240 补丁并承担风险：

| 风险       | 说明                                                    |
| ---------- | ------------------------------------------------------- |
| 算子不支持 | VITS 的某些操作在 MPS 上可能回退 CPU 或报错             |
| 速度       | M5 GPU 训练 VITS，30 分钟数据 100 epoch 预计 5～10 小时 |
| 版本漂移   | 补丁基于旧版本，合并冲突需手工处理                      |

更稳的路径仍是 Colab（官方 notebook，零成本）或云 GPU（1～2 小时）。

## 9. 语料来源核对（324 条）

逐条检查 `sourceUrl` 后确认：**324 条全部是官方语音**，
来自 `static.wikitide.net` 的三张角色语音页：

| 来源页                | 条目数                 |
| --------------------- | ---------------------- |
| Hina (Swimsuit)/audio | 80（与 expanded 重复） |
| Hina (Dress)/audio    | 88                     |
| Hina (Normal)/audio   | 76（目录记为 normal）  |
| 去重后唯一音频        | **244**                |

之前训练/评估产出的合成音频**不在这 324 条里**，而是散落在：

```text
audio/generated/ audio/generated-dialogue/ audio/emotion-v*/ audio/app-tts-eval/
audio/multiform-eval*/ audio/multiform-lora-*/ audio/official-denoise45/ ...
```

这些是 Irodori 的推理结果，**不能用于 SBV2 训练**——会把 Irodori 的瑕疵一起学进去。

训练集应只取：

```text
training/source-expanded/   （80 条，泳装）
training/multiform/source/  （244 条，三形态）
```

按 `sha256` 去重后共 244 条唯一音频、约 30.8 分钟。

## 10. 第二轮：精选语料与训练参数

### 语料上限

日奈在 wiki 上只有三套语音页（普通 85 / 泳装 83 / 礼服 93，共 261 条），
本地已有 250 条；缺的 6 条全是 `Battle Shout`（战斗吼叫），按本轮目标**刻意不采**。

结论：公开可用的官方语音上限约 **33 分钟**，无法凑到 1 小时。
其它来源要么是付费 ASMR 新录音，要么是 RVC 变声模型（技术路线不同）。

### 为什么"太活泼"

现有 244 条里 **104 条是战斗类**（Battle / ExSkill / Tactic / Formation 等，占 43%），
虽然只占 5 分钟时长，但都是短促喊叫，会把"提高音量、加快语速"带进整体音色。

### 精选方案

`node scripts/prepare-aivm-training-data.mjs --curate` 生成：

| 项目 | 数值                         |
| ---- | ---------------------------- |
| 条数 | 143（剔除全部战斗类）        |
| 时长 | 17.9 分钟                    |
| 风格 | neutral 55 / soft 88（2 种） |

代价是数据量降到 18 分钟，可能影响稳定性；若训练不稳，再把
`Battle_In / Battle_Move / Battle_Buffed` 这类短促但平静的战斗台词加回来。

### 底模与学习率

- **底模**：继续用 `litagin/Style-Bert-VITS2-2.0-base-JP-Extra`。
  AIVM 只支持 JP-Extra 架构，换成 1.0 底模（非 JP-Extra）无法打包成 AIVM。
- **学习率**：默认 `1e-4`，本轮改为 **`5e-5`**。
  理由是数据量小、训练 300 epoch，学习率过高会快速过拟合，表现为语气"飘、活泼"。
- **batch**：保持 4（3080 Ti 12GB 可跑）；
- **检查点**：每 500 步保存，训练结束后 A/B 试听 e100 / e200 / e300，取最像的一版，不要只看最终轮。

### 时间与费用

143 条 × 300 epoch，3080 Ti 约 **2～3 小时**，费用约 ¥4～5。
