# 演示模式

用于录制介绍视频：**关闭窗口的内容保护**，并自动按脚本驱动聊天流程。

## 启动

### 开发模式

```bash
DESKPET_DEMO=1 npm run dev
```

### 已打包应用

先退出正在运行的实例，再带环境变量启动：

```bash
DESKPET_DEMO=1 ~/Applications/空崎日奈.app/Contents/MacOS/Electron
```

> 用 LaunchAgent 启动的应用无法直接传环境变量；录演示时用上面的命令即可。

## 演示模式做了什么

1. 关闭对话窗/设置窗的 `setContentProtection`，让录屏能看到它们；
2. 等应用就绪后自动打开聊天窗；
3. 按 `demo/demo-script.json` 依次发送消息，等待回复后继续；
4. 中途打开设置页的关系标签；
5. 同时预热 AivisSpeech 引擎，避免第一句等 10 秒。

流程结束不会退出应用，方便你继续补录镜头。

## 脚本格式

`demo/demo-script.json`：

```json
{
  "steps": [
    { "type": "wait", "ms": 3000 },
    { "type": "chat", "text": "在吗？今天有点累。", "waitForReply": true, "ms": 3500 },
    { "type": "settings", "tab": "relationship", "ms": 4500 },
    { "type": "note", "text": "结束" }
  ]
}
```

| 字段           | 说明                                  |
| -------------- | ------------------------------------- |
| `type`         | `chat` / `wait` / `settings` / `note` |
| `text`         | 聊天内容或日志文字                    |
| `ms`           | 该步骤结束后的停顿（毫秒）            |
| `tab`          | 设置页标签 id，如 `relationship`      |
| `waitForReply` | 是否等待日奈回复后再继续              |

可以直接改这个文件来调整演示内容，不需要重新打包。

## 录制前检查

- [ ] DeepSeek API Key 已配置
- [ ] 屏幕录制权限已授予（要演示「知道我在做什么」）
- [ ] 演示脚本里的问题能得到预期回答（建议先试跑一遍）
- [ ] 关闭通知、隐藏无关窗口
- [ ] 需要系统声音时使用 OBS + BlackHole

## 注意

- 演示模式会发送**真实 API 请求**，产生少量费用；
- 演示模式只用于录屏，日常使用不要开启；
- 关闭内容保护期间，对话内容会出现在录屏中，注意隐私。

分镜与旁白见 [STORYBOARD.md](STORYBOARD.md)；标题卡为 `title-card.png`（由 `title-card.html` 渲染，3840×2160）。
