/**
 * AivisSpeech（VOICEVOX 兼容 API）客户端。
 *
 * 与 Irodori 的 OpenAI 风格接口不同，这里需要两步：
 *   1. POST /audio_query  取合成参数
 *   2. POST /synthesis    用参数换 WAV 音频
 */

export type AivisStyleName = 'annoyed' | 'neutral' | 'soft'

export interface AivisStyle {
  name: string
  id: number
}

export interface AivisSpeaker {
  name: string
  styles: AivisStyle[]
}

/** 情绪 → 样式名。未列出的情绪一律归入 neutral。 */
const STYLE_BY_EMOTION: Record<string, AivisStyleName> = {
  angry: 'annoyed',
  annoyed: 'annoyed',
  stern: 'annoyed',
  angry_soft: 'annoyed',
  reluctant: 'annoyed',
  warning: 'annoyed',
  // soft 样式来自 ASMR 耳语数据，音色偏闷；只保留真正需要柔和的情绪。
  embarrassed: 'soft',
  soft: 'soft',
  happy: 'neutral',
  sad: 'neutral',
  tired: 'neutral',
  playful: 'neutral',
  neutral: 'neutral',
  surprised: 'neutral',
  suspicious: 'neutral',
  deadpan: 'neutral',
  calm: 'neutral',
}

export function resolveAivisStyle(emotion: string | undefined): AivisStyleName {
  if (!emotion) {
    return 'neutral'
  }
  return STYLE_BY_EMOTION[emotion.trim().toLowerCase()] ?? 'neutral'
}

/**
 * 在说话人列表里挑选指定样式的 id。
 * 优先匹配 preferredModel，找不到时退回第一个说话人。
 */
export function pickAivisStyleId(
  speakers: readonly AivisSpeaker[],
  preferredModel: string,
  styleName: AivisStyleName,
): number | null {
  if (speakers.length === 0) {
    return null
  }
  const preferred = speakers.find((speaker) => speaker.name === preferredModel) ?? speakers[0]
  const byName = preferred.styles.find((style) => style.name.toLowerCase() === styleName)
  if (byName) {
    return byName.id
  }
  // 样式名可能是「ノーマル」这类本地化名称，退回第一个可用样式。
  return preferred.styles[0]?.id ?? null
}

export class AivisTtsService {
  private speakersCache: { at: number; data: AivisSpeaker[] } | null = null
  private readonly timeoutMs = 20_000

  constructor(
    private readonly baseUrl = process.env.DESKPET_AIVIS_URL ?? 'http://127.0.0.1:10101',
    private readonly preferredModel = process.env.DESKPET_AIVIS_MODEL ?? 'hina',
  ) {}

  async listSpeakers(force = false): Promise<AivisSpeaker[]> {
    if (!force && this.speakersCache && Date.now() - this.speakersCache.at < 30_000) {
      return this.speakersCache.data
    }
    try {
      const response = await fetch(`${this.baseUrl}/speakers`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!response.ok) {
        return []
      }
      const data = (await response.json()) as AivisSpeaker[]
      if (!Array.isArray(data)) {
        return []
      }
      this.speakersCache = { at: Date.now(), data }
      return data
    } catch {
      return []
    }
  }

  async isReady(): Promise<boolean> {
    return (await this.listSpeakers()).length > 0
  }

  /** 合成为 WAV 字节；失败返回 null，由调用方决定回退。 */
  async synthesize(text: string, styleId: number): Promise<Uint8Array | null> {
    const input = text.trim()
    if (!input) {
      return null
    }
    try {
      const queryUrl =
        `${this.baseUrl}/audio_query?text=${encodeURIComponent(input)}` + `&speaker=${styleId}`
      const queryResponse = await fetch(queryUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!queryResponse.ok) {
        return null
      }
      const query = await queryResponse.json()

      const synthesisResponse = await fetch(`${this.baseUrl}/synthesis?speaker=${styleId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(query),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!synthesisResponse.ok) {
        return null
      }
      const buffer = new Uint8Array(await synthesisResponse.arrayBuffer())
      return buffer.byteLength > 0 ? buffer : null
    } catch {
      return null
    }
  }

  async synthesizeWithEmotion(
    text: string,
    emotion: string | undefined,
  ): Promise<Uint8Array | null> {
    const speakers = await this.listSpeakers()
    const styleId = pickAivisStyleId(speakers, this.preferredModel, resolveAivisStyle(emotion))
    if (styleId === null) {
      return null
    }
    return this.synthesize(text, styleId)
  }
}
