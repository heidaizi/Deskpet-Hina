import { describe, expect, it } from 'vitest'
import { parseFollowups } from '../../src/main/domain/deepseek-client'

describe('chat followups', () => {
  it('parses and cleans continuation messages', () => {
    const result = parseFollowups(
      [
        { reply_zh: '我小时候住在乡下。', reply_ja: '子供の頃は田舎に住んでたの。' },
        { reply_zh: '家里还有一位姐姐。', reply_ja: '家には姉もいるの。' },
      ],
      '小时候的事……有点难为情。',
      '子供の頃のこと……少し恥ずかしい。',
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      reply_zh: '我小时候住在乡下。',
      reply_ja: '子供の頃は田舎に住んでたの。',
    })
  })

  it('drops duplicates and invalid parts, and caps at three', () => {
    const firstZh = '第一句'
    const firstJa = '最初の文'
    const result = parseFollowups(
      [
        { reply_zh: firstZh, reply_ja: firstJa },
        { reply_zh: '第二句', reply_ja: '二番目' },
        { reply_zh: '第二句', reply_ja: '二番目' },
        { reply_zh: '第三句', reply_ja: '三番目' },
        { reply_zh: '第四句', reply_ja: '四番目' },
        { reply_zh: '第五句', reply_ja: '五番目' },
      ],
      firstZh,
      firstJa,
    )
    expect(result.map((part) => part.reply_zh)).toEqual(['第二句', '第三句', '第四句'])
  })

  it('returns an empty array when followups are missing or malformed', () => {
    expect(parseFollowups(undefined, 'a', 'b')).toEqual([])
    expect(parseFollowups('nope', 'a', 'b')).toEqual([])
  })
})
