import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type {
  LocalSpeechOptions,
  LocalSpeechResult,
  LocalSpeechSource,
  TtsResourceStatus,
  TtsRuntimeState,
} from '../../shared/types'
import { normalizeTtsText } from '../../shared/tts-text'
import { AivisTtsService, resolveAivisStyle } from './aivis-tts-service'
import { pruneTtsCache, rotateServerLog } from './tts-maintenance'
import { IS_E2E } from '../config'

const execFileAsync = promisify(execFile)
const SPEECH_RATE = 185
const IRODORI_STARTUP_WAIT_MS = 12_000
const DEFAULT_CAPTION = '落ち着いた低めの女性話者。先生に対して、少し気だるげで親しみのある話し方。'
const DEFAULT_NUM_STEPS = 16
const DEFAULT_DURATION_SCALE = 1
const DEFAULT_SPEAKER_KV_SCALE = 1.2
const DEFAULT_SPEAKER_KV_MIN_T = 0.9
const IRODORI_IDLE_UNLOAD_MS = 5 * 60_000
const IRODORI_PYTHON = join(homedir(), '.local/share/deskpet-tts/Irodori-TTS/.venv/bin/python')
const IRODORI_POSTPROCESS_TIMEOUT_MS = 20_000
const IRODORI_DENOISE_STRENGTH = 0.45
// 语音缓存与服务日志都需要硬上限，否则长期使用会无界增长。
const TTS_CACHE_MAX_BYTES = 300 * 1024 * 1024
const TTS_CACHE_MAX_FILES = 600
const TTS_CACHE_PRUNE_INTERVAL_MS = 5 * 60_000
const SERVER_LOG_MAX_BYTES = 2 * 1024 * 1024
const SERVER_LOG_BACKUPS = 5

interface TtsLineConfig {
  text: string
  caption?: string
  emotion?: string
  durationScale?: number
  seed?: number
  seedVariants?: number
  numSteps?: number
}

interface TtsPhraseConfig {
  voice?: string
  modelRevision?: string
  loraAdapter?: string
  defaultCaption?: string
  captions?: Record<string, string>
  defaultNumSteps?: number
  defaultSeedVariants?: number
  emotionSeedVariants?: Record<string, number>
  speakerKvScale?: number
  speakerKvMinT?: number
  lines?: Record<string, string | TtsLineConfig>
}

/**
 * 预生成音频的查找键需要归一化：运行时传进来的口语文本
 * 可能在标点、全半角、空白上与清单有细微差异。
 */
function normalizeSpeechKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .replace(/[。、，,．.!！？?…‥·・~〜ー]+$/u, '')
    .toLowerCase()
}

interface PrebuiltTtsConfig {
  schemaVersion: number
  modelRevision?: string
  entries?: Array<{
    text?: string
    japanese?: string
    path?: string
  }>
}

interface ResolvedTtsLine {
  text: string
  caption: string
  durationScale: number
  seed: number
  seedVariant: number
  numSteps: number
  speakerKvScale: number
  speakerKvMinT: number
}

export function chooseLocalTtsVoice(text: string): 'Kyoko' | 'Tingting' {
  return /[\u3040-\u30ff]/u.test(text) ? 'Kyoko' : 'Tingting'
}

export function isSpeakableText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

export function isJapaneseTtsText(text: string): boolean {
  return /[\u3040-\u30ff]/u.test(text)
}

export function deriveEmotionSeed(
  revision: string,
  text: string,
  caption: string,
  variantIndex = 0,
): number {
  const base = `${revision}\0${text}\0${caption}`
  const payload = variantIndex === 0 ? base : `${base}\0${variantIndex}`
  return createHash('sha256').update(payload).digest().readUInt32BE(0) & 0x7fffffff
}

function expandHome(value: string): string {
  return value === '~'
    ? homedir()
    : value.startsWith('~/')
      ? join(homedir(), value.slice(2))
      : value
}

export type TtsQuality = 'quality' | 'balanced' | 'speed'

/** 质量档位到合成参数的映射。 */
export const TTS_QUALITY_PROFILES: Record<TtsQuality, { numSteps: number; denoise: boolean }> = {
  quality: { numSteps: 24, denoise: true },
  // 默认：步数减半，保留降噪。
  balanced: { numSteps: 16, denoise: true },
  // 速度优先：更少步数，但仍保留降噪（常驻 worker 只多花约 0.03 秒）。
  speed: { numSteps: 12, denoise: true },
}

