# Deskpet 安装与依赖清单

> 审计日期：2026-10-22  
> 目标阶段：M0 项目骨架、M1 透明桌宠技术原型  
> 目标平台：当前个人 Mac（Apple Silicon / macOS 27）

## 1. 当前环境审计

| 项目               | 状态   | 当前版本 / 路径             | M0/M1 是否必需 |
| ------------------ | ------ | --------------------------- | -------------- |
| macOS              | 已具备 | macOS 27.0.1                | 是             |
| CPU 架构           | 已具备 | arm64                       | 是             |
| Node.js            | 已具备 | v24.20.0                    | 是             |
| npm                | 已具备 | 11.19.0                     | 是             |
| npm registry 网络  | 可用   | 连接正常                    | 是             |
| Git                | 已具备 | `/usr/bin/git`              | 是             |
| Command Line Tools | 已具备 | 版本 27.0.0.0               | 是             |
| clang              | 已具备 | Apple clang 21.0.0          | 是             |
| Homebrew           | 已具备 | `/opt/homebrew/bin/brew`    | 否             |
| Python astro 环境  | 已具备 | Python 3.12.14              | 否             |
| 可用磁盘           | 充足   | 约 820 GiB                  | 是             |
| 完整 Xcode.app     | 未安装 | 当前只有 Command Line Tools | 否             |

结论：

- M0/M1 不需要再安装 Homebrew 系统包。
- M0/M1 不需要完整 Xcode.app。
- 所需依赖全部安装在仓库的 `node_modules/` 中，不进行全局安装。

## 2. 需要安装的项目依赖

### 2.1 运行时依赖

| npm 包     | 版本 | 用途                          |
| ---------- | ---- | ----------------------------- |
| `electron` | 45.x | macOS 桌面容器                |
| `pixi.js`  | 8.x  | M1 占位角色 2D 渲染与点击热区 |

### 2.2 开发依赖

| npm 包             | 版本         | 用途                                  |
| ------------------ | ------------ | ------------------------------------- |
| `electron-vite`    | 6.x          | Electron 主进程、预加载和渲染进程构建 |
| `vite`             | 7.x          | 前端开发服务器和构建                  |
| `typescript`       | 最新兼容版本 | 类型检查与源码编译                    |
| `@types/node`      | 最新兼容版本 | Node.js 类型                          |
| `vitest`           | 5.x          | 单元测试                              |
| `@playwright/test` | 1.x          | Electron 冒烟测试，不额外下载浏览器   |
| `prettier`         | 3.x          | 代码格式化                            |

### 2.3 后续阶段再安装

| npm 包             | 计划阶段 | 用途                                |
| ------------------ | -------- | ----------------------------------- |
| `electron-builder` | M7       | 生成正式 `.app` 和分发产物          |
| 2D 骨骼运行时      | M3/M5    | Spine 或 Live2D，取决于最终 2D 资产 |
| VRM 相关包         | M4       | Three.js、`@pixiv/three-vrm` 等     |

## 3. 安装命令

在项目根目录执行：

```bash
npm install electron@45 pixi.js@8
npm install -D electron-vite@6 vite@7 typescript @types/node vitest@5 @playwright/test prettier
```

安装完成后记录：

```bash
npm ls --depth=0
```

## 4. 暂时不需要安装

- Docker
- Unity
- Godot
- Live2D Cubism
- Spine Editor
- Blender
- Rust / Cargo
- 额外浏览器

这些工具与当前 M0/M1 的“透明窗口与交互技术原型”没有直接关系。正式角色资产进入 M3/M4 后再按需要安装。

## 5. 系统权限

M0/M1 不需要授予：

- 辅助功能
- 屏幕录制
- 麦克风
- 摄像头
- 输入监控

如果后续系统只能通过轮询光标位置实现鼠标穿透，也不需要辅助功能权限。

## 6. 安装验收

- [x] `npm install` 完成且无高危安装错误
- [x] `npm ls --depth=0` 能显示全部直接依赖
- [x] `npx electron --version` 能运行
- [x] `npx tsc --version` 能运行
- [x] `npm run dev` 能启动 Electron
- [x] 开发日志记录安装结果

## 7. 实际安装结果

安装时间：2026-10-22 15:03 CST

| 包                 | 实际版本 |
| ------------------ | -------- |
| `electron`         | 45.0.0   |
| `pixi.js`          | 8.22.0   |
| `electron-vite`    | 6.0.0    |
| `vite`             | 7.3.7    |
| `typescript`       | 7.0.2    |
| `@types/node`      | 24.19.2  |
| `vitest`           | 5.0.5    |
| `@playwright/test` | 1.64.1   |
| `prettier`         | 3.9.10   |

补充说明：

- `npm audit` 结果为 0 个漏洞。
- Electron 官方 GitHub 二进制下载在当前网络下超时。
- 已使用 Electron 支持的镜像环境变量完成二进制下载：

```bash
ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/' \
  node node_modules/electron/install.js
```

- 安装后 `npx electron --version` 返回 `v45.0.0`。
- npm 11 对 `esbuild` 和 `fsevents` 的安装脚本给出审核提示，但实际构建与测试均通过，不阻塞 M0/M1。

## 8. M4 VRM 补充依赖

安装时间：2026-10-22 16:10 CST

| 包                 | 实际版本 | 用途                     |
| ------------------ | -------- | ------------------------ |
| `three`            | 0.186.1  | WebGL 3D 渲染            |
| `@pixiv/three-vrm` | 3.5.5    | VRM 1.0 加载、骨骼和表情 |
| `@types/three`     | 0.186.0  | Three.js TypeScript 类型 |

官方泳装日奈 GLB 与通用 VRM 回退模型：

```text
assets/characters/hina-swimsuit/private/3d/official/hina-swimsuit-official.glb
assets/characters/placeholder/three-vrm-sample.vrm
```

官方 GLB 的来源、授权声明、结构、动画和运行方式见 `docs/OFFICIAL_GLB_MODEL_REPORT.md`。通用 VRM 的许可记录在 placeholder 目录的 `README.md`。

## 9. 本地日奈声线补充依赖

安装时间：2026-10-22 21:40 CST

| 项目              | 实际版本 / 路径                                | 用途                            |
| ----------------- | ---------------------------------------------- | ------------------------------- |
| 独立 Python 环境  | `~/.local/share/deskpet-tts/Irodori-TTS/.venv` | 训练与推理                      |
| Python            | 3.12.14                                        | Irodori 运行时                  |
| PyTorch           | 2.10.0                                         | Apple Silicon MPS               |
| Irodori-TTS       | v4.1-Small                                     | 基础语音模型                    |
| Semantic-DACVAE   | Japanese-32dim                                 | 音频声码器                      |
| Transformers      | 5.12.1                                         | 本地 tokenizer / 文本编码       |
| FastAPI / Uvicorn | 0.129.2 / 0.41.0                               | 本地 OpenAI-compatible TTS 服务 |

模型和检查点不放在仓库或 `.app` 内，默认占用约 3.5 GB：

```text
~/.local/share/deskpet-tts/
```

准备命令：

```bash
npm run tts:download-models
npm run tts:prepare-dataset
```

完整训练、启动、缓存和授权边界见 `docs/LOCAL_TTS.md`。
