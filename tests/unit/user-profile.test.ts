import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

  it('supports manual add, edit, pin and delete', () => {
    const profile = create()
    const fact = profile.addManual('project', 'Deskpet 桌面宠物')!
    expect(fact.source).toBe('manual')
    profile.setPinned(fact.id, true)
    expect(profile.buildPrompt()).toContain('（重要）')

    profile.update(fact.id, '新项目名')
    expect(profile.list()[0].text).toBe('新项目名')
    expect(profile.list()[0].pinned).toBe(true)

    profile.delete(fact.id)
    expect(profile.list()).toHaveLength(0)
  })

  it('migrates old profile facts without source or updated time', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deskpet-profile-old-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'memory'), { recursive: true })
    writeFileSync(
      join(dir, 'memory', 'profile.json'),
      JSON.stringify({
        schemaVersion: 1,
        facts: [{ id: 'old', category: 'project', text: '旧项目', createdAt: 1_000 }],
      }),
    )
    const profile = new UserProfile(dir)
    expect(profile.list()[0]).toMatchObject({
      text: '旧项目',
      source: 'auto',
      pinned: false,
      createdAt: 1_000,
      updatedAt: 1_000,
    })
  })

  it('restores source, pinned state and updated time from disk', () => {
    const profile = create()
    const fact = profile.addManual('preference', '喜欢深色模式')!
    profile.setPinned(fact.id, true)
    const reloaded = new UserProfile(dirs[0])
    expect(reloaded.list()[0]).toMatchObject({
      text: '喜欢深色模式',
      source: 'manual',
      pinned: true,
    })
    expect(reloaded.list()[0].updatedAt).toBeGreaterThanOrEqual(reloaded.list()[0].createdAt)
  })
})
