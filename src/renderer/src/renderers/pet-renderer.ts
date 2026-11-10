import type {
  FacingDirection,
  HitArea,
  MicroMotionKind,
  PetAnimation,
  PetExpression,
  Point2D,
} from '@shared/types'

export type RenderPowerMode = 'active' | 'idle' | 'low-power' | 'paused'

export interface ActionPlaybackOptions {
  immediate?: boolean
  loop?: boolean
}

export interface ActionPlaybackMetadata {
  durationMs: number
  loop: boolean
}

export interface PetRenderer {
  readonly id: string
  mount(container: HTMLElement): Promise<void>
  getCanvas(): HTMLCanvasElement
  playAction(action: PetAnimation, options?: ActionPlaybackOptions): ActionPlaybackMetadata | void
  playClip?(clip: string): ActionPlaybackMetadata | void
  playSustainedAction?(action: PetAnimation): ActionPlaybackMetadata | void
  setExpression(expression: PetExpression): void
  setMicroMotion?(motion: MicroMotionKind, durationMs: number): void
  setScale?(scale: number): void
  setPowerMode?(mode: RenderPowerMode): void
  setGaze(point: Point2D | null): void
  setFacing(direction: FacingDirection): void
  getHitAreas(): readonly HitArea[]
  hitTest(point: Point2D): HitArea | undefined
  destroy(): void
}
