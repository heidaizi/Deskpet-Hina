# 语音训练指南

把你自己拥有使用权的音频，训练成 AivisSpeech 可加载的 `.aivmx` 语音模型。

> **本项目不提供语音模型，也不提供训练素材。**
> 训练数据必须由你自行准备，并确保拥有相应授权。用官方声优声音训练并分发
> 模型存在明显的权利风险，请自行判断。

## 技术栈

```
音频 → 切片 → 转写 → Style-Bert-VITS2 (JP-Extra) 训练
     → model.onnx → aivmlib create-aivmx → .aivmx
     → AivisSpeech Engine 加载
```

- 训练框架：[Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2)（AGPL-3.0）
- 打包工具：`aivmlib`（`pip install aivmlib`，提供 `create-aivmx`）
- 推理引擎：AivisSpeech Engine

## 1. 准备音频

要求：

| 项       | 建议                           |
| -------- | ------------------------------ |
| 采样率   | 44.1kHz 或 48kHz               |
| 格式     | WAV（单声道最佳）              |
| 单段长度 | 2～12 秒                       |
| 内容     | 干净人声，尽量少背景音乐与混响 |
| 数量     | 至少 30 分钟，1 小时以上更好   |

只使用你拥有权利的素材（自己录制、已获授权、或公共领域）。

## 2. 切片

长音频按静音切分：

```bash
python scripts/slice-long-audio.py input.wav build/slices --min 2 --max 12
```

## 3. 转写

生成 Style-Bert-VITS2 所需的 `esd.list`：

```bash
python scripts/transcribe-asmr.py build/slices build/hina/esd.list \
  --model openai/whisper-large-v3
```

其他语言/口音可换用更大的 Whisper 模型。转写后建议人工抽查，
错误文本会直接影响训练质量。

## 4. 整理数据集

仓库自带整理脚本，把切片转成 SBV2 的 `raw/<style>/` 结构：

```bash
node scripts/prepare-aivm-training-data.mjs
# 可选：--curate 会按风格精选样本（样本量少时更稳）
```

输出：

```
build/aivm-training/hina/
├── raw/<style>/*.wav
└── esd.list
```

`style` 会按文件名规则归类（战斗类 → annoyed，日常类 → soft 等）。
如果你自己组织数据，保持 `raw/<style>/` 结构即可。

## 5. 训练

### 本地 / 云端

仓库提供 AutoDL 一键脚本：

```bash
bash scripts/aivm-autodl-setup.sh
```

前置（按脚本注释）：

1. 音频打包为 `/root/autodl-tmp/hina.zip`
2. 实例使用 PyTorch 2.x + CUDA 11.8/12.1 镜像

常用参数：

```bash
EPOCHS=150 BATCH_SIZE=4 bash scripts/aivm-autodl-setup.sh
```

多风格数据集（游戏语音 + 其他素材混合）可用：

```bash
python scripts/build-multistyle-dataset.py \
  <repo> <game.zip> <soft_dir> <soft_esd> <neutral_dir> <neutral_esd> hina
```

训练完成后得到 `G_*.pth` 与导出的 `model.onnx`。

## 6. 导出 AIVMX

```bash
pip install aivmlib
aivmlib create-aivmx -o hina.aivmx -m model.onnx \
  -a "Style-Bert-VITS2" ...
```

完整参数见 `aivmlib` 文档（`create-aivmx --help`）。
导出后建议先用引擎的 `/speakers` 接口确认能加载。

## 7. 安装到应用

```bash
mkdir -p "$HOME/Library/Application Support/AivisSpeech-Engine/Models"
cp hina.aivmx "$HOME/Library/Application Support/AivisSpeech-Engine/Models/"
```

重启应用（或重启引擎），确认：

```bash
curl -s http://127.0.0.1:10101/speakers | head -c 400
```

应用侧约定：

| 项         | 约定                                                  |
| ---------- | ----------------------------------------------------- |
| speaker 名 | 优先 `hina`，否则取第一个说话人                       |
| 样式名     | 建议 `neutral`、`soft`、`annoyed`；缺失时用第一个样式 |
| 引擎路径   | `~/Library/Deskpet/engine/run`                        |

## 8. 训练建议

- **数据配比**：气声/ASMR 素材比例过高会让声线发闷，建议不超过 30%；
- **战斗台词**：喊叫过多会让日常对话带攻击性，可单独归入 `annoyed`；
- **epoch**：从 100 开始，150 左右通常更稳；再多容易过拟合；
- **采样试听**：训练中途就导出试听，比只看 loss 可靠。

## 9. 许可与分发

- Style-Bert-VITS2 为 **AGPL-3.0**，训练出的模型可能受其约束；
- 声音本身可能涉及表演者权利；
- **不要**把训练好的 `.aivmx` 提交到本仓库或随安装包分发。

本项目只提供训练代码与路径说明，不提供模型文件。
