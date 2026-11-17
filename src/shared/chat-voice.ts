/**
 * 对话场景的配音语气。
 *
 * DeepSeek 每条回复都会带一个 emotion，如果直接映射成配音样式，
 * 声音会在 neutral / soft / annoyed 之间来回跳。对话里只保留两档：
 * 平时用 neutral，明显不悦时 annoyed；关系足够近才允许 soft。
 */
export interface ChatVoiceWorldContext {
  /** 番茄钟专注中：语气收敛，避免情绪大起大落。 */
  pomodoroActive?: boolean
  /** presence 疲劳值 0–100。 */
  fatigue?: number
}

export function resolveChatTtsEmotion(
  emotion: string | undefined,
  stageId = 1,
  world?: ChatVoiceWorldContext,
): 'neutral' | 'annoyed' | 'soft' {
  const value = (emotion ?? '').trim().toLowerCase()
  const annoyed =
    value === 'angry' || value === 'annoyed' || value === 'stern' || value === 'warning'
  if (annoyed) {
    return 'annoyed'
  }
  // 专注时压低情绪波动，除非确实不高兴。
  if (world?.pomodoroActive) {
    return 'neutral'
  }
  // 很累的时候声音放软一点，但不改变明显不悦的回复。
  if ((world?.fatigue ?? 0) >= 75 && stageId >= 3) {
    return 'soft'
  }
  // 关系越近，越允许声音软下来；早期阶段保持中性。
  const softAt3 = value === 'embarrassed' || value === 'soft'
  const softAt4 = softAt3 || value === 'happy' || value === 'playful' || value === 'tender'
  if (stageId >= 4 && softAt4) {
    return 'soft'
  }
  if (stageId >= 3 && softAt3) {
    return 'soft'
  }
  return 'neutral'
}

/** 世界状态带来的语速微调；undefined 表示沿用默认。 */
export function resolveChatTtsDurationScale(
  emotion: string | undefined,
  world?: ChatVoiceWorldContext,
): number | undefined {
  const value = (emotion ?? '').trim().toLowerCase()
  if (value === 'angry' || value === 'annoyed' || value === 'stern' || value === 'warning') {
    return undefined
  }
  if ((world?.fatigue ?? 0) >= 75) {
    return 1.04
  }
  if (world?.pomodoroActive) {
    return 0.98
  }
  return undefined
}
