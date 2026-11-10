/**
 * 视线相关的纯计算。
 *
 * 这些逻辑原先内联在 GLB 渲染器里，无法做单元测试；抽出来之后渲染器只负责
 * 把结果写给骨骼，数值行为由 `tests/unit/gaze.test.ts` 固定。
 */

export interface GazePoint {
  x: number
  y: number
}

export interface GazeAnchor {
  /** 视线中心的屏幕 X 坐标。 */
  originX: number
  /** X 方向从中心到边缘的像素跨度。 */
  spanX: number
  /** 视线中心的屏幕 Y 坐标。 */
  originY: number
  /** Y 方向从中心到边缘的像素跨度。 */
  spanY: number
}

// 与拆分前渲染器内的硬编码常量保持一致，避免改变实际视线手感。
export const DEFAULT_GAZE_ANCHOR: GazeAnchor = {
  originX: 170,
  spanX: 110,
  originY: 145,
  spanY: 130,
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(-1, value))
}

/**
 * 把屏幕坐标归一化到 -1..1 的视线目标。
 */
export function normalizeGazeTarget(
  point: GazePoint,
  anchor: GazeAnchor = DEFAULT_GAZE_ANCHOR,
): GazePoint {
  return {
    x: clampUnit((point.x - anchor.originX) / anchor.spanX),
    y: clampUnit((anchor.originY - point.y) / anchor.spanY),
  }
}

/**
 * 待机时的视线微扫视。两段不同频率的正弦叠加，避免机械的匀速摆动。
 */
export function idleGazeOffset(elapsedSeconds: number, boost = 1): GazePoint {
  const safeElapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0
  const safeBoost = Number.isFinite(boost) && boost > 0 ? boost : 1
  return {
    x:
      Math.sin(safeElapsed * 0.43) * 0.055 * safeBoost +
      Math.sin(safeElapsed * 1.07 + 0.8) * 0.018 * safeBoost,
    y:
      Math.sin(safeElapsed * 0.31 + 1.4) * 0.028 * safeBoost +
      Math.sin(safeElapsed * 0.87) * 0.012 * safeBoost,
  }
}

/**
 * 渲染分辨率：设备像素比 × 超采样 × 功耗系数，并受最大像素比约束。
 */
export function resolveRenderPixelRatio(
  devicePixelRatio: number,
  supersample: number,
  powerMode: 'active' | 'idle' | 'low-power' | 'paused',
  maxPixelRatio: number,
): number {
  const safeDeviceRatio = Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1)
  const safeSupersample = Math.max(0, Number.isFinite(supersample) ? supersample : 1)
  // 与拆分前一致：只有低功耗档降低分辨率。
  const powerScale = powerMode === 'low-power' ? 0.72 : 1
  return Math.min(safeDeviceRatio * safeSupersample * powerScale, maxPixelRatio)
}
