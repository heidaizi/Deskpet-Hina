import { afterEach, describe, expect, it } from 'vitest'
import {
  buildPerceptionPrompt,
  collectScreenContext,
  htmlToText,
} from '../../src/main/perception/screen-context'

afterEach(() => {
  delete process.env.DESKPET_PERCEPTION
})

describe('html to text', () => {
  it('strips scripts, styles and tags', () => {
    const html =
      '<html><head><style>body{color:red}</style><script>alert(1)</script></head>' +
      '<body><h1>标题</h1><p>正文 &amp; 内容</p></body></html>'
    expect(htmlToText(html)).toBe('标题 正文 & 内容')
  })
})

describe('perception prompt', () => {
  it('describes the page without pretending to see the screen', () => {
    const prompt = buildPerceptionPrompt({
      app: 'Google Chrome',
      url: 'https://example.com/post',
      title: '一篇文章',
      excerpt: '这是页面正文的节选。',
      at: Date.now(),
    })
    expect(prompt).toContain('Google Chrome')
    expect(prompt).toContain('一篇文章')
    expect(prompt).toContain('可以自然地就页面内容提一个具体的问题')
  })

  it('returns empty without context', () => {
    expect(buildPerceptionPrompt(null)).toBe('')
  })
})

describe('perception switch', () => {
  it('can be disabled by environment', async () => {
    process.env.DESKPET_PERCEPTION = '0'
    expect(await collectScreenContext()).toBeNull()
  })
})
