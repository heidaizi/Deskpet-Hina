export interface DatedMemory {
  text: string
  at: number
}

/** 找出「往年今日」的一条回忆：同月同日、但不是今年。 */
export function findOnThisDay(
  memories: readonly DatedMemory[],
  now = Date.now(),
): DatedMemory | null {
  const today = new Date(now)
  const matches = memories.filter((memory) => {
    const date = new Date(memory.at)
    return (
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate() &&
      date.getFullYear() < today.getFullYear() &&
      memory.text.trim().length > 0
    )
  })
  if (matches.length === 0) {
    return null
  }
  return matches.sort((a, b) => b.at - a.at)[0]
}
