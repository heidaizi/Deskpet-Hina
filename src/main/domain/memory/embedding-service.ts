import { join } from 'node:path'

/**
 * 本地文本嵌入（multilingual-e5-small，384 维）。
 *
 * 首次使用会从镜像下载约 120MB 模型到用户目录；失败时返回 null，
 * 调用方回退到词面匹配，不影响主流程。
 */
export type Embedder = (text: string) => Promise<number[] | null>

const MODEL_ID = 'Xenova/multilingual-e5-small'
const REMOTE_HOST = 'https://hf-mirror.com'

export function createEmbeddingService(userDataPath: string): {
  embed: Embedder
  warmup: () => Promise<boolean>
} {
  let extractorPromise: Promise<((texts: string[]) => Promise<number[][]>) | null> | null = null

  async function load(): Promise<((texts: string[]) => Promise<number[][]>) | null> {
    if (extractorPromise) {
      return extractorPromise
    }
    extractorPromise = (async () => {
      try {
        const { pipeline, env } = await import('@huggingface/transformers')
        env.remoteHost = REMOTE_HOST
        env.cacheDir = join(userDataPath, 'embeddings')
        const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' })
        return async (texts: string[]) => {
          const output = await extractor(texts, { pooling: 'mean', normalize: true })
          return output.tolist() as number[][]
        }
      } catch (error) {
        console.warn('[embeddings] 模型不可用，回退到词面匹配:', error)
        return null
      }
    })()
    return extractorPromise
  }

  const embed: Embedder = async (text) => {
    const fn = await load()
    if (!fn) {
      return null
    }
    try {
      const [vector] = await fn([text])
      return vector ?? null
    } catch {
      return null
    }
  }

  return { embed, warmup: async () => (await load()) !== null }
}
