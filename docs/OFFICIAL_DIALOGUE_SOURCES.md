# 日奈（泳装）官方语音台词来源

> 更新日期：2026-10-24  
> 用途：本机个人桌宠的点击、长按、拖拽、暂停和自动行为  
> 范围：引用适合交互场景的短句，并在私有目录保存对应的官方日语语音

## 1. 来源

官方语音与日文/英文转录：

```text
https://bluearchive.wiki/wiki/Hina_(Swimsuit)/audio
```

中文角色资料：

```text
https://wiki.biligame.com/ba/HinaSwimsuit
```

Blue Archive Wiki 的音声页按官方语音分类列出 `Cafe_monolog`、`LogIn`、`Lobby`、`EventLobby`、`Relationship_Up`、战斗和生日等片段。项目只选取与点击、好感、疲惫和陪伴语义相符的短句。

## 2. 中文文本说明

- `official-cn`：碧蓝档案中文 Wiki 角色资料中可直接核对的中文文本。
- `project-cn`：依据官方日文原文和 Blue Archive Wiki 英文转录整理的项目简中短句，不冒充现有简中客户端的逐字文本。
- `content/dialogues.json` 的每个官方条目都保留源页面、语音 Clip 名、日文原文和译文类型。

## 3. 当前映射

| 桌宠场景       | 文本                                                                 | 官方 Clip            | 译文本类型    |
| -------------- | -------------------------------------------------------------------- | -------------------- | ------------- |
| 点击头部       | 这件泳装，不奇怪吗……？                                               | `Cafe_monolog_1`     | `project-cn`  |
| 点击头部       | 倒也不是期待，或者一直盼着……。那个，只有一点点而已……。               | `Lobby_2`            | `project-cn`  |
| 点击头部       | 夏季训练合宿。没想到今年会和老师一起……有点新鲜。                     | `EventLobby_3`       | `project-cn`  |
| 低心情点击头部 | 唉，真是的……！                                                       | `Battle_Damage_2`    | `project-cn`  |
| 低心情点击头部 | 差不多该放弃了吧？                                                   | `ExSkill_Level_1`    | `project-cn`  |
| 点击身体       | 也许是训练的缘故……身体有点发沉。                                     | `Cafe_monolog_2`     | `project-cn`  |
| 点击身体       | 训练固然好，但休息也很重要？……确实这也很有道理。可是，我不能偷懒。   | `Lobby_3`            | `project-cn`  |
| 点击身体       | 不用就浪费了。                                                       | 角色资料背景         | `official-cn` |
| 高好感长按     | 有什么我能做的……？谢谢你，老师。光是这么说，我就很高兴。             | `Lobby_4`            | `project-cn`  |
| 高好感长按     | 直到这个夏天结束的最后一刻……我都会在老师身边，帮助你。               | `Lobby_5`            | `project-cn`  |
| 高好感长按     | 今年夏天，也能和老师在一起呢。                                       | `Relationship_Up_1`  | `project-cn`  |
| 双击头部       | 唉……还在啊？                                                         | `Battle_Move_2`      | `project-cn`  |
| 拖拽           | 诶，总之先一起跳进海里吧？等、等一下老师！我、我还没做好心理准备……！ | `Season_Birthday_2`  | `project-cn`  |
| 互动冷却       | 也许是训练的缘故……身体有点发沉。                                     | `Cafe_monolog_2`     | `project-cn`  |
| 互动暂停       | 训练固然好，但休息也很重要？……确实这也很有道理。可是，我不能偷懒。   | `Lobby_3`            | `project-cn`  |
| 启动问候       | 啊，欢迎回来，老师。训练的准备已经做好了。                           | `LogIn_1`            | `project-cn`  |
| 自动挥手       | 老师？有什么我能帮忙的吗？                                           | 本地 TTS，无固定语音 | `project-cn`  |

## 4. 使用边界

这些短句仅用于用户本机的角色互动。不要把语音文件、完整台词表或包含大量官方文本的数据随应用公开分发。

## 5. 官方日语语音

本地声音文件：

```text
assets/characters/hina-swimsuit/private/audio/official/
```

当前共 13 个 Ogg Vorbis 单声道语音 Clip。每个文件都记录在：

```text
assets/characters/hina-swimsuit/private/audio/official/manifest.json
```

清单包含：

- 官方 Clip 名称
- Blue Archive Wiki 文件页
- 原始下载 URL
- 时长、字节数、MIME
- SHA-256

重新获取：

```bash
npm run assets:voices
```

“不用就浪费了”来自角色资料文本，没有对应的选中语音 Clip，因此该条保持纯文字。

## 6. 随机语音与动作

设置页新增“随机语音与动作”开关，默认开启。

空闲时，自动行为会以较低概率抽取一段官方语音，并播放预先配对的官方动作，例如：

- `Cafe_monolog_1` + `Cafe_Idle`
- `Lobby_4` / `Lobby_5` + `Public01`
- `LogIn_1` + `Normal_Callsign`
- `Season_Birthday_2` + `Vital_Panic`
- `ExSkill_Level_1` + `Normal_Attack_Start`

随机选择会避开上一段语音，避免连续重复。拖拽、完全穿透或窗口隐藏时不会触发。

## 7. 扩充声线训练语料

声线训练不等同于运行时交互语音，因此使用同一语音页的更大子集：

```text
https://bluearchive.wiki/wiki/Hina_(Swimsuit)/audio
```

截至 2026-10-23：

- 页面共有 83 段泳装日奈 OGG 语音。
- 80 段带日文台词。
- 排除 1 段不足 0.8 秒的语气音后，保留 79 段。
- 训练语料总时长约 472.7 秒（7 分 53 秒）。
- 覆盖日常、纪念大厅、好感、活动、季节、成长、战斗和技能台词。
- 下载后按音频 SHA-256 去重。

私有原始语料：

```text
assets/characters/hina-swimsuit/private/audio/training/source-expanded/
assets/characters/hina-swimsuit/private/audio/training/hina-training-expanded.json
```

重建命令：

```bash
npm run tts:fetch-hina-expanded
npm run tts:prepare-hina-expanded
```

目录、台词和来源清单均保留原始 URL、字节数及 SHA-256。训练素材仍只用于本机私有声线模型。
