# 日奈泳装 3D 资产交付合同

> 适用阶段：M4 及以后
> 当前状态：运行时已接入用户授权的官方泳装日奈 Q 版 GLB，同时保留通用 VRM 管线

## 1. 文件格式

项目支持两种 3D 模型：

- 官方游戏导出的 glTF 2.0 二进制 `.glb`，使用 `GLBPetRenderer`。
- VRM 0.0/1.0 的 `.vrm` 或 `.glb`，使用 `VRMRenderer`。

两种模型都应保存为单个内嵌资源的文件，避免绝对路径依赖。

最低要求：

- glTF 2.0 / VRM 1.0
- UTF-8 元数据
- 内嵌纹理，或提供完整相对路径资源
- 不在模型外依赖机器绝对路径

## 2. 人形骨骼

至少需要 VRM humanoid 标准骨骼：

- hips
- spine
- chest / upperChest
- neck
- head
- leftShoulder / rightShoulder
- leftUpperArm / rightUpperArm
- leftLowerArm / rightLowerArm
- leftHand / rightHand
- leftUpperLeg / rightUpperLeg
- leftLowerLeg / rightLowerLeg
- leftFoot / rightFoot
- leftEye / rightEye

首版动画只使用标准人形骨骼完成待机、头部、手臂和腿部动作，不要求包含外部动画片段。

## 3. 表情

优先提供 VRM 标准 preset：

- neutral
- happy
- angry
- relaxed
- sad
- surprised
- blink
- blinkLeft
- blinkRight

桌宠表情映射：

| 桌宠表情    | VRM 映射                 |
| ----------- | ------------------------ |
| neutral     | neutral + 自动眨眼       |
| happy       | happy                    |
| annoyed     | angry                    |
| embarrassed | relaxed + happy 轻微混合 |
| sleepy      | blink                    |
| surprised   | surprised                |

缺少某个表情时，渲染器保持 neutral，不影响其他动作。

## 4. 视线

需要：

- VRM lookAt 配置
- 头部和眼球可转动
- offsetFromHeadBone 正确
- 左右上下范围合理

如果模型只有头部注视没有眼球骨骼，仍可使用，但视线跟随会以头动为主。

## 5. 头发、角和配件

- 长发建议配置 VRMC_springBone。
- 角、光环和橡皮圈作为独立节点，便于后续换装或显隐。
- 光环需要保持自身发光材质，不应依赖场景灯光过强照亮。
- 角与光环可以作为头部骨骼的子节点。

## 6. 材质

推荐：

- VRM MToon
- 透明背景
- 不使用大面积地面和背景板
- 头发、皮肤、衣服分别使用独立材质
- 轮廓线宽度适合 340×460 的桌面窗口

当前渲染器使用透明 WebGL 画布、HemisphereLight、主光和轮廓光。正式模型不应依赖高强度灯光才能正常显示。

## 7. 性能预算

建议首版：

- 三角面数：约 30k～80k
- 材质数量：尽量不超过 20
- 2K 以下纹理为主
- 头发生命周期和 spring bone 数量适中
- 模型文件尽量小于 40 MB

3D 模式空闲时目标 30 FPS 以上，并避免在窗口隐藏或完全穿透时进行不必要的高频渲染。

## 8. 动作适配

统一动作 ID：

```text
idle
look_at_cursor
walk
sleep
wake
tap_head
tap_horn
tap_halo
tap_body
headpat
drag_start
drag_loop
drag_end
happy
annoyed
embarrassed
surprised
feed
wave
stretch
```

3D 首版由程序骨骼动作实现，正式模型需要保证标准骨骼方向一致。后续如果提供 AnimationClip，可继续使用统一动作 ID 映射。

## 9. 元数据与许可

VRM metadata 必须明确：

- 模型名称
- 作者
- 著作权信息
- avatarPermission
- commercialUsage
- allowRedistribution
- modification
- creditNotation
- license URL

如果只是个人自用，也应保留作者和来源记录。正式素材放入：

```text
assets/characters/hina-swimsuit/private/3d/
```

该目录已被 `.gitignore` 排除。

## 10. 当前模型

正式接入：

```text
assets/characters/hina-swimsuit/private/3d/official/hina-swimsuit-official.glb
```

该文件为用户提供并声明已获授权的官方泳装日奈 Q 版资源。目录被 `.gitignore` 排除，不得提交或再分发。技术细节见 `docs/OFFICIAL_GLB_MODEL_REPORT.md`。

通用 VRM 回退测试模型仍保留：

```text
assets/characters/placeholder/three-vrm-sample.vrm
```

来源为 `pixiv/three-vrm` 官方示例，许可记录见同目录 `README.md`。它不是日奈角色，只用于回归验证 VRM 加载、骨骼、表情、视线、点击和 2D/3D 切换。
