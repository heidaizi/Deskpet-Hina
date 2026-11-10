export function dampMotion(
  current: number,
  target: number,
  deltaSeconds: number,
  responsiveness: number,
): number {
  const safeDelta = Math.max(0, deltaSeconds)
  const safeResponsiveness = Math.max(0, responsiveness)
  const alpha = 1 - Math.exp(-safeResponsiveness * safeDelta)
  return current + (target - current) * alpha
}

export function stableUnitHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0xffffffff
}
