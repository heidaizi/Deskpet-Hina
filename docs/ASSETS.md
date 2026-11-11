# 素材说明

## 仓库内已包含

| 素材              | 路径                                                                             | 许可                               |
| ----------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| 3D 模型（GLB）    | `assets/characters/hina-swimsuit/private/3d/official/hina-swimsuit-official.glb` | [个人非商业](../LICENSE-ASSETS.md) |
| 语音模型（AIVMX） | 通过 [GitHub Releases](https://github.com/heidaizi/Deskpet-Hina/releases) 下载   | [个人非商业](../LICENSE-ASSETS.md) |

两者都**仅允许个人、非商业使用**。商业用途、转售、付费分发均被禁止。

## 2D 形象说明

当前 2D 渲染（`2d-placeholder`）只使用**演示模型**，用于功能验证：

- 最终 2D 形象尚未确定，仍在设计中；
- **不建议**用于宣传、展示或二次分发；
- 后续版本会提供正式的 2D 素材。

如果你只想看功能效果，可以继续使用；正式发布前请以 3D 模型为准。

## 需要自行准备

| 素材         | 路径                                     | 必需 |
| ------------ | ---------------------------------------- | ---- |
| 官方语音片段 | `private/audio/official-denoise45/*.wav` | 否   |
| 预生成语音   | `private/audio/generated-dialogue/*.wav` | 否   |

官方语音与训练数据**不包含**在仓库中，且不建议分发。

缺少音频时，固定台词会自动改为实时合成，不影响使用。

## 目录结构

```
assets/characters/hina-swimsuit/private/
├── README.md
├── 3d/
│   └── official/
│       └── hina-swimsuit-official.glb     # 已包含
└── audio/
    ├── official-denoise45/               # 可选
    └── generated-dialogue/               # 可选
```

## 安装语音模型

1. 打开 Releases 页面，下载 `hina.aivmx`（约 238MB）
2. 放到：

```bash
mkdir -p "$HOME/Library/Application Support/AivisSpeech-Engine/Models"
cp ~/Downloads/hina.aivmx "$HOME/Library/Application Support/AivisSpeech-Engine/Models/"
```

3. 重启应用，确认引擎识别：

```bash
curl -s http://127.0.0.1:10101/speakers | head -c 300
```

模型 speaker 名与样式约定见 [SETUP.md](SETUP.md)。

## 版权提醒

_Blue Archive_ 及角色「空崎ヒナ」版权归 **NEXON Games / Yostar** 所有。
语音模型由公开语音素材训练得到，不授予任何声音表演者权利。

本仓库的「禁止商用」声明只表达项目意图，**不能替代**权利方的授权。
如果你要用于商业场景，请自行取得授权。

## 自己训练模型

如果想使用自己的声音数据，见 [VOICE_TRAINING.md](VOICE_TRAINING.md)。