export class LocalTtsService {
  private readonly cacheDirectory: string
  private readonly pending = new Map<string, Promise<LocalSpeechResult | null>>()
  private readonly seedVariantCursor = new Map<string, number>()
  private readonly phraseConfig: TtsPhraseConfig
  private irodoriProcess: ChildProcess | null = null
  private irodoriReady = false
  private irodoriStarting: Promise<boolean> | null = null
  private enabled = true
  private suspended = false
  private runtimeState: TtsRuntimeState = 'unloaded'
  private idleUnloadTimer: NodeJS.Timeout | null = null
  private lastError: string | undefined
  private readonly serverScriptPath: string | undefined
  private readonly serverLogPath: string
  private readonly prebuiltAudioPaths = new Map<string, string>()
  private readonly prebuiltAudioCache = new Map<string, Uint8Array>()
  private readonly appRootPath: string
  private lastCachePruneAt = 0
  private quality: TtsQuality = 'balanced'
  private engine: 'irodori' | 'aivis' = 'irodori'
  private readonly aivis = new AivisTtsService()
  private aivisReviver: (() => Promise<boolean>) | null = null
  private denoiseWorker: ChildProcess | null = null
  private denoiseSequence = 0
  private readonly denoisePending = new Map<number, (ok: boolean) => void>()

  constructor(
    userDataPath: string,
    phraseConfigPath?: string,
    serverScriptPath?: string,
    prebuiltManifestPath?: string,
    appRootPath = process.cwd(),
  ) {
    this.cacheDirectory = join(userDataPath, 'tts-cache')
    this.serverScriptPath = serverScriptPath
    this.appRootPath = appRootPath
    this.serverLogPath = join(userDataPath, 'irodori-server.log')
    this.phraseConfig =
      phraseConfigPath && existsSync(phraseConfigPath)
        ? (JSON.parse(readFileSync(phraseConfigPath, 'utf8')) as TtsPhraseConfig)
        : {}
    if (prebuiltManifestPath && existsSync(prebuiltManifestPath)) {
      const manifestPaths = [
        prebuiltManifestPath,
        prebuiltManifestPath.replace('prebuilt-tts-ja.json', 'prebuilt-tts-supplemental.json'),
      ]
      for (const manifestPath of manifestPaths) {
        if (!existsSync(manifestPath)) {
          continue
        }
        const prebuilt = JSON.parse(readFileSync(manifestPath, 'utf8')) as PrebuiltTtsConfig
        for (const entry of prebuilt.entries ?? []) {
          if (!entry.path?.trim()) {
            continue
          }
          // 运行时传进来的可能是展示文本或口语文本，两种都要能命中。
          for (const key of [entry.text, entry.japanese]) {
            if (key?.trim()) {
              this.prebuiltAudioPaths.set(normalizeSpeechKey(key), entry.path.trim())
            }
          }
        }
      }
    }
  }

  async synthesize(text: string, options?: LocalSpeechOptions): Promise<LocalSpeechResult | null> {
    if (!this.enabled) {
      return null
    }
    const input = text.trim()
    // 送去合成的文本去掉省略号，避免模型读出换气或语气词。
    const spokenText = normalizeTtsText(input)
    // Fixed dialogue always wins over dynamic options. This keeps scene companionship
    // and click reactions on the bundled Hina recording instead of falling back to say.
    // 预生成音频已用 Aivis 重新生成，两种引擎下都可以直接用。
    const prebuilt =
      (await this.loadPrebuiltAudio(normalizeSpeechKey(input))) ??
      (await this.loadPrebuiltAudio(normalizeSpeechKey(spokenText)))
    if (prebuilt) {
      return this.speechResult(prebuilt, 'prebuilt-tts')
    }
    const line = options
      ? this.resolveSpeechOptions(spokenText, options)
      : this.resolveLine(spokenText, this.nextSeedVariant(spokenText))
    if (process.platform !== 'darwin' || !isSpeakableText(line.text)) {
      return null
    }

    if (isJapaneseTtsText(line.text)) {
      // 只有显式选择 AivisSpeech 时才走它；失败回退 Irodori。
      // 反向不回退，避免默认引擎被外部服务意外接管。
      if (this.engine === 'aivis') {
        const aivis = await this.synthesizeWithAivis(line, options)
        if (aivis) {
          return aivis
        }
      }
      const irodori = await this.synthesizeWithIrodori(line)
      if (irodori) {
        return irodori
      }
    }

    const voice = chooseLocalTtsVoice(line.text)
    const cacheKey = createHash('sha256')
      .update(`${voice}\0${SPEECH_RATE}\0${line.text}`)
      .digest('hex')
    const existing = this.pending.get(cacheKey)
    if (existing) {
      return existing
    }

    const operation = this.generate(voice, line.text, cacheKey)
    this.pending.set(cacheKey, operation)
    try {
      return await operation
    } finally {
      this.pending.delete(cacheKey)
    }
  }

