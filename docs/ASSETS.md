# 素材说明（自备）

本仓库不包含任何角色素材。所有私有文件都放在：

```
assets/characters/hina-swimsuit/private/
```

该目录已被 `.gitignore` 忽略（`private/*`，仅保留本说明），**不要提交**。

## 目录结构

```
assets/characters/hina-swimsuit/private/
├── README.md                      # 本文件
├── 3d/
│   └── official/
│       └── hina-swimsuit-official.glb     # 必需（3D 模式）
└── audio/
    ├── official-denoise45/               # 可选：固定台词语音
    │   └── *.wav
    └── generated-dialogue/               # 可选：预生成语音
        └── *.wav
```

## 1. 3D 模型

| 项   | 值                                               |
| ---- | ------------------------------------------------ |
| 路径 | `private/3d/official/hina-swimsuit-official.glb` |
| 格式 | glTF Binary（`.glb`）                            |
| 必需 | 是（3D 模式）；缺失时退回 2D 占位                |

模型路径定义在 `content/character.json` 的 `renderers[].assetPath`。
如果你换了文件名，需要同步修改该文件。

建议模型包含：

- 骨骼（humanoid）
- 表情/形态键（用于情绪表情）
- 合理的缩放与朝向（应用会按配置缩放）

## 2. 官方语音（可选）

| 项   | 值                                            |
| ---- | --------------------------------------------- |
| 路径 | `private/audio/official-denoise45/<clip>.wav` |
| 格式 | WAV，单声道/多声道均可                        |
| 清单 | `content/prebuilt-tts-ja.json` 等按文本索引   |

用途：固定台词（登录、场景陪伴、返回问候）直接播放原声。
缺少文件时自动回退到实时语音合成，不影响使用。

## 3. 预生成语音（可选）

| 项   | 值                                                                       |
| ---- | ------------------------------------------------------------------------ |
| 路径 | `private/audio/generated-dialogue/*.wav`                                 |
| 清单 | `content/prebuilt-tts-ja.json`、`content/prebuilt-tts-supplemental.json` |

清单是「文本 → 音频路径」的映射，运行时按文本查找。你可以：

- 用相同的文本重新生成自己的音频；
- 或者删掉清单条目，让所有台词走实时合成。

## 从哪里获取

本项目**不提供下载**。你需要自行准备并确认授权：

- **角色模型**：可使用第三方社区仓库，例如
  [lihaohong6/BlueArchiveModels](https://github.com/lihaohong6/BlueArchiveModels)。
  该仓库非本项目维护，内容为游戏资源再分发，**请自行确认其使用条款与合法性**。
- **官方语音**：仅使用你拥有使用权、或已获得授权的音频。
- **训练素材**：同上，详见 [VOICE_TRAINING.md](VOICE_TRAINING.md)。

## 版权提醒

_Blue Archive_ 及其角色版权归 NEXON Games / Yostar 所有。
本项目是非官方同人项目，不提供、也不鼓励分发官方资源。

如果你把素材放进仓库并公开，风险由你自行承担；仓库默认配置已阻止提交
`private/` 目录。
