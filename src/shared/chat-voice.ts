/**
 * 对话场景的配音语气。
 *
 * DeepSeek 每条回复都会带一个 emotion，如果直接映射成配音样式，
 * 声音会在 neutral / soft / annoyed 之间来回跳。对话里只保留两档：
 * 平时用 neutral，明显不悦时 annoyed；关系足够近才允许 soft。
 */
export function resolveChatTtsEmotion(
  emotion: string | undefined,
  stageId = 1,
): 'neutral' | 'annoyed' | 'soft' {
  const value = (emotion ?? '').trim().toLowerCase()
  if (value === 'angry' || value === 'annoyed' || value === 'stern' || value === 'warning') {
    return 'annoyed'
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
