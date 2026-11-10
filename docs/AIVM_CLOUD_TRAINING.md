# 云端训练日奈声线（Style-Bert-VITS2 → AIVM）

> 前置：`node scripts/prepare-aivm-training-data.mjs` 已生成 `build/aivm-training/hina/`。
> 数据：244 条官方语音、约 30.8 分钟、5 种情绪样式，`esd.list` 已按 SBV2 格式生成。

## 1. 平台选择

| 平台           | 参考价（4090）    | 支付          | 适合                                 |
| -------------- | ----------------- | ------------- | ------------------------------------ |
| **AutoDL**     | 约 ¥1.6～2.5/小时 | 支付宝        | 国内最省事，上传下载快，需配 HF 镜像 |
| **RunPod**     | 约 $0.4～0.7/小时 | 国际信用卡    | 模板齐全，全球节点                   |
| **Vast.ai**    | 约 $0.3～0.5/小时 | 卡/加密货币   | 最便宜，机器质量参差                 |
| **Paperspace** | 订阅 + 用量       | 国际信用卡    | SBV2 官方文档有专门指引              |
| Google Colab   | 免费 / Pro        | 信用卡（Pro） | 零成本试水，T4 慢且有时限            |

推荐：**国内支付优先 AutoDL**；有国际卡且追求便宜选 **Vast.ai / RunPod**。

硬件最低要求：

- GPU：NVIDIA，显存 ≥ 12GB（T4 16GB 可用，4090 更快）
- 系统盘：≥ 30GB（依赖 + 预训练模型），数据盘另需约 1GB
- CUDA：11.8 或 12.1 的 PyTorch 镜像

## 2. 上传数据

本地打包（约 117MB）：

```bash
cd build/aivm-training
zip -r hina.zip hina
```

上传到实例后解压到 SBV2 的 `Data/` 下，最终结构：

```text
Style-Bert-VITS2/Data/hina/
├── raw/
│   ├── neutral/*.wav
│   ├── annoyed/*.wav
│   ├── embarrassed/*.wav
│   ├── tired/*.wav
│   └── soft/*.wav
└── esd.list
```

`esd.list` 每行格式：`style/xxx.wav|hina|JP|日文转写`。

## 3. 环境与训练

```bash
git clone https://github.com/litagin02/Style-Bert-VITS2.git
cd Style-Bert-VITS2
python -m venv venv && source venv/bin/activate
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install -r requirements.txt

# 国内机器访问 Hugging Face 不稳定时：
export HF_ENDPOINT=https://hf-mirror.com

python initialize.py --skip_default_models

# 预处理（JP-Extra 必须加 --use_jp_extra）
python preprocess_all.py -m hina --use_jp_extra -b 4 -e 100 --normalize --trim

# 训练
python train_ms_jp_extra.py
```

训练时长估计（244 条 / 30.8 分钟 / 100 epoch）：

| 显卡        | 预估          |
| ----------- | ------------- |
| T4 16GB     | 4～6 小时     |
| 3090 / 4090 | 1.5～2.5 小时 |

显存不足时把 `-b` 降到 2。

## 4. 导出为 AIVM

```bash
# 导出 ONNX 与配置、样式向量（JP-Extra）
python convert_to_onnx.py --model_name hina --use_jp_extra

# 打包成 AIVMX（AivisSpeech 引擎可直接加载）
pip install aivmlib
aivmlib create-aivmx -o hina.aivmx -m model.onnx -a "Style-Bert-VITS2" \
  -h config.json -s style_vectors.npy
```

产物：`hina.aivmx`（几十 MB），放回本地后由 AivisSpeech Engine 加载。

## 5. 验收检查

1. 训练日志出现每个 epoch 的 loss，且未报 OOM；
2. `model_assets/hina/` 下有 `.safetensors`、`config.json`、`style_vectors.npy`；
3. 本地用 `hina.aivmx` 跑同一套 20 句基准（`scripts/bench-aivis.mjs`）；
4. 与 Irodori 对比音色相似度与日语自然度。

## 6. 风险与对策

| 风险                                     | 对策                                            |
| ---------------------------------------- | ----------------------------------------------- |
| 30 分钟数据偏少，音色不稳                | 先跑 50 epoch 看效果，不够再扩充语料            |
| 情绪样式样本不均（soft 78 / neutral 30） | 可合并类别，或训练后用「スタイル作成」单独生成  |
| 云端访问 HF 失败                         | `HF_ENDPOINT=https://hf-mirror.com`             |
| 训练中断                                 | 平台按小时计费，务必先确认可保存快照/磁盘持久化 |
| 版权                                     | 仅本地使用，不随项目分发 `.aivmx`               |

