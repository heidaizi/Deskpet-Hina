import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  it.each(['index.html', 'settings.html'])(
    'allows Vite development style injection in %s',
    (fileName) => {
      const html = readFileSync(join(process.cwd(), 'src/renderer', fileName), 'utf8')
      expect(html).toContain("style-src 'self' 'unsafe-inline'")
      expect(html).toContain("media-src 'self' data: blob:")
    },
  )
})
