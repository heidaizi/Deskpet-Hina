# 私有素材目录

这里存放只属于你本机的角色素材，已被 `.gitignore` 忽略。

## 已包含

```
3d/official/swimsuit.glb   # 泳装（3D）
3d/official/dress.glb      # 礼服（3D）
3d/official/normal.glb     # 常服（3D）
```

三套模型仅允许个人、非商业使用，见根目录 `LICENSE-ASSETS.md`。

## 需要自行准备（可选）

```
audio/outfit/<swimsuit|dress|normal>/*.ogg   # 各服装官方语音
audio/official-denoise45/*.wav               # 固定台词原声
audio/generated-dialogue/*.wav               # 预生成语音
stickers/hina-face/*.png                     # 各服装表情包
stickers/manifest.json                       # 贴纸清单
```

官方语音、贴纸与训练数据不随仓库分发；缺少时应用会自动改用 TTS 或隐藏贴纸入口。
