import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPetAnimation, isPetExpression } from '../../shared/types'
import type { OutfitGreeting } from '../../shared/types'

export type OutfitGreetingScene = 'login' | 'return'

interface OutfitLineFile {
  voice: string
  ja: string
  zh: string
  action?: string
  expression?: string
}

interface OutfitVoiceFile {
  schemaVersion: number
  outfits: Record<string, Partial<Record<OutfitGreetingScene, OutfitLineFile>>>
}

let cache: OutfitVoiceFile | null = null

function load(contentDir: string): OutfitVoiceFile | null {
  if (cache) {
    return cache
  }
  const path = join(contentDir, 'outfit-voices.json')
  if (!existsSync(path)) {
    return null
  }
  try {
    cache = JSON.parse(readFileSync(path, 'utf8')) as OutfitVoiceFile
    return cache
  } catch {
    return null
  }
}

/** 读取指定服装在固定场景下的官方语音与台词。 */
export function getOutfitGreeting(
  contentDir: string,
  outfitId: string,
  scene: OutfitGreetingScene,
): OutfitGreeting | null {
  const data = load(contentDir)
  const line = data?.outfits?.[outfitId]?.[scene]
  if (!line?.voice || !line.zh || !line.ja) {
    return null
  }
  const action = line.action && isPetAnimation(line.action) ? line.action : 'idle'
  const expression =
    line.expression && isPetExpression(line.expression) ? line.expression : 'neutral'
  return {
    dialogue: line.zh,
    spokenText: line.ja,
    voice: line.voice,
    action,
    expression,
  }
}
