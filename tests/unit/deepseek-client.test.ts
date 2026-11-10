import { describe, expect, it, vi } from 'vitest'
import { DeepSeekApiError, DeepSeekClient } from '../../src/main/domain/deepseek-client'

const key = 'sk-test-012345678901234567890123456789'

describe('DeepSeek client', () => {
  it('returns a validated Hina reply and strips markdown fences', async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '```json\n{"reply_zh":"先检查权限。","reply_ja":"まず権限を確認して。","emotion":"calm","action":"look_at_cursor","confidence":1.4}\n```',
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    const client = new DeepSeekClient({ apiKey: key, fetchImpl })

    const reply = await client.reply({
      scene: 'development',
      timePeriod: 'afternoon',
      localTime: '14:30',
      isWeekend: false,
      windowTitle: 'x'.repeat(200),
      selectedText: 'error TS2339',
    })

    expect(reply).toEqual({
      reply_zh: '先检查权限。',
      reply_ja: 'まず権限を確認して。',
      emotion: 'calm',
      action: 'look_at_cursor',
      confidence: 1,
    })
    expect(requestBody?.max_tokens).toBe(160)
    expect((requestBody?.messages as Array<{ content: string }>)[0]?.content).toContain('空崎日奈')
    expect(String((requestBody?.messages as Array<{ content: string }>)[1]?.content)).not.toContain(
      'x'.repeat(161),
    )
  })

  it('rejects unapproved model actions', async () => {
    const client = new DeepSeekClient({
      apiKey: key,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"reply_zh":"测试","reply_ja":"テスト","emotion":"calm","action":"run_shell","confidence":0.8}',
                },
              },
            ],
          }),
          { status: 200 },
        ),
    })
    await expect(
      client.reply({
        scene: 'focus',
        timePeriod: 'morning',
        localTime: '09:00',
        isWeekend: false,
      }),
    ).rejects.toMatchObject<Partial<DeepSeekApiError>>({ code: 'invalid_action' })
  })

  it('maps authentication errors without exposing the API key', async () => {
    const client = new DeepSeekClient({
      apiKey: key,
      fetchImpl: async () =>
        new Response('{"error":"invalid key"}', {
          status: 401,
        }),
    })
    await expect(
      client.reply({
        scene: 'other',
        timePeriod: 'night',
        localTime: '23:00',
        isWeekend: true,
      }),
    ).rejects.toThrow('DeepSeek API Key 无效')
  })

  it('rejects overlong replies before they reach the speech pipeline', async () => {
    const client = new DeepSeekClient({
      apiKey: key,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply_zh: '测试',
                    reply_ja: 'あ'.repeat(91),
                    emotion: 'calm',
                    action: 'look_at_cursor',
                    confidence: 0.8,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    })

    await expect(
      client.reply({
        scene: 'other',
        timePeriod: 'evening',
        localTime: '19:30',
        isWeekend: false,
      }),
    ).rejects.toMatchObject<Partial<DeepSeekApiError>>({ code: 'invalid_reply' })
  })

  it('validates proactive plans and filters memory references to the supplied ids', async () => {
    let requestBody: Record<string, unknown> | undefined
    const client = new DeepSeekClient({
      apiKey: key,
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    should_speak: true,
                    intent: 'gentle_reminder',
                    reply_zh: '先停一下，喝口水。',
                    reply_ja: '少し休んで、お水を飲んで。',
                    emotion: 'soft',
                    action: 'look_at_cursor',
                    memory_reference_ids: ['memory-1', 'invented-memory'],
                    confidence: 0.8,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      },
    })

    const plan = await client.planProactiveReply({
      scene: 'development',
      timePeriod: 'late_night',
      localTime: '23:30',
      isWeekend: false,
      emotion: {
        dominant: 'concerned',
        valence: 42,
        activation: 38,
        fatigue: 70,
        patience: 60,
        socialBattery: 47,
      },
      relationship: 'close',
      localTrigger: {
        ruleId: 'focus-long-milestone',
        reason: '连续专注达到 90 分钟',
        tags: ['focus', 'rest'],
      },
      memories: [
        {
          id: 'memory-1',
          summary: '老师在开发工作中持续专注约 90 分钟',
          tags: ['focus', 'rest'],
          importance: 0.7,
        },
      ],
    })

    expect(plan).toMatchObject({
      should_speak: true,
      intent: 'gentle_reminder',
      memory_reference_ids: ['memory-1'],
    })
    expect(String((requestBody?.messages as Array<{ content: string }>)[1]?.content)).not.toContain(
      'Visual Studio Code',
    )
  })

  it('allows a proactive plan to choose silence without reply text', async () => {
    const client = new DeepSeekClient({
      apiKey: key,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    should_speak: false,
                    intent: 'quiet_company',
                    emotion: 'calm',
                    action: 'idle',
                    memory_reference_ids: [],
                    confidence: 0.9,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    })

    await expect(
      client.planProactiveReply({
        scene: 'focus',
        timePeriod: 'evening',
        localTime: '20:00',
        isWeekend: false,
        emotion: null,
        relationship: 'familiar',
        localTrigger: {
          ruleId: 'focus-first-milestone',
          reason: '连续专注达到 40 分钟',
          tags: ['focus'],
        },
        memories: [],
      }),
    ).resolves.toMatchObject({
      should_speak: false,
      intent: 'quiet_company',
    })
  })
})
