# 贴纸 / 表情包

贴纸按 **服装** 分组：泳装、礼服、常服各用自己的一套。

## 放在哪里

```
assets/characters/hina-swimsuit/private/stickers/
├── manifest.json
└── hina-face/
    ├── hina-swimsuit-calm.png
    ├── hina-dress-smile.png
    └── hina-default-grin.png
```

`private/` 已被 git 忽略，不会进入公开仓库。

## manifest.json

```json
{
  "schemaVersion": 2,
  "outfits": {
    "hina-swimsuit": {
      "stickers": [
        {
          "id": "swimsuit-calm-1",
          "file": "hina-face/hina-swimsuit-calm.png",
          "label": "平静",
          "adjective": "calm",
          "emotion": "calm",
          "tags": ["calm", "calm"]
        }
      ]
    },
    "hina-dress": { "stickers": [] },
    "hina-normal": { "stickers": [] }
  }
}
```

| 字段        | 说明                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| `id`        | 小写字母/数字/`-`/`_`，最长 64，全局唯一                               |
| `file`      | 相对 manifest 的路径；支持 PNG/JPG/WebP/GIF                            |
| `label`     | 中文形容词，显示在贴纸下方                                             |
| `adjective` | 文件名里的英文形容词                                                   |
| `emotion`   | `happy` / `embarrassed` / `annoyed` / `calm` / `surprised` / `worried` |
| `tags`      | 可选，预留筛选                                                         |

单张不超过 3MB；非法条目、重复 id、缺失文件会被跳过。

## 服装对应

| 素材前缀          | 应用内服装 |
| ----------------- | ---------- |
| `hina-swimsuit-*` | 泳装       |
| `hina-dress-*`    | 礼服       |
| `hina-default-*`  | 常服       |

## 使用方式

**手动**

聊天窗点「贴纸」→ 只显示当前服装的表情 → 选中发送。

- 聊天里出现图片
- 桌宠旁边浮出同一张图，约 3 秒淡出
- 发送时会校验服装，不能把泳装贴纸发给常服

**自动**

设置 → 行为 → 「情绪贴纸」：

- 回复带明显情绪时，自动挑一张同情绪、同服装的贴纸
- 中性回复不贴
- 同一情绪会按回复文本稳定选择，不会每次乱跳

## 当前素材

- 泳装 11 张
- 礼服 18 张
- 常服 21 张
