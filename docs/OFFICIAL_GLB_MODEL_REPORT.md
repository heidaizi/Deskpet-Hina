# 官方泳装日奈 GLB 审计与接入报告

> 验收日期：2026-10-22  
> 阶段：M4 正式 3D 资产接入  
> 状态：已通过本机自动验收

## 1. 资产审计

本地文件：

```text
assets/characters/hina-swimsuit/private/3d/official/hina-swimsuit-official.glb
```

来源页面：

```text
https://bluearchive.wiki/wiki/Models#Hina
```

用户已声明取得该模型在个人桌宠中的使用授权。模型仍按私有、不可再分发素材管理。

| 项目        | 检测结果                                                           |
| ----------- | ------------------------------------------------------------------ |
| 容器        | glTF 2.0 Binary                                                    |
| 文件大小    | 5,805,824 bytes（约 5.5 MiB）                                      |
| SHA-256     | `dc924a0d66e69a0cd143b160a1a27d8cd3acef5f4844e8f14558949dadda51be` |
| 场景        | 1                                                                  |
| 节点        | 136                                                                |
| 网格        | 9                                                                  |
| 图元        | 13                                                                 |
| 顶点/三角形 | 43,738 / 13,745                                                    |
| 材质        | 13                                                                 |
| 内嵌 PNG    | 12                                                                 |
| Skin        | 3                                                                  |
| 动画        | 23                                                                 |
| 生成器      | `blue-archive model_viewer/export_models.py`                       |

这是一个带游戏骨骼和动作的原生 GLB，不包含 VRM 元数据，因此不能交给 `VRMRenderer`，需要单独的 GLB 渲染器。

## 2. 动画清单

模型包含以下 AnimationClip：

- 咖啡厅：`Cafe_Idle`、`Cafe_Reaction`、`Cafe_Walk`
- 编队：`Formation_Idle`、`Formation_Pickup`
- 战斗：`Exs`、`Vital_Death`、`Vital_Dying_ing`、`Vital_Panic`、`Vital_Retreat`
- 普通动作：`Normal_Idle`、`Normal_Attack_Delay`、`Normal_Attack_End`、`Normal_Attack_Ing`、`Normal_Attack_Start`、`Normal_Callsign`、`Normal_Reload`
- 移动：`Move_Ing`、`Move_End_Normal`
- 表现：`Victory_Start`、`Victory_End`、`Public01`、`Cutin`

桌宠统一动作现已映射到合适片段：

| 桌宠动作                                  | GLB AnimationClip   |
| ----------------------------------------- | ------------------- |
| idle / look_at_cursor / drag_end          | `Cafe_Idle`         |
| walk                                      | `Cafe_Walk`         |
| sleep / drag_loop                         | `Cafe_Idle`（降速） |
| tap_head / tap_horn / tap_halo / tap_body | `Cafe_Reaction`     |
| headpat                                   | `Cafe_Reaction`     |
| drag_start                                | `Formation_Pickup`  |
| surprised                                 | `Vital_Panic`       |
| happy                                     | `Public01`          |
| wave                                      | `Normal_Callsign`   |
| feed                                      | `Formation_Pickup`  |
| stretch                                   | `Normal_Reload`     |

未知或缺失片段会自动回退到 `Cafe_Idle`，不会导致加载失败。

除统一动作映射外，设置页新增“官方动作试演”，直接列出模型自带的全部 23 段 AnimationClip。任意片段都可以单独播放，循环动作保持循环，单次动作结束后回到 `Cafe_Idle`。

## 3. 运行时接入

### 模型选择

`content/character.json` 的 3D 条目指向官方 GLB。`src/renderer/src/main.ts` 根据扩展名在以下两条管线间选择：

- `.glb`：`GLBPetRenderer`，直接使用 Three.js `GLTFLoader`。
- `.vrm`：`VRMRenderer`，使用 `@pixiv/three-vrm`。

### 渲染与交互

