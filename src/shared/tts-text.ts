/**
 * TTS 文本规整。
 *
 * 开头的省略号会让模型读出换气/语气词，句中的连续省略号也会被读成
 * 长停顿。展示文本保持不变，只规整送去合成的那一份。
 */
export function normalizeTtsText(text: string): string {
  return text
    .replace(/^[\s…‥.．・]+/u, '')
    .replace(/[…‥]{2,}/gu, '、')
    .replace(/…/gu, '、')
    .replace(/[、,，]\s*[、,，]+/gu, '、')
    .replace(/^[、,，\s]+/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}