  private async loadPrebuiltAudio(text: string): Promise<Uint8Array | null> {
    let relativePath = this.prebuiltAudioPaths.get(text)
    if (!relativePath && text.length >= 6) {
      // 运行时文本可能被截断或补全，退一步做前缀匹配，取最长的那个。
      let bestKey = ''
      for (const key of this.prebuiltAudioPaths.keys()) {
        if ((key.startsWith(text) || text.startsWith(key)) && key.length > bestKey.length) {
          bestKey = key
        }
      }
      relativePath = bestKey ? this.prebuiltAudioPaths.get(bestKey) : undefined
    }
    if (!relativePath) {
      return null
    }
    const cached = this.prebuiltAudioCache.get(relativePath)
    if (cached) {
      return cached
    }
    const resolvedPath = join(this.appRootPath, relativePath)
    if (!existsSync(resolvedPath)) {
      return null
    }
    const audio = new Uint8Array(await readFile(resolvedPath))
    this.prebuiltAudioCache.set(relativePath, audio)
    return audio
  }

  resolveJapaneseText(text: string): string {
    return this.resolveLine(text, 0).text
  }

  private resolveSpeechOptions(text: string, options: LocalSpeechOptions): ResolvedTtsLine {
    const emotion = options.emotion?.trim()
    const caption =
      options.caption?.trim() ||
      (emotion ? this.phraseConfig.captions?.[emotion]?.trim() : undefined) ||
      this.phraseConfig.defaultCaption?.trim() ||
      DEFAULT_CAPTION
    const seed =
      typeof options.seed === 'number' && Number.isFinite(options.seed)
        ? Math.trunc(options.seed) & 0x7fffffff
        : deriveEmotionSeed(this.getModelRevision(), text, caption, 0)
    return {
      text,
      caption,
      durationScale: this.safeNumber(options.durationScale, DEFAULT_DURATION_SCALE, 0.85, 1.15),
      seed,
      seedVariant: 0,
      numSteps: Math.round(
        this.safeNumber(this.phraseConfig.defaultNumSteps, DEFAULT_NUM_STEPS, 8, 48),
      ),
      speakerKvScale: this.safeNumber(
        this.phraseConfig.speakerKvScale,
        DEFAULT_SPEAKER_KV_SCALE,
        1,
        1.4,
      ),
      speakerKvMinT: this.safeNumber(
        this.phraseConfig.speakerKvMinT,
        DEFAULT_SPEAKER_KV_MIN_T,
        0,
        1,
      ),
    }
  }

  setQuality(quality: TtsQuality): void {
    this.quality = quality
  }

  getQuality(): TtsQuality {
    return this.quality
  }

  getVoiceId(): string {
    return this.phraseConfig.voice?.trim() || 'hina-swimsuit'
  }

  getModelRevision(): string {
    return this.phraseConfig.modelRevision?.trim() || 'hina-irodori-v1'
  }

  getLoraAdapter(): string | undefined {
    const value = this.phraseConfig.loraAdapter?.trim()
    return value ? expandHome(value) : undefined
  }

  prewarm(): void {
    if (process.env.DESKPET_E2E === '1' || !this.enabled || this.suspended) {
      return
    }
    void this.ensureIrodoriServer()
  }

  setAivisReviver(reviver: () => Promise<boolean>): void {
    this.aivisReviver = reviver
  }

  setEngine(engine: 'irodori' | 'aivis'): void {
    this.engine = engine
  }

