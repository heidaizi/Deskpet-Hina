# 素材说明

## 仓库内已包含

| 素材         | 路径                                                                 | 许可       |
| ------------ | -------------------------------------------------------------------- | ---------- |
| 泳装 3D 模型 | `private/3d/official/swimsuit.glb`                                   | 个人非商业 |
| 礼服 3D 模型 | `private/3d/official/dress.glb`                                      | 个人非商业 |
| 常服 3D 模型 | `private/3d/official/normal.glb`                                     | 个人非商业 |
| 语音模型     | [GitHub Releases](https://github.com/heidaizi/Deskpet-Hina/releases) | 个人非商业 |

以上素材**仅允许个人、非商业使用**，详见 [LICENSE-ASSETS.md](../LICENSE-ASSETS.md)。
商业用途、转售、付费分发均被禁止。

## 2D 形象说明

当前 2D 渲染（`2d-placeholder`）只是演示占位：

- 最终 2D 形象尚未确定；
- **不建议**用于宣传、展示或二次分发；
- 后续版本会提供正式素材。

正式展示请使用三套 3D 模型。

## 需要自行准备（可选）

| 素材           | 路径                                                   | 说明                     |
| -------------- | ------------------------------------------------------ | ------------------------ |
| 各服装官方语音 | `private/audio/outfit/<swimsuit\|dress\|normal>/*.ogg` | 登录、返回与日常互动语音 |
| 固定台词原声   | `private/audio/official-denoise45/*.wav`               | 泳装固定台词             |
| 预生成语音     | `private/audio/generated-dialogue/*.wav`               | 无官方片段时的预生成 TTS |

官方语音与训练数据**不包含**在仓库中，也不建议分发。

缺少音频时的行为：

- 官方语音缺失 → 该场景改用 TTS，不会串用其他服装的声音；
- 预生成语音缺失 → 首次合成后写入本机缓存。

## 目录结构

```
assets/characters/hina-swimsuit/private/
├── README.md
├── 3d/
│   └── official/
│       ├── swimsuit.glb    # 已包含
│       ├── dress.glb       # 已包含
│       └── normal.glb      # 已包含
└── audio/
    ├── outfit/             # 可选：各服装官方语音
    │   ├── swimsuit/
    │   ├── dress/
    │   └── normal/
    ├── official-denoise45/ # 可选
    └── generated-dialogue/ # 可选
```

## 安装语音模型

1. 从 Releases 下载 `hina.aivmx`（约 238MB）
2. 放到：

```bash
mkdir -p "$HOME/Library/Application Support/AivisSpeech-Engine/Models"
cp ~/Downloads/hina.aivmx "$HOME/Library/Application Support/AivisSpeech-Engine/Models/"
```

3. 重启应用并确认：

```bash
curl -s http://127.0.0.1:10101/speakers | head -c 300
```

## 自己训练

想使用自己的声音数据，见 [VOICE_TRAINING.md](VOICE_TRAINING.md)。

## 版权提醒

_Blue Archive_ 及角色「空崎ヒナ」版权归 **NEXON Games / Yostar** 所有。
本项目是非官方同人项目，不提供也不鼓励分发官方资源。
