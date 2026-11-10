# 日奈泳装桌宠 2D 基础图生成简表

> 用途：根据用户提供的多张同人参考图，重新综合出适合 Deskpet 的原创 SFW Q 版角色基础图  
> 目标文件：透明背景全身立绘，后续再拆层或制作为动作资产  
> 当前状态：参考分析与提示词已完成；等待授权可用的图像生成工具

## 1. 参考图像的使用方式

参考图位于：

```text
assets/characters/hina-swimsuit/references/private/
```

这些图片只作为个人视觉参考，不直接进入成品、不复制原构图，也不声明拥有角色或画师版权。

### 主要参考与采用内容

| 参考文件                               | 参考重点                                       | 明确不采用                     |
| -------------------------------------- | ---------------------------------------------- | ------------------------------ |
| `illust_122826233_20261010_002859.png` | 脸部方向、紫眼、红色眼妆、白发光影、姓名牌位置 | 强调身体曲线和湿身的高露出构图 |
| `illust_134115064_20260813_141110.png` | 全身比例、走路时发量和泳装轮廓                 | 草帽、背景和身体特写           |
| `illust_151112048_20261022_001123.jpg` | 头部比例、眼睛高光、角与头发的层次             | 近景身体构图、湿身表现         |
| `illust_147582646_20260820_170241.png` | 困倦表情、黑紫破碎光环造型、长发体积           | 坐姿和身体视角                 |
| `illust_91677457_20260813_141116.jpg`  | 较自然的 Q 版动作、头发动态、泳装和凉鞋        | 草稿线条直接作为成品风格       |
| `HUCnJEzbQAEml_J.jpg`                  | 深色连体泳装、姓名牌和配饰的位置关系           | 仰视和身体强调                 |

### 共同提取的角色特征

- 冷白偏淡紫的超长直发，发量明显大于身体宽度。
- 头顶小呆毛。
- 两侧长发束和红色发绳/发饰。
- 近侧刘海有红色发夹或红色线条。
- 紫色半睁眼，外眼角红色眼妆。
- 两只黑色/深紫色弯角。
- 黑紫色破碎环状光环，带少量放射尖刺。
- 深海军蓝、近黑色的旧式连体学校泳装。
- 白色姓名牌，后期叠加“5-A ひな”。
- 胸口红色小挂饰。
- 可选大型浅蓝白色浮圈，但不放入默认基础图。

## 2. 成品设计决策

### 构图

- 全身正面偏 3/4，角色朝向画面左侧约 10～15°。
- 头部保持正对镜头，便于桌宠表情识别。
- 站姿平衡、自然，双手自然垂在身体两侧。
- 手臂与身体约 20～25°，不能是 T-pose。
- 双脚完整可见，脚跟站稳。
- 光环、角、全部头发不能被裁切。
- 角色在画布中保持 2 倍像素安全边距，便于后期裁切。

### 比例

- 约 4.2 头身。
- 头部略大，身体和腿保持完整。
- 头发体积宽度约为肩宽的 1.5～1.8 倍。
- 光环与角是头部识别轮廓的一部分，但不要大到占据窗口一半宽度。

### 表情

基础图使用：

- 半睁紫眼。
- 轻微不耐烦但不过度生气。
- 平直小嘴。
- 单侧眉毛略压。
- 淡腮红，保留红色眼妆。

### 服装

- 旧式深海军蓝连体学校泳装。
- 白色前胸姓名牌，基础图故意留白，文字后期添加。
- 胸口红色小饰物。
- 深色简洁凉鞋。
- 不突出湿身、身体曲线或皮肤高光。

### 背景和光影

- 真正透明背景。
- 不画地面、水波、浪花或沙滩。
- 不画投射阴影，阴影由桌宠运行时添加。
- 明亮、柔和、赛璐璐分层光影。
- 白色头发和光环边缘要清楚，避免透明背景下消失。

## 3. 生成提示词

### English production prompt

