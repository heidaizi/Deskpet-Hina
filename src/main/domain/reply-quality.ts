import { findGlossaryViolations, type GlossaryEntry } from './glossary'

/** 日文回复的常见翻译问题。 */
export type QualityCode =
  'leading-ellipsis' | 'leading-filler' | 'too-formal' | 'too-long' | 'glossary'

export interface QualityIssue {
  code: QualityCode
  detail: string
}

const FILLER = /^(あの|えっと|えーと|ん[、。…]?|はぁ[、。…]?)/u

/**
 * 检查日文回复是否符合角色语气与长度要求。
 * 只做确定性判断，不调用模型。
 */
export function inspectJapaneseReply(
  replyJa: string,
  replyZh: string,
  glossaryEntries: readonly GlossaryEntry[] = [],
): QualityIssue[] {
  const issues: QualityIssue[] = []
  const text = replyJa.trim()

  if (/^[…‥\s]+/u.test(text)) {
    issues.push({ code: 'leading-ellipsis', detail: '句首不能有省略号' })
  }
  if (FILLER.test(text)) {
    issues.push({ code: 'leading-filler', detail: '不能添加原文没有的语气词' })
  }

  const formalCount = (text.match(/です|ます/gu) ?? []).length
  if (formalCount > 2 && Array.from(text).length < 60) {
    issues.push({ code: 'too-formal', detail: '短句里敬体过多，应使用口语常体' })
  }

  const jaLength = Array.from(text).length
  const zhLength = Array.from(replyZh.trim()).length
  if (zhLength > 0 && jaLength > Math.max(24, zhLength * 2.2)) {
    issues.push({
      code: 'too-long',
      detail: `日文长度 ${jaLength} 超出中文 ${zhLength} 的合理范围`,
    })
  }

  for (const entry of findGlossaryViolations(glossaryEntries, replyZh, replyJa)) {
    issues.push({ code: 'glossary', detail: `「${entry.zh}」应译作「${entry.ja}」` })
  }
  return issues
}

/** 模型重试后仍然不合格时，做最小幅度的清理，避免把问题直接暴露给用户。 */
export function sanitizeJapaneseReply(replyJa: string): string {
  return replyJa
    .replace(/^[…‥\s]+/u, '')
    .replace(FILLER, '')
    .replace(/^[、,，\s]+/u, '')
    .trim()
}

/** 重试时追加给模型的纠正说明。 */
export function qualityRetryInstruction(issues: readonly QualityIssue[]): string {
  const lines = issues.map((issue) => `- ${issue.detail}`)
  return [
    '上一版日文台词不合格，请只重写 JSON，并修正以下问题：',
    ...lines,
    '不要把这段说明复述出来，只输出 JSON。',
  ].join('\n')
}
