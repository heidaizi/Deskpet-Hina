# 开发指南

## 环境

- macOS 13+，Node.js 22+
- 安装依赖：`npm install`

## 常用命令

| 命令                  | 作用                              |
| --------------------- | --------------------------------- |
| `npm run dev`         | 开发模式启动                      |
| `npm run build`       | 类型检查 + 构建                   |
| `npm run verify`      | 类型检查 + 格式检查 + 单测 + 构建 |
| `npm test`            | 单元测试                          |
| `npm run test:e2e`    | Playwright E2E（需要私有素材）    |
| `npm run package:app` | 构建并安装到 `~/Applications`     |

## 目录

```
src/main        主进程
src/preload     IPC 桥
src/renderer    渲染进程（桌宠/聊天/设置）
src/shared      共享类型与纯函数
content         对话、好感度、术语表、语音清单
scripts         构建、打包、语音训练
tests/unit      单测
tests/e2e       E2E
```

## 约定

- TypeScript strict；新增类型优先放 `src/shared`；
- 纯逻辑抽成函数/模块，便于单测；
- 提示词相关改动附带断言测试；
- 提交前跑 `npm run verify`。

## 打包说明

`scripts/package-macos-app.zsh` 负责：

1. 生成 `.icns`（源图 `docs/acceptance/hina-app-icon-source.png`）
2. 组装 `.app`（`out/`、`content/`、素材、`node_modules` 运行时依赖）
3. 使用 `scripts/deskpet.entitlements` 签名
4. 安装到 `~/Applications`

没有本地证书时退化为 ad-hoc 签名；重新签名会重置系统授权。

## 测试

- 单测不依赖角色素材；
- E2E 需要 3D 模型与语音，缺素材时会跳过；
- E2E 使用临时 userData，不影响你的真实存档。
