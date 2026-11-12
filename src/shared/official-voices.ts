import type { PetAnimation, PetExpression } from './types'
import { OUTFIT_VOICE_PATHS, OUTFIT_VOICE_TEXT } from './official-voices-outfit-data'

export interface OfficialVoiceLine {
  clip: string
  path: string
  text: string
  action: PetAnimation
  modelClip: string
  expression: PetExpression
}

const voiceRoot = 'assets/characters/hina-swimsuit/private/audio/official-denoise45'

function line(
  clip: string,
  text: string,
  action: PetAnimation,
  modelClip: string,
  expression: PetExpression,
): OfficialVoiceLine {
  return {
    clip,
    path: `${voiceRoot}/${clip}.wav`,
    text,
    action,
    modelClip,
    expression,
  }
}

export const OFFICIAL_VOICE_LINES: readonly OfficialVoiceLine[] = [
  line('Cafe_monolog_1', '这件泳装，不奇怪吗……？', 'embarrassed', 'Cafe_Idle', 'embarrassed'),
  line('Cafe_monolog_2', '也许是训练的缘故……身体有点发沉。', 'sleep', 'Normal_Idle', 'sleepy'),
  line(
    'Lobby_2',
    '倒也不是期待，或者一直盼着……。那个，只有一点点而已……。',
    'embarrassed',
    'Formation_Idle',
    'embarrassed',
  ),
  line(
    'Lobby_3',
    '训练固然好，但休息也很重要？……确实这也很有道理。可是，我不能偷懒。',
    'stretch',
    'Cafe_Idle',
    'sleepy',
  ),
  line(
    'Lobby_4',
    '有什么我能做的……？谢谢你，老师。光是这么说，我就很高兴。',
    'happy',
    'Public01',
    'happy',
  ),
  line(
    'Lobby_5',
    '直到这个夏天结束的最后一刻……我都会在老师身边，帮助你。',
    'happy',
    'Public01',
    'happy',
  ),
  line(
    'LogIn_1',
    '啊，欢迎回来，老师。训练的准备已经做好了。',
    'wave',
    'Normal_Callsign',
    'neutral',
  ),
  line(
    'EventLobby_3',
    '夏季训练合宿。没想到今年会和老师一起……有点新鲜。',
    'happy',
    'Formation_Idle',
    'neutral',
  ),
  line('Battle_Damage_2', '唉，真是的……！', 'annoyed', 'Cafe_Reaction', 'annoyed'),
  line('Battle_Move_2', '唉……还在啊？', 'annoyed', 'Cafe_Reaction', 'annoyed'),
  line('ExSkill_Level_1', '差不多该放弃了吧？', 'annoyed', 'Normal_Attack_Start', 'annoyed'),
  line('Relationship_Up_1', '今年夏天，也能和老师在一起呢。', 'happy', 'Public01', 'happy'),
  line(
    'Season_Birthday_2',
    '诶，总之先一起跳进海里吧？等、等一下老师！我、我还没做好心理准备……！',
    'surprised',
    'Vital_Panic',
    'surprised',
  ),
] as const

/** 官方语音对应的中文文本（按服装区分）。 */
export function getOfficialVoiceText(clip: string, outfitId?: string): string | undefined {
  if (outfitId) {
    return OUTFIT_VOICE_TEXT[outfitId]?.[clip]
  }
  return getOfficialVoiceLine(clip)?.text
}

export function getOfficialVoiceLine(
  clip: string | undefined,
  outfitId?: string,
): OfficialVoiceLine | undefined {
  const base = OFFICIAL_VOICE_LINES.find((entry) => entry.clip === clip)
  if (!base) {
    return undefined
  }
  if (!outfitId) {
    return base
  }
  const outfitPath = OUTFIT_VOICE_PATHS[outfitId]?.[base.clip]
  // 该服装没有这段官方语音时交给实时合成，避免串用其他服装的声音。
  return outfitPath ? { ...base, path: outfitPath } : undefined
}

export function pickRandomOfficialVoiceLine(
  random: () => number = Math.random,
  excludedClip?: string,
): OfficialVoiceLine {
  const choices = OFFICIAL_VOICE_LINES.filter((entry) => entry.clip !== excludedClip)
  const index = Math.min(choices.length - 1, Math.floor(random() * choices.length))
  return choices[index] ?? OFFICIAL_VOICE_LINES[0]
}
