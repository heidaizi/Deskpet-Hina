#!/usr/bin/env bash
# AutoDL 实例内一键准备 + 训练（在实例的终端里运行）
#
# 前置：
#   1. 已把 hina.zip 上传到 /root/autodl-tmp/hina.zip
#   2. 实例已选 PyTorch 2.x + CUDA 11.8/12.1 镜像
#
# 用法：
#   bash aivm-autodl-setup.sh            # 完整流程（预处理 + 训练）
#   bash aivm-autodl-setup.sh --dry-run  # 只检查环境与数据，不启动训练

set -euo pipefail

WORKDIR="/root/autodl-tmp"
REPO="${WORKDIR}/Style-Bert-VITS2"
DATASET_ZIP="${WORKDIR}/hina.zip"
MODEL_NAME="hina"
BATCH_SIZE="${BATCH_SIZE:-4}"
EPOCHS="${EPOCHS:-100}"

DRY_RUN=0
PREP_ONLY=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  --prep-only) PREP_ONLY=1 ;;
esac

echo "== 1/7 网络加速（AutoDL 学术资源） =="
if [[ -f /etc/network_turbo ]]; then
  # shellcheck disable=SC1091
  source /etc/network_turbo
  echo "  已加载 /etc/network_turbo"
else
  echo "  未找到 network_turbo，如遇 GitHub/HF 超时可手动设置镜像"
fi
export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
export HF_HOME="${WORKDIR}/hf-cache"

echo "== 2/7 检查 GPU =="
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
elif [[ "${PREP_ONLY}" == "1" ]]; then
  echo "  无 GPU（无卡模式）：预处理仍然可以完成，训练需等有卡"
else
  echo "  未检测到 nvidia-smi，请确认实例已挂载 GPU"
  exit 1
fi

echo "== 3/7 准备仓库 =="
mkdir -p "${WORKDIR}"
cd "${WORKDIR}"
if [[ ! -d "${REPO}/.git" ]]; then
  git clone --depth 1 https://github.com/litagin02/Style-Bert-VITS2.git
fi
cd "${REPO}"

echo "== 4/7 检查 Python 依赖 =="
python - <<'PY'
import importlib, sys
missing = [m for m in ("torch", "torchaudio", "transformers", "gradio") if importlib.util.find_spec(m) is None]
print("  缺失依赖:", ", ".join(missing) if missing else "无")
sys.exit(1 if missing else 0)
PY
if [[ $? -ne 0 ]]; then
  echo "  安装 requirements（镜像已带 torch 时不会重装）"
  pip install -r requirements.txt
fi

echo "== 5/7 初始化路径与预训练模型 =="
if [[ ! -f configs/paths.yml ]]; then
  python initialize.py --skip_default_models
fi

echo "== 6/7 准备数据集 =="
mkdir -p Data
if [[ ! -f Data/${MODEL_NAME}/esd.list ]]; then
  if [[ ! -f "${DATASET_ZIP}" ]]; then
    echo "  找不到 ${DATASET_ZIP}，请先上传" >&2
    exit 1
  fi
  unzip -q "${DATASET_ZIP}" -d Data
fi
LINES=$(wc -l < "Data/${MODEL_NAME}/esd.list" | tr -d ' ')
echo "  esd.list 条数: ${LINES}"
if [[ "${LINES}" -lt 200 ]]; then
  echo "  警告：样本数偏少，训练质量可能不稳定" >&2
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "== 7/7 dry-run 完成，未启动训练 =="
  exit 0
fi

if [[ "${PREP_ONLY}" == "1" ]]; then
  echo "== 预处理（无卡模式可完成） =="
  python preprocess_all.py -m ${MODEL_NAME} --use_jp_extra -b ${BATCH_SIZE} -e ${EPOCHS} --normalize --trim
  echo "== 预处理完成，可保存镜像；开机后直接执行 train_ms_jp_extra.py =="
  exit 0
fi

echo "== 7/7 启动预处理 + 训练（后台） =="
nohup bash -c "
  set -e
  python preprocess_all.py -m ${MODEL_NAME} --use_jp_extra -b ${BATCH_SIZE} -e ${EPOCHS} --normalize --trim
  python train_ms_jp_extra.py
" > "${REPO}/train.log" 2>&1 &

echo "  已启动，PID: $!"
echo
echo "常用命令："
echo "  看日志:   tail -f ${REPO}/train.log"
echo "  看显存:   nvidia-smi"
echo "  停止训练: pkill -f train_ms_jp_extra"
echo "  OOM 时:   BATCH_SIZE=2 bash $0"
