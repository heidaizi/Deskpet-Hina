const SENTENCE_OR_CLAUSE = /[^。！？!?、，,；;]+[。！？!?、，,；;]*/gu
const STRONG_END = /[。！？!?]$/u
const JAPANESE = /[\u3040-\u30ff]/u

export interface SpeechChunkOptions {
  firstChunkChars?: number
  maxChunkChars?: number
  minimumTailChars?: number
}

export function shouldChunkSpeech(text: string): boolean {
  return JAPANESE.test(text) && characterCount(text) > 18
}

export function splitSpeechText(text: string, options: SpeechChunkOptions = {}): string[] {
  const normalized = text.replace(/\s+/gu, ' ').trim()
  if (!normalized) {
    return []
  }
  const firstChunkChars = Math.max(8, options.firstChunkChars ?? 12)
  const maxChunkChars = Math.max(firstChunkChars, options.maxChunkChars ?? 36)
  const minimumTailChars = Math.max(1, options.minimumTailChars ?? 5)
  if (!shouldChunkSpeech(normalized)) {
    return [normalized]
  }

  const units = (normalized.match(SENTENCE_OR_CLAUSE) ?? [normalized]).flatMap((unit) =>
    splitLongUnit(unit.trim(), maxChunkChars),
  )
  const chunks: string[] = []
  let current = ''

  const flush = (): void => {
    const value = current.trim()
    if (value) {
      chunks.push(value)
    }
    current = ''
  }

  for (const unit of units) {
    if (current && characterCount(current + unit) > maxChunkChars) {
      flush()
    }
    current += unit
    const firstTargetReached = chunks.length === 0 && characterCount(current) >= firstChunkChars
    if (
      (chunks.length === 0 && STRONG_END.test(unit)) ||
      firstTargetReached ||
      characterCount(current) >= maxChunkChars ||
      STRONG_END.test(unit)
    ) {
      flush()
    }
  }
  flush()

  if (
    chunks.length > 1 &&
    characterCount(chunks.at(-1) ?? '') < minimumTailChars &&
    characterCount(`${chunks.at(-2)}${chunks.at(-1)}`) <= maxChunkChars
  ) {
    const tail = chunks.pop() ?? ''
    chunks[chunks.length - 1] = `${chunks.at(-1)}${tail}`
  }
  return chunks
}

function splitLongUnit(unit: string, maximum: number): string[] {
  const characters = Array.from(unit)
  if (characters.length <= maximum) {
    return [unit]
  }
  const result: string[] = []
  for (let index = 0; index < characters.length; index += maximum) {
    result.push(characters.slice(index, index + maximum).join(''))
  }
  return result
}

function characterCount(value: string): number {
  return Array.from(value).length
}