  getEngine(): 'irodori' | 'aivis' {
    return this.engine
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.stopIrodori('disabled')
      return
    }
    if (this.suspended) {
      this.stopIrodori('suspended')
    } else if (this.runtimeState === 'disabled' || this.runtimeState === 'suspended') {
      this.stopIrodori('unloaded')
    }
  }

  suspend(): void {
    this.suspended = true
    this.stopIrodori(this.enabled ? 'suspended' : 'disabled')
  }

  resume(enabled: boolean): void {
    this.enabled = enabled
    this.suspended = false
    // Waking the Mac must not immediately reload the multi-gigabyte model.
    // The next uncached speech request, or an explicit preload, starts it again.
    this.stopIrodori(enabled ? 'unloaded' : 'disabled')
  }

  getStatus(): TtsResourceStatus {
    return {
      enabled: this.enabled,
      state: this.runtimeState,
      pid: this.irodoriProcess?.pid,
      lastError: this.lastError,
    }
  }

  stop(): void {
    this.denoiseWorker?.kill()
    this.denoiseWorker = null
    this.stopIrodori('unloaded')
  }

  private async synthesizeWithAivis(
    line: ResolvedTtsLine,
    options?: LocalSpeechOptions,
  ): Promise<LocalSpeechResult | null> {
    const style = resolveAivisStyle(options?.emotion)
    let speakers = await this.aivis.listSpeakers()
    if (speakers.length === 0 && this.aivisReviver) {
      // 引擎进程可能崩溃或被系统回收，尝试拉起一次再判断。
      await this.aivisReviver()
      speakers = await this.aivis.listSpeakers(true)
    }
    if (speakers.length === 0) {
      this.lastError = 'AivisSpeech 引擎未就绪'
      return null
    }
    const audio = await this.aivis.synthesizeWithEmotion(line.text, options?.emotion)
    if (!audio) {
      this.lastError = `AivisSpeech 合成失败（style=${style}）`
      return null
    }
    return { audio, source: 'aivis-tts' }
  }

  private async synthesizeWithIrodori(line: ResolvedTtsLine): Promise<LocalSpeechResult | null> {
    if (process.env.DESKPET_E2E === '1' || !this.enabled || this.suspended) {
      return null
    }
    const cacheKey = createHash('sha256')
      .update(
        JSON.stringify({
          engine: 'irodori',
          voice: this.getVoiceId(),
          revision: this.getModelRevision(),
          loraAdapter: this.getLoraAdapter(),
          caption: line.caption,
          text: line.text,
          durationScale: line.durationScale,
          seed: line.seed,
          seedVariant: line.seedVariant,
          numSteps: line.numSteps,
          speakerKvScale: line.speakerKvScale,
          speakerKvMinT: line.speakerKvMinT,
        }),
      )
      .digest('hex')
    const cachePath = join(this.cacheDirectory, `${cacheKey}.wav`)
    if (existsSync(cachePath)) {
      if (this.irodoriReady) {
        this.scheduleIdleUnload()
      }
      return this.speechResult(
        await readFile(cachePath),
        'irodori-tts',
        line.seed,
        line.seedVariant,
      )
    }

    const existing = this.pending.get(cacheKey)
    if (existing) {
      return existing
    }

    if (!this.irodoriReady) {
      if (!this.irodoriStarting) {
        void this.ensureIrodoriServer()
      }
      const ready = await this.waitForIrodoriStartup()
      if (!ready) {
        return null
      }
    }
    this.scheduleIdleUnload()

    const operation = this.generateIrodori(line, cacheKey)
    this.pending.set(cacheKey, operation)
    try {
      return await operation
    } finally {
      this.pending.delete(cacheKey)
    }
  }

  private async generateIrodori(
    line: ResolvedTtsLine,
    cacheKey: string,
  ): Promise<LocalSpeechResult | null> {
    await mkdir(this.cacheDirectory, { recursive: true })
    const cachePath = join(this.cacheDirectory, `${cacheKey}.wav`)
    if (existsSync(cachePath)) {
      return this.speechResult(
        await readFile(cachePath),
        'irodori-tts',
        line.seed,
        line.seedVariant,
      )
    }

    try {
      const response = await fetch('http://127.0.0.1:8788/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'irodori-tts',
          input: line.text,
          voice: this.getVoiceId(),
          response_format: 'wav',
          irodori: {
            caption: line.caption,
            lora_adapter: this.getLoraAdapter(),
            duration_scale: line.durationScale,
            min_seconds: 0.8,
            num_steps: line.numSteps,
            seed: line.seed,
            speaker_kv_scale: line.speakerKvScale,
            speaker_kv_min_t: line.speakerKvMinT,
          },
        }),
      })
      if (!response.ok) {
        const detail = await response.text()
        this.lastError = `HTTP ${response.status}: ${detail}`
        this.runtimeState = 'error'
        console.error('Irodori TTS request failed:', response.status, detail)
        return null
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      const processed = await this.postprocessIrodoriAudio(bytes, cachePath, cacheKey)
      this.scheduleCachePrune()
      return this.speechResult(processed, 'irodori-tts', line.seed, line.seedVariant)
    } catch (error) {
      console.error('Irodori TTS request failed:', error)
      this.stopIrodori('error')
      this.lastError = String(error)
      return null
    }
  }

  /**
   * 常驻降噪进程：省掉每次约 0.9 秒的 Python 导入开销，音质与逐次调用完全一致。
   */
  private ensureDenoiseWorker(scriptPath: string): ChildProcess | null {
    if (this.denoiseWorker && !this.denoiseWorker.killed) {
      return this.denoiseWorker
    }
    const workerPath = join(dirname(scriptPath), 'denoise-worker.py')
    if (!existsSync(workerPath)) {
      return null
    }
    try {
      const worker = spawn(IRODORI_PYTHON, [workerPath, scriptPath], {
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      let buffer = ''
      worker.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let index = buffer.indexOf('\n')
        while (index >= 0) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (line) {
            try {
              const payload = JSON.parse(line) as { id?: number; ok?: boolean }
              if (typeof payload.id === 'number') {
                const resolve = this.denoisePending.get(payload.id)
                this.denoisePending.delete(payload.id)
                resolve?.(payload.ok === true)
              }
            } catch {
              // 非协议输出忽略
            }
          }
          index = buffer.indexOf('\n')
        }
      })
      worker.once('exit', () => {
        this.denoiseWorker = null
        for (const resolve of this.denoisePending.values()) {
          resolve(false)
        }
        this.denoisePending.clear()
      })
      this.denoiseWorker = worker
      return worker
    } catch {
      return null
    }
  }

  private denoiseWithWorker(
    scriptPath: string,
    rawPath: string,
    cachePath: string,
  ): Promise<boolean> {
    const worker = this.ensureDenoiseWorker(scriptPath)
    if (!worker?.stdin || worker.killed) {
      return Promise.resolve(false)
    }
    const id = ++this.denoiseSequence
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.denoisePending.delete(id)
        resolve(false)
      }, 15_000)
      this.denoisePending.set(id, (ok) => {
        clearTimeout(timer)
        resolve(ok)
      })
      worker.stdin?.write(
        JSON.stringify({
          id,
          input: rawPath,
          output: cachePath,
          strength: IRODORI_DENOISE_STRENGTH,
          highpass: 55,
          lowpass: 14000,
          targetPeakDb: -1,
        }) + '\n',
      )
    })
  }

  /**
   * 流式合成：服务端按句切分并逐块返回，第一块就绪即可播放。
   * 返回是否至少收到一块音频；失败时由调用方回退到非流式路径。
   */
  async streamSynthesize(
    text: string,
    options: LocalSpeechOptions | undefined,
    onChunk: (audio: Uint8Array, index: number) => void,
    signal?: AbortSignal,
  ): Promise<boolean> {
    // E2E 不启动重型 TTS 服务，直接回退到既有路径。
    // 流式合成只适用于 Irodori；Aivis 走整句合成，不应让渲染层空等。
    if (this.engine !== 'irodori' || IS_E2E || !this.enabled || this.suspended) {
      return false
    }
    const line = this.resolveLine(text, 0)
    if (!(await this.ensureIrodoriServer())) {
      return false
    }
    this.scheduleIdleUnload()
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    if (signal?.aborted) {
      controller.abort()
    } else {
      signal?.addEventListener('abort', abort, { once: true })
    }
    try {
      const response = await fetch(`http://127.0.0.1:8788/v1/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'irodori-tts',
          input: line.text,
          voice: this.getVoiceId(),
          response_format: 'wav',
          stream_format: 'sse',
          irodori: {
            chunking_enabled: true,
            chunk_min_chars: 14,
            first_sentence_chunk_min_chars: 10,
            caption: line.caption,
            lora_adapter: this.getLoraAdapter(),
            duration_scale: line.durationScale,
            min_seconds: 0.8,
            num_steps: line.numSteps,
            seed: line.seed,
            speaker_kv_scale: line.speakerKvScale,
            speaker_kv_min_t: line.speakerKvMinT,
          },
        }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        this.lastError = `HTTP ${response.status}`
        return false
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const rawEvent = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          boundary = buffer.indexOf('\n\n')
          const dataLine = rawEvent.split('\n').find((linePart) => linePart.startsWith('data:'))
          if (!dataLine) {
            continue
          }
          try {
            const payload = JSON.parse(dataLine.slice(5).trim()) as {
              index?: number
              audio_base64?: string
            }
            if (typeof payload.audio_base64 === 'string') {
              const audio = new Uint8Array(Buffer.from(payload.audio_base64, 'base64'))
              onChunk(audio, payload.index ?? received)
              received += 1
            }
          } catch {
            // 非音频事件（如错误事件）忽略，交给调用方回退。
          }
        }
      }
      return received > 0
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        this.lastError = String(error)
      }
      return false
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  }

  private async postprocessIrodoriAudio(
    bytes: Uint8Array,
    cachePath: string,
    cacheKey: string,
  ): Promise<Uint8Array> {
    const scriptPath = this.serverScriptPath
      ? join(dirname(this.serverScriptPath), 'denoise-hina-audio.py')
      : undefined
    if (
      !scriptPath ||
      !existsSync(scriptPath) ||
      !existsSync(IRODORI_PYTHON) ||
      !TTS_QUALITY_PROFILES[this.quality].denoise
    ) {
      await writeFile(cachePath, bytes)
      return bytes
    }

    const rawPath = join(this.cacheDirectory, `${cacheKey}.raw.wav`)
    await writeFile(rawPath, bytes)
    if (await this.denoiseWithWorker(scriptPath, rawPath, cachePath)) {
      await unlink(rawPath).catch(() => undefined)
      return new Uint8Array(await readFile(cachePath))
    }
    try {
      await execFileAsync(
        IRODORI_PYTHON,
        [
          scriptPath,
          '--input-file',
          rawPath,
          '--output-file',
          cachePath,
          '--strength',
          String(IRODORI_DENOISE_STRENGTH),
          '--highpass-hz',
          '55',
          '--lowpass-hz',
          '14000',
          '--target-peak-db',
          '-1',
        ],
        {
          timeout: IRODORI_POSTPROCESS_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
        },
      )
      return new Uint8Array(await readFile(cachePath))
    } catch (error) {
      console.warn('Irodori audio post-processing failed; using raw synthesis.', error)
      await writeFile(cachePath, bytes)
      return bytes
    } finally {
      await unlink(rawPath).catch(() => undefined)
    }
  }

  private scheduleCachePrune(): void {
    const now = Date.now()
    if (now - this.lastCachePruneAt < TTS_CACHE_PRUNE_INTERVAL_MS) {
      return
    }
    this.lastCachePruneAt = now
    try {
      const result = pruneTtsCache(this.cacheDirectory, {
        maxBytes: TTS_CACHE_MAX_BYTES,
        maxFiles: TTS_CACHE_MAX_FILES,
        minAgeMs: 60_000,
        now,
      })
      if (result.removed > 0) {
        const freed = (result.freedBytes / (1024 * 1024)).toFixed(1)
        console.info(`[tts] 缓存清理 ${result.removed} 个文件，释放 ${freed} MB`)
      }
    } catch (error) {
      console.warn('[tts] 缓存清理失败', error)
    }
  }

  private ensureIrodoriServer(): Promise<boolean> {
    if (!this.enabled || this.suspended) {
      return Promise.resolve(false)
    }
    if (this.irodoriReady) {
      return Promise.resolve(true)
    }
    if (this.irodoriStarting) {
      return this.irodoriStarting
    }
    if (!this.serverScriptPath || !existsSync(this.serverScriptPath)) {
      this.lastError = 'Irodori server script is missing.'
      this.runtimeState = 'error'
      return Promise.resolve(false)
    }

    this.lastError = undefined
    this.runtimeState = 'starting'
    this.irodoriStarting = this.startIrodoriServer()
    return this.irodoriStarting
  }

  private async startIrodoriServer(): Promise<boolean> {
    try {
      const existing = await this.checkIrodoriHealth()
      if (existing) {
        this.irodoriReady = true
        this.runtimeState = 'ready'
        this.scheduleIdleUnload()
        return true
      }

      await mkdir(dirname(this.serverLogPath), { recursive: true })
      if (!this.enabled || this.suspended) {
        this.runtimeState = this.enabled ? 'suspended' : 'disabled'
        return false
      }
      // 启动前轮转日志，避免单文件无限增长。
      rotateServerLog(this.serverLogPath, {
        maxBytes: SERVER_LOG_MAX_BYTES,
        backups: SERVER_LOG_BACKUPS,
      })
      const logFd = openSync(this.serverLogPath, 'a')
      const child = spawn('/bin/zsh', [this.serverScriptPath!], {
        detached: false,
        stdio: ['ignore', logFd, logFd],
        env: process.env,
      })
      this.irodoriProcess = child
      closeSync(logFd)
      child.once('exit', () => {
        if (this.irodoriProcess !== child) {
          return
        }
        this.irodoriProcess = null
        this.irodoriReady = false
        if (
          this.runtimeState !== 'disabled' &&
          this.runtimeState !== 'suspended' &&
          this.runtimeState !== 'unloaded'
        ) {
          this.runtimeState = 'error'
          this.lastError = 'Irodori TTS server exited unexpectedly.'
        }
      })

      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_000))
        if (await this.checkIrodoriHealth()) {
          this.irodoriReady = true
          this.runtimeState = 'ready'
          this.lastError = undefined
          this.scheduleIdleUnload()
          return true
        }
        if (!this.irodoriProcess) {
          return false
        }
      }
    } catch (error) {
      console.error('Unable to start Irodori TTS server:', error)
      this.lastError = String(error)
      this.runtimeState = 'error'
    } finally {
      this.irodoriStarting = null
    }
    if (this.runtimeState === 'starting') {
      this.runtimeState = 'error'
      this.lastError = 'Irodori TTS server did not become ready in time.'
    }
    return false
  }

  private scheduleIdleUnload(): void {
    if (this.idleUnloadTimer) {
      clearTimeout(this.idleUnloadTimer)
    }
    if (!this.enabled || this.suspended || !this.irodoriReady) {
      this.idleUnloadTimer = null
      return
    }
    this.idleUnloadTimer = setTimeout(() => {
      this.idleUnloadTimer = null
      this.stopIrodori('unloaded')
    }, IRODORI_IDLE_UNLOAD_MS)
  }

  private stopIrodori(nextState: TtsRuntimeState): void {
    if (this.idleUnloadTimer) {
      clearTimeout(this.idleUnloadTimer)
      this.idleUnloadTimer = null
    }
    const child = this.irodoriProcess
    this.irodoriProcess = null
    this.irodoriReady = false
    this.irodoriStarting = null
    this.runtimeState = nextState
    if (nextState !== 'error') {
      this.lastError = undefined
    }
    if (child && !child.killed) {
      child.kill('SIGTERM')
      const forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
        }
      }, 4_000)
      forceKillTimer.unref()
      child.once('exit', () => {
        clearTimeout(forceKillTimer)
      })
    }
  }

  private async checkIrodoriHealth(): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, 2_000)
    try {
      const response = await fetch('http://127.0.0.1:8788/health', {
        signal: controller.signal,
      })
      if (!response.ok) {
        return false
      }
      const health = (await response.json()) as {
        status?: string
        runtime?: { loaded?: boolean }
      }
      return health.status === 'ok' && health.runtime?.loaded === true
    } catch {
      return false
    } finally {
      clearTimeout(timeout)
    }
  }

  private async waitForIrodoriStartup(): Promise<boolean> {
    const starting = this.irodoriStarting
    if (!starting) {
      return false
    }

    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        starting,
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), IRODORI_STARTUP_WAIT_MS)
        }),
      ])
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }

  private resolveLine(input: string, seedVariant: number): ResolvedTtsLine {
    const configured = this.phraseConfig.lines?.[input]
    const line = typeof configured === 'string' ? { text: configured } : configured
    const text = line?.text?.trim() || input
    const emotionCaption =
      line?.emotion && this.phraseConfig.captions?.[line.emotion]
        ? this.phraseConfig.captions[line.emotion]?.trim()
        : undefined
    const caption =
      line?.caption?.trim() ||
      emotionCaption ||
      this.phraseConfig.defaultCaption?.trim() ||
      DEFAULT_CAPTION
    const durationScale = this.safeNumber(line?.durationScale, DEFAULT_DURATION_SCALE, 0.85, 1.15)
    const numSteps = Math.round(
      this.safeNumber(
        line?.numSteps ?? TTS_QUALITY_PROFILES[this.quality].numSteps,
        DEFAULT_NUM_STEPS,
        8,
        48,
      ),
    )
    const speakerKvScale = this.safeNumber(
      this.phraseConfig.speakerKvScale,
      DEFAULT_SPEAKER_KV_SCALE,
      1,
      1.4,
    )
    const speakerKvMinT = this.safeNumber(
      this.phraseConfig.speakerKvMinT,
      DEFAULT_SPEAKER_KV_MIN_T,
      0,
      1,
    )
    const seed =
      typeof line?.seed === 'number' && Number.isFinite(line.seed)
        ? Math.trunc(line.seed) & 0x7fffffff
        : deriveEmotionSeed(this.getModelRevision(), text, caption, seedVariant)

    return {
      text,
      caption,
      durationScale,
      seed,
      seedVariant,
      numSteps,
      speakerKvScale,
      speakerKvMinT,
    }
  }

  private safeNumber(
    value: number | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback
    }
    return Math.min(maximum, Math.max(minimum, value))
  }

  private nextSeedVariant(input: string): number {
    const configured = this.phraseConfig.lines?.[input]
    const line = typeof configured === 'string' ? undefined : configured
    if (typeof line?.seed === 'number' && Number.isFinite(line.seed)) {
      return 0
    }
    const emotion = line?.emotion
    const configuredCount =
      line?.seedVariants ??
      (emotion ? this.phraseConfig.emotionSeedVariants?.[emotion] : undefined) ??
      this.phraseConfig.defaultSeedVariants ??
      1
    const count = Math.round(this.safeNumber(configuredCount, 1, 1, 8))
    const initial = createHash('sha256').update(input).digest().readUInt32BE(0) % count
    const current = this.seedVariantCursor.get(input) ?? initial
    this.seedVariantCursor.set(input, (current + 1) % count)
    return current
  }

  private async generate(
    voice: 'Kyoko' | 'Tingting',
    text: string,
    cacheKey: string,
  ): Promise<LocalSpeechResult | null> {
    await mkdir(this.cacheDirectory, { recursive: true })
    const cachePath = join(this.cacheDirectory, `${cacheKey}.wav`)
    if (existsSync(cachePath)) {
      return this.speechResult(await readFile(cachePath), 'macos-say')
    }

    const temporaryAiff = join(this.cacheDirectory, `${cacheKey}.${process.pid}.aiff`)
    const temporaryWav = join(this.cacheDirectory, `${cacheKey}.${process.pid}.wav`)
    try {
      await execFileAsync('/usr/bin/say', [
        '-v',
        voice,
        '-r',
        String(SPEECH_RATE),
        '-o',
        temporaryAiff,
        text,
      ])
      await execFileAsync('/usr/bin/afconvert', [
        temporaryAiff,
        temporaryWav,
        '-f',
        'WAVE',
        '-d',
        'LEI16@22050',
      ])
      await rename(temporaryWav, cachePath)
      this.scheduleCachePrune()
      return this.speechResult(await readFile(cachePath), 'macos-say')
    } catch (error) {
      console.error('Local TTS failed:', error)
      return null
    } finally {
      await Promise.all(
        [temporaryAiff, temporaryWav].map(async (path) => {
          if (existsSync(path)) {
            await unlink(path)
          }
        }),
      )
    }
  }

  private speechResult(
    audio: Uint8Array,
    source: LocalSpeechSource,
    seed?: number,
    seedVariant?: number,
  ): LocalSpeechResult {
    return { audio, source, seed, seedVariant }
  }
}