- 透明 WebGL 画布，自动根据包围盒居中并适配 340×460 窗口。
- 使用模型原生 23 段骨骼动画，并支持循环、单次、速度和交叉淡入。
- 头部骨骼跟随鼠标；左右朝向通过轻微转身表现。
- 复用现有头部、身体点击热区和窗口拖拽逻辑。
- 隐藏 `CH0063_Weapon`、`fire_01`、`fire_02`，保留泳圈、角、光环和长发。
- 使用官方模型自带的五种嘴型节点，对应 neutral、happy、annoyed、embarrassed、sleepy、surprised。
- 切换回 2D 时停止动画、释放几何体、材质和纹理。
- 设置页提供 30%～100% 的模型缩放；缩放后自动更新头部和身体点击热区。
- 渲染器使用 1.5 倍超采样（像素比上限 3）、线性 mipmap、最高 16× 纹理各向异性过滤和 256×256 脚底软阴影。
- BrowserWindow 使用动态 interaction envelope：30% 时约 166×190，50% 时约 197×270，100% 时保留完整模型宽度。

### 视觉修缮

- 使用 ACES 色彩映射；在保留层次的前提下把曝光从 `0.95` 提亮到 `1.08`。
- 肤色和脸部材质加入暖桃色校正，主光与补光增加柔和粉色，提升肉色和可爱感。
- 主光、冷色轮廓光和正面补光重新配比，让长发、角和泳圈产生清晰层次。
- 身体、头发和泳圈使用六阶 `MeshToonMaterial`，保留官方贴图的同时呈现更接近游戏的卡通明暗。
- 脸部、眼睛、眉毛和嘴型使用不受灯光洗白的材质，保证桌面尺寸下五官清晰。
- 增加低透明度深紫外轮廓，改善浅色头发和浅色泳圈在明亮桌面上的可读性。
- 为光环叠加低强度加法辉光，保留黑色碎片和紫色主体的识别性。
- 原来像半圆地台的几何阴影改为跟随双脚位置的柔边接触阴影。
- 340×460 CSS 画布在 Retina DPR 2 下实际渲染为 680×920。

### CSP 修复

GLTFLoader 会把内嵌 PNG 转换成 `blob:` URL。原 CSP 不允许 `blob:` 连接和图片，导致模型轮廓正常但全部贴图退化成灰白色。

现已为主窗口和设置窗口加入：

```text
img-src 'self' data: blob:
connect-src 'self' blob: ws: http:
```

### 动画稳定性

每帧在 AnimationMixer 更新前恢复头部和脊柱初始旋转，再叠加视线或睡眠偏移，避免程序化旋转逐帧累积造成头部漂移。

## 4. 自动验收

本机执行：

```bash
npm run typecheck
npm run format:check
npm test
npm run build
npm run test:e2e
```

覆盖结果：

- TypeScript 主进程和渲染进程类型检查通过。
- 7 个单元测试文件、27 个单元测试通过。
- Electron 生产构建通过。
- 4 个 Playwright Electron 验收通过。
- 3D 加载断言：`23` 段动画、`0` 个缺失映射片段、`12` 张有效材质纹理、`gltf2` 格式。
- 渲染样式断言：`toon-outline`。
- 点击头部命中 `head`，触发对白、动作、嘴型和好感状态变化。
- 2D → 3D → 2D 往返、状态持久化、自动行为和缺失模型回退通过。
- 渲染器控制台无 GLTFLoader 或 CSP 错误。
- 本机 680×920 画布、2 秒动画采样平均约 120 FPS。

验收截图：

```text
docs/acceptance/m4-official-hina-3d.png
docs/acceptance/m4-formation-pickup.png
```

## 5. 已知限制

- 官方模型没有 VRM 标准 expression blend shape；当前使用分离嘴型网格近似表情。
- 眨眼、口型随动画片段原生播放，尚未接入独立眨眼或语音口型系统。
- 头发骨骼由 AnimationClip 驱动，尚未在动画外增加 spring bone 物理。
- 泳圈默认保留在画面中；后续可以增加显示/隐藏设置。
- 2D 仍是程序化占位角色。

## 6. 素材边界

模型位于 `.gitignore` 排除的 `private/` 目录。不得提交、重新分发，或在公开分发包中内置。对外分发 Deskpet 时，应要求用户自行提供已授权模型文件。