## 7. 备选：RTX 3060 Laptop 本机训练

结论：**能跑，但显存是下限，需要降 batch 并接受更长时间。**

### 显存预算

RTX 3060 Laptop 通常为 **6GB** 显存（少数 8GB 版本）。SBV2 JP-Extra 训练的主要占用：

| 项目                            | 约占用   |
| ------------------------------- | -------- |
| JP-Extra 模型 + 优化器状态      | 2～3GB   |
| 日语 BERT（fp32）               | 1～1.5GB |
| 激活值（batch 2、2～14 秒片段） | 1.5～2GB |

6GB 下建议：

```bash
python preprocess_all.py -m hina --use_jp_extra -b 2 -e 100 --normalize --trim --freeze_JP_bert
```

- `-b 2`：先试 batch 2；OOM 再降到 `-b 1`（时间约翻倍）；
- `--freeze_JP_bert`：冻结 BERT 参数，省下优化器状态；
- 训练前关闭浏览器、游戏等占用显存的程序；
- 笔记本插电并开启性能模式，避免降频。

### 时间预估

| 显存/配置 | batch | 预估       |
| --------- | ----- | ---------- |
| 6GB       | 2     | 4～8 小时  |
| 6GB       | 1     | 8～15 小时 |
| 8GB       | 4     | 3～5 小时  |

笔记本长时间满载会降频，实际可能比表中更慢。

### 与云端对比

| 维度     | 3060 笔记本  | 云端 4090          |
| -------- | ------------ | ------------------ |
| 费用     | 电费         | 约 ¥4～6           |
| 时间     | 4～8 小时    | 1.5～2.5 小时      |
| 数据     | 不出本机     | 需上传（117MB）    |
| 中断风险 | 可断点续训   | 依赖平台磁盘持久化 |
| 显存风险 | 6GB 可能 OOM | 24GB 无压力        |

建议：**先在 3060 上跑 5 个 epoch 验证不 OOM**，再决定跑满还是转云端。
训练脚本支持断点续训（`--skip_default_style`），中断后可从最新 checkpoint 继续。

### Windows 环境

```powershell
git clone https://github.com/litagin02/Style-Bert-VITS2.git
cd Style-Bert-VITS2
python -m venv venv
venv\Scripts\activate
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install -r requirements.txt
python initialize.py --skip_default_models
```

数据放到 `Data/hina/`（解压 `hina.zip`），然后执行上面的预处理与训练命令。
国内网络下载预训练模型失败时，设置环境变量：

```powershell
set HF_ENDPOINT=https://hf-mirror.com
```

## 8. AutoDL 具体操作

### 8.1 创建实例

1. 注册并实名认证（AutoDL 控制台）。
2. 「算力市场」→ 选地区（优先有 4090 库存的）→ 选 **RTX 4090**，数量 1。
3. 镜像选择：**PyTorch 2.x + CUDA 11.8/12.1**（基础镜像即可，不需要预装别的）。
4. 磁盘：系统盘默认即可；**数据盘建议 50GB**（放数据集、checkpoint、HF 缓存）。
5. 创建并开机。

> 预算紧可以选 3090（约 ¥1.2～1.6/小时），30 分钟数据用 3090 约 2～3 小时。

### 8.2 上传数据

两种方式任选：

**方式 A：JupyterLab 上传（小文件快）**

实例页 → JupyterLab → 进入 `/root/autodl-tmp/` → 直接拖拽 `hina.zip`（117MB）。

**方式 B：SCP（大文件稳）**

```bash
# 本地执行，端口和地址在实例页「SSH 登录」里
scp -P <端口> build/aivm-training/hina.zip root@<实例地址>:/root/autodl-tmp/
```

上传后用 `ls -lh /root/autodl-tmp/hina.zip` 确认大小约 117MB。

### 8.3 实例内执行

把仓库里的 `scripts/aivm-autodl-setup.sh` 复制到实例（或直接在 JupyterLab 新建同名文件粘贴），然后：

```bash
cd /root/autodl-tmp
# 先跑 dry-run，检查 GPU、依赖、数据
bash aivm-autodl-setup.sh --dry-run
# 检查通过后启动训练
bash aivm-autodl-setup.sh
```

