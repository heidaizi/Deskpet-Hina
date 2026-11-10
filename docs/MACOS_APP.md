# macOS 双击启动与打包

> 更新日期：2026-10-22  
> 适用：用户本机个人使用

## 1. 快捷启动

应用已安装到：

```text
~//Applications/日奈桌宠.app
```

可以在 Finder 的“应用程序”中双击，也可以在 Launchpad 或 Spotlight 中搜索“日奈桌宠”。

应用启动后仍和开发模式使用相同的菜单栏托盘、设置窗口、角色状态和鼠标交互。

## 2. 重新打包

代码或素材更新后执行：

```bash
npm run package:app
```

脚本会：

1. 执行生产构建和类型检查。
2. 复制本机 Electron 运行时。
3. 将 `out/`、`content/` 和用户授权的官方 GLB 打包进应用。
4. 生成日奈应用图标。
5. 使用本机 ad-hoc 签名校验应用。
6. 覆盖安装 `~/Applications/日奈桌宠.app`。

## 3. 文件位置

构建产物：

```text
dist/日奈桌宠.app
```

安装位置：

```text
~/Applications/日奈桌宠.app
```

应用图标源图：

```text
docs/acceptance/hina-app-icon-source.png
```

## 4. 说明

- 当前应用约 262 MB，主要是 Electron 运行时；官方语音约 580 KB。
- 使用 ad-hoc 签名，只适合用户本机运行，不是可公开分发的 Apple Developer 签名版本。
- 官方 GLB 会进入本机应用包，因此不得把这个 `.app` 直接分发给其他人。
- 角色状态、设置和窗口位置仍保存在 Electron 的应用数据目录中。

## 5. 打包脚本

```text
scripts/package-macos-app.zsh
```

脚本只复制模型运行时实际需要的私有 GLB，不会把 `private/references/` 中的同人参考图一起打包。

## 6. 跨设备迁移

完整迁移包通过以下命令生成：

```bash
npm run transfer:bundle
```

该包包含可运行应用、源码快照、官方 GLB、固定语音、本地 TTS 必需模型和恢复脚本。DeepSeek Key、缓存、日志与训练中间产物不会进入迁移包。详细说明见 `docs/TRANSFER_GUIDE.md`。
