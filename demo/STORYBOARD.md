# 演示视频分镜与旁白

目标长度：**75 秒**（主视频）。另附 15 秒 teaser 剪辑点。

录制规格：1440p 或 1080p / 60fps；OBS 录制系统声音 + 麦克风。

## 分镜表

| #   | 时间      | 画面                     | 操作                               | 屏幕文字                   | 旁白（中文）                           |
| --- | --------- | ------------------------ | ---------------------------------- | -------------------------- | -------------------------------------- |
| 1   | 0:00–0:04 | 桌面全景，日奈在角落待机 | 无                                 | 空崎ヒナ · 桌面陪伴        | 这是运行在我 Mac 上的日奈。            |
| 2   | 0:04–0:09 | 日奈特写                 | 拖拽、点击头部                     | 可拖拽 / 有情绪反应        | 她可以拖动，会回应我的互动。           |
| 3   | 0:09–0:17 | 聊天窗                   | 发送「在吗？今天有点累。」         | 对话 + 本地语音            | 她记得上下文，会用自己训练的声音回答。 |
| 4   | 0:17–0:25 | 聊天窗                   | 发送「你还记得我昨天说过什么吗？」 | 长期记忆                   | 长期记忆让她记得之前聊过的事。         |
| 5   | 0:25–0:32 | 设置页关系标签           | 展示等级、阶段、经验               | 关系成长 / 四阶段          | 互动会积累好感，关系阶段会改变语气。   |
| 6   | 0:32–0:41 | 聊天窗                   | 发送「你能知道我现在在做什么吗？」 | 屏幕与页面感知             | 她能看到我在做什么，但只在本机处理。   |
| 7   | 0:41–0:50 | 聊天窗                   | 发送「用一句话说说你现在的心情。」 | 情绪与主动性               | 她有自己的情绪，也会主动开口。         |
| 8   | 0:50–0:58 | 桌面 / 桌宠              | 等待主动问候或切回待机             | 每小时问候 · 分寸感        | 她知道什么时候该安静。                 |
| 9   | 0:58–1:08 | 代码/架构快速切换        | 可选：终端、文档                   | Electron · 本地 TTS · 记忆 | 核心能力全部本地运行。                 |
| 10  | 1:08–1:15 | 标题卡                   | 淡入                               | GitHub 地址 + 声明         | 开源项目，模型仅限个人非商业使用。     |

## 完整旁白稿

> 这是运行在我 Mac 上的日奈。
>
> 她可以拖动、可以互动，有自己的情绪和反应。
>
> 和她说话时，她会用自己训练的语音模型回答——声音完全在本地合成。
>
> 她记得我们之前聊过什么，也会随着相处改变语气。
>
> 打开屏幕感知后，她知道我正在看什么、在做什么；这些数据只在本机处理，只有对话内容会发给我自己的 API。
>
> 她也有自己的情绪，会关心我，也会在合适的时候主动开口——而不是一直打扰。
>
> 整个项目是开源的，代码、3D 模型和训练好的语音模型都可以在 GitHub 找到。仅限个人非商业使用。

## 英文旁白（可选，YouTube 版）

> This is Hina, running on my Mac.
>
> She can be dragged around, reacts to interaction, and has her own mood.
>
> When we talk, she answers with a locally trained voice model — synthesis stays on this machine.
>
> She remembers our past conversations and adjusts her tone as the relationship grows.
>
> With screen awareness enabled, she knows what I'm working on. That data stays local; only the conversation is sent to my own API.
>
> She has feelings, checks in on me, and speaks up at the right moment instead of interrupting.
>
> The project is open source — code, 3D model and the trained voice model are on GitHub. Personal, non-commercial use only.

## 录制技巧

- **每段单独录**：3～5 秒一个镜头，剪辑时拼接，避免冷场；
- **剪掉等待**：DeepSeek 回复和引擎启动的时间全部剪掉；
- **语音优先**：第 3 镜头一定要保留完整的一句语音，这是最大卖点；
- **放大**：桌宠画面放大 1.5～2 倍，或调大 `modelScale`；
- **字幕**：日语语音配中文字幕；关键能力用短标签（如「本地语音模型」）；
- **音乐**：低音量 lo-fi / 钢琴，-24 LUFS 左右，不要盖过语音。

## 15 秒 Teaser 剪辑点

| 时间   | 内容                           |
| ------ | ------------------------------ |
| 0–3s   | 日奈待机 + 光环                |
| 3–8s   | 一句语音（「老师，回来了？」） |
| 8–12s  | 屏幕感知提问的回复             |
| 12–15s | 标题卡（只留名字 + GitHub）    |

## 标题卡

- 文件：`demo/title-card.png`（3840×2160）
- 源文件：`demo/title-card.html`，改文字后用 Electron 重新渲染：

```bash
env -u ELECTRON_RUN_AS_NODE npx electron /tmp/render-card.js
```

## 发布前检查

- [ ] 没有露出 API Key、文件路径、私人聊天
- [ ] 字幕与语音对齐
- [ ] 视频描述包含：非官方同人、个人非商业、GitHub 链接
- [ ] 封面使用标题卡或日奈特写（不要用 2D 占位形象）
