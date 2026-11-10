import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UserProfile, extractFacts } from '../../src/main/domain/memory/user-profile'

const dirs: string[] = []
function create(): UserProfile {
  const dir = mkdtempSync(join(tmpdir(), 'deskpet-profile-'))
  dirs.push(dir)
  return new UserProfile(dir)
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('fact extraction', () => {
  it('detects projects, preferences and schedule', () => {
    expect(extractFacts('我在做 Electron 桌宠项目。')[0]).toMatchObject({ category: 'project' })
    expect(extractFacts('我很喜欢喝咖啡。')[0]).toMatchObject({ category: 'preference' })
    expect(extractFacts('我一般凌晨两点睡。')[0]).toMatchObject({ category: 'schedule' })
  })

  it('ignores ordinary chat', () => {
    expect(extractFacts('今天天气不错')).toEqual([])
  })
})

describe('user profile', () => {
  it('observes and persists facts', () => {
    const profile = create()
    expect(profile.observe('我在改 Electron 的窗口逻辑')).toBeGreaterThan(0)
    const reloaded = new UserProfile(dirs[0])
    expect(reloaded.list().length).toBe(profile.list().length)
  })

  it('deduplicates identical facts', () => {
    const profile = create()
    profile.observe('我在写 TypeScript 测试')
    const before = profile.list().length
    profile.observe('我在写 TypeScript 测试')
    expect(profile.list().length).toBe(before)
  })

  it('builds a compact prompt block', () => {
    const profile = create()
    profile.add('project', 'Deskpet 桌面宠物')
    const prompt = profile.buildPrompt()
    expect(prompt).toContain('你对老师的了解')
    expect(prompt).toContain('项目：Deskpet')
  })
})