脚本会依次：加载学术加速 → 检查 GPU → 克隆 SBV2 → 安装依赖 → 初始化 →
解压数据集 → 后台执行预处理与训练，并打印监控命令。

### 8.4 训练期间

```bash
tail -f /root/autodl-tmp/Style-Bert-VITS2/train.log   # 日志
nvidia-smi                                            # 显存
```

- 显存 OOM：停掉后用 `BATCH_SIZE=2 bash aivm-autodl-setup.sh` 重跑；
- 预处理阶段出现「yomi error」：加 `--yomi_error skip` 重新预处理；
- 断线不影响后台训练，重新连上继续 `tail -f` 即可。

### 8.5 训练完成与导出

```bash
cd /root/autodl-tmp/Style-Bert-VITS2
ls model_assets/hina/          # 应有 .safetensors / config.json / style_vectors.npy

python convert_to_onnx.py --model_name hina --use_jp_extra

pip install aivmlib
aivmlib create-aivmx -o hina.aivmx -m model.onnx \
  -a "Style-Bert-VITS2" -h config.json -s style_vectors.npy
```

下载 `hina.aivmx` 到本地（JupyterLab 右键下载，或 `scp` 拉回）。

### 8.6 关机省钱

- **训练结束立刻关机**，AutoDL 按分钟计费，开机即扣费；
- 关机后数据盘仍计费（很便宜），但实例若被释放可能丢数据；
- 重要产物先下载到本地，或使用「保存镜像」固化环境。

### 8.7 费用参考

| 项目                       | 估算         |
| -------------------------- | ------------ |
| 4090（约 ¥2/小时）× 2 小时 | 约 ¥4        |
| 数据盘 50GB 一天           | 约 ¥0.5      |
| 合计                       | **不到 ¥10** |

### 8.8 常见问题

| 现象              | 原因                      | 处理                                       |
| ----------------- | ------------------------- | ------------------------------------------ |
| `git clone` 超时  | 未加载学术加速            | `source /etc/network_turbo` 后重试         |
| HF 下载卡住       | 直连 huggingface.co 不通  | `export HF_ENDPOINT=https://hf-mirror.com` |
| CUDA 报错         | 镜像 CUDA 与 torch 不匹配 | 换 PyTorch 2.x + CUDA 11.8 镜像            |
| 训练一开始就 OOM  | batch 过大                | `BATCH_SIZE=2` 或 `BATCH_SIZE=1`           |
| 找不到 `esd.list` | 压缩包层级不对            | 确认解压后是 `Data/hina/esd.list`          |

## 9. RTX PRO 6000 能不能用

可以，而且很宽裕——但有一个**必须先确认的兼容性问题**。

### 规格与预期

RTX PRO 6000（Blackwell）显存 96GB，训练吞吐约为 4090 的 1.3～1.6 倍，
显存是 4090 的 4 倍。对我们 30 分钟的数据：

| 项目           | 4090      | RTX PRO 6000 |
| -------------- | --------- | ------------ |
| batch          | 4～8      | 16 轻松      |
| 100 epoch 耗时 | 1.5～2.5h | 约 1～1.5h   |
| 参考价         | 约 ¥2/h   | 约 ¥3～5/h   |

### 兼容性：Blackwell 需要新 CUDA

Blackwell（sm_120）**不能**用 CUDA 11.8 / 12.1 的 PyTorch 轮子，
否则会报：

```text
CUDA error: no kernel image is available for execution on the device
```

正确组合：

- PyTorch **≥ 2.7**
- CUDA **12.8**（`cu128` 轮子）

镜像选择：AutoDL 里选 **PyTorch 2.7+ / CUDA 12.8**；不要选 11.8 镜像。

### 开工前 30 秒自检

```bash
nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
python - <<'PY'
import torch
print("torch:", torch.__version__, "cuda:", torch.version.cuda, "可用:", torch.cuda.is_available())
print("算力:", torch.cuda.get_device_capability() if torch.cuda.is_available() else None)
PY
```

- 算力显示 `(12, 0)` 即 Blackwell；
- 若 `torch.cuda.is_available()` 为 False 或版本低于 2.7，先重装：

```bash
pip install --upgrade torch torchaudio --index-url https://download.pytorch.org/whl/cu128
```

### 什么时候不值得用

