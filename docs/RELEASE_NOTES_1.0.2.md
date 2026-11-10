# Deskpet v1.0.2 发布说明

> 发布日期：2026-10-26  
> 类型：托起动作持续循环修复  
> 发布范围：仅本机安装版，不包含在 v1.0.1 迁移包中

## 修复

- 托起日奈时显式启动 `Formation_Pickup` 持续循环动作。
- 拖拽保持期间不再执行 1.8 秒自动完成/恢复。
- 指针松开后才中断循环并播放 `drag_end`。
- 保留 GLB 的实际 clip 时长、播放时间和循环圈数诊断。
- 修复拖拽响应返回时 `isDragHold` 作用域错误，正确区分按住与已松开。

## 验收

- `Formation_Pickup` 完整播放约 4.97 秒后会回绕到下一圈。
- 持续拖拽超过一个完整周期后 clip 仍保持 `Formation_Pickup`。
- `data-model-clip-cycles` 从 0 增加到 1。
- Electron E2E：19/19 通过。

## 迁移包说明

本补丁按用户要求不写入迁移包。  
迁移包保持：

```text
Deskpet-transfer-1.0.1-macos-arm64.zip
```
