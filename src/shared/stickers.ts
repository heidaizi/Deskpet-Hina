export interface StickerView {
  id: string
  label: string
  /** 所属服装；旧版单包素材可能为空。 */
  outfit?: string
  /** 英文形容词，来自素材文件名。 */
  adjective?: string
  emotion?: string
  tags?: string[]
  /** data URL，供聊天窗和桌宠直接显示。 */
  dataUrl: string
}

export interface StickerPackView {
  stickers: StickerView[]
  /** 素材目录，用于设置页提示。 */
  directory: string
  error?: string
}