- 只差一次 30 分钟数据的训练时，4090/3090 省下的钱比多等的时间更值；
- PRO 6000 单价高，如果排队反而更久，不如先抢 3090。

结论：**有现货且镜像支持 CUDA 12.8 就直接上**，batch 开 8～16，一小时出结果。

## 10. 摩尔线程（MUSA）适不适合

结论：**技术上可能跑通，但不建议作为首选**——对一次性训练来说，调试风险大于省钱收益。

### 为什么有风险

SBV2 的依赖栈几乎全部建立在 CUDA 生态上：

| 组件                   | 依赖              | 在 MUSA 上的情况                    |
| ---------------------- | ----------------- | ----------------------------------- |
| PyTorch                | CUDA 轮子         | 需换 `torch_musa`，与官方版本强绑定 |
| torchaudio             | CUDA 算子         | 重采样 / STFT 等算子覆盖不全        |
| transformers           | 纯 Python + torch | 通常可用                            |
| pyworld / 其它编译依赖 | C++ 编译          | 需在 MUSA 环境重新编译              |

摩尔线程提供 `torch_musa` 后端与 MUSIFY 迁移工具，能跑通不少模型，
但**不是"装完就能训"**，需要逐个算子验证。

### 现实预估

| 项目     | 预期                                     |
| -------- | ---------------------------------------- |
| 环境搭建 | 1～3 小时（版本对齐、编译依赖）          |
| 算子踩坑 | 不确定，可能遇到不支持的算子直接中断     |
| 训练速度 | 与同价位 NVIDIA 卡相当或略低             |
| 成功率   | 中等偏低（没有公开的 SBV2 on MUSA 案例） |

### 什么情况下可以考虑

- 你本来就想折腾国产卡生态，愿意花半天调试；
- 平台按小时计费且卡非常便宜（例如 S4000 明显低于 3090）；
- 失败也能接受，随时切回 NVIDIA。

### 建议

**优先抢 NVIDIA 的 3090 / 3080 / T4**，实在没有再看 MUSA 卡，
并且先用 5 分钟做一次最小验证：

```bash
python - <<'PY'
import torch
print(torch.__version__)
print(getattr(torch, "musa", None))
PY
```

如果 `torch.musa` 不存在或 SBV2 的 `pip install -r requirements.txt` 无法完成，
直接放弃，不要在这上面耗时间。

## 11. 实战踩坑记录（2026-11-05，AutoDL 3080 Ti）

实际部署时遇到的 6 个问题与解法，下次可直接照做：

1. **torch 版本冲突**：镜像自带 torch 2.8，而 requirements 要求 `torch<2.4`。
   新建 Python 3.10 环境，装 `torch==2.3.1 torchaudio==2.3.1`（cu121 轮子）。
2. **`av` 编译失败**：`faster-whisper` 锁 `av==10.*`，无 cp310 轮子。
   我们已有转写，直接从 requirements 中剔除 `faster-whisper` 后安装，
   它只被 `transcribe.py` 引用，不影响训练。
3. **`pkg_resources` 缺失**：`pip install "setuptools<70" wheel`。
4. **pyopenjtalk worker 超时**：worker 子进程起不来。
   先手动跑一次 `pyopenjtalk.g2p()` 触发词典下载，再把
   `preprocess_all.py` / `preprocess_text.py` / `bert_gen.py` 的 worker 初始化注释掉，
   `g2p.py` 改为 `import pyopenjtalk`。
5. **transformers 5.x 不认 torch 2.3**：报 "requires the PyTorch library"。
   降级 `transformers==4.40.2`。
6. **style_gen 失败**：`pyannote` 模型需联网。
   用 `HF_ENDPOINT=https://hf-mirror.com` 预下载
   `pyannote/wespeaker-voxceleb-resnet34-LM`，再跑 `style_gen.py` 生成 244 个 `.npy`。

### 实际训练参数

```bash
python preprocess_all.py -m hina --use_jp_extra -b 4 -e 100 --normalize --trim
python train_ms_jp_extra.py
```

3080 Ti 12GB、batch 4：约 **1.5 it/s**，5800 步，总耗时约 **1 小时**；
显存占用 8～11.5GB，属紧平衡但稳定。

### 训练后自动导出

```bash
python convert_onnx.py --model model_assets/hina --aivmx
```

新版 SBV2 的 `convert_onnx.py` 支持 `--aivmx` 直接产出 AIVIS 可加载文件。