```text
Use case: stylized-concept
Asset type: full-body 2D desktop pet character master illustration, vertical sprite
Primary request: Create a new original SFW chibi fan-art interpretation of a serious, sleepy-eyed anime discipline-committee girl at the beach, synthesized from multiple user-provided references rather than copying any single reference, pose, composition, or artist style.
Scene/backdrop: genuinely transparent background, no scenery, no floor, no cast shadow.
Subject: very long pale-white lavender hair with large soft volume, one small ahoge, long side locks, red hair ties and a small red hair clip; deep violet half-lidded eyes with subtle red outer-eye makeup; two dark purple curved horns; one floating black-violet broken halo ring with sparse angular spikes; deep navy old-fashioned one-piece school swimsuit; blank white rectangular chest name tag; tiny red chest charm; simple dark sandals; small neutral frown.
Style/medium: polished anime game sprite, clean 2D cel shading, refined line art, subtle violet hair shadows, restrained highlights, desktop-pet readability at small size.
Composition/framing: full body, front three-quarter view, head mostly facing camera, relaxed natural A-pose with arms about 20-25 degrees away from the torso, both feet visible and fully grounded, centered, generous transparent safety margin on every side.
Lighting/mood: soft summer daylight, calm and slightly tired, SFW and non-sexualized.
Color palette: white lavender hair, pale skin, violet eyes, red eye makeup, near-black deep navy swimsuit, black-violet halo, small red accents.
Constraints: approximately 4.2 heads tall; preserve complete hair, horns, halo, hands and feet; large readable silhouette; serious but cute; no text on the name tag; no watermark; no signature; no extra characters; no hat; no large swim ring; no background; no wet-skin emphasis; no T-pose; no exaggerated body proportions.
Avoid: sexualized posing, body emphasis, exposed anatomy not present in a standard school swimsuit, chibi toddler proportions, over-bright white clipping, cropped hair, cropped feet, detailed beach scene, copied composition from any reference.
```

## 4. 规划输出

### 第一轮

同一提示词生成 3 个构图变体：

1. 更冷静、双臂自然下垂。
2. 更困倦、头部略偏。
3. 稍微更有亲和力、轻微侧身。

只选一个作为正式基础图。

### 第二轮

只调整单一变量：

- 发型体积
- 眼睛形状
- 光环比例
- 头身比例
- 泳装贴图细节

不要一次同时修改脸、服装和构图。

## 5. 后期处理

### 文件规范

- 原始生成：PNG，透明背景，尽量不低于 `1024 × 1536`。
- 工作稿：`assets/characters/hina-swimsuit/2d/private/source/base-v1.png`。
- 桌宠裁切稿：透明 `680 × 920`。
- 脚底锚点：约 `(340, 840)`。
- 运行时显示：`340 × 460`。

### 姓名牌

AI 不负责生成日文文字。生成时保持姓名牌留白，后期使用排版工具叠加：

```text
5-A
ひな
```

需要检查小尺寸下仍然可辨认，但不要求远端完全可读。

### 阴影

不在基础图内绘制投影。桌宠渲染器已有运行时透明阴影，基础图只保留角色和必要自阴影。

## 6. 验收标准

- 一眼能识别为日奈泳装形态。
- 头身比例适合桌宠，不是普通比例立绘缩图。
- 眼睛、角、光环和姓名牌四个识别点完整。
- 头发没有截断，光环没有与顶部气泡区域严重冲突。
- 手臂和脚完整，姿态自然。
- 没有背景、文字、水印或签名。
- 不依赖过度性化或湿身效果。
- 缩小到 340×460 后，轮廓仍然清晰。
- 可继续拆分为动作/Spine/Live2D 或用于 VRM 造型对照。

## 7. 工具状态

- 内置 `image_gen`：当前会话不可用。
- 技能 CLI 回退：可用，但需要用户明确授权。
- `OPENAI_API_KEY`：当前未设置。
- `openai` Python 包：当前未安装。

在获得明确的 CLI 回退授权并完成本地 API 配置前，不应擅自切换到外部图像生成路径。
