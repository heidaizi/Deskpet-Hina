import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics } from 'pixi.js'
import type {
  FacingDirection,
  HitArea,
  MicroMotionKind,
  PetAnimation,
  PetExpression,
  Point2D,
} from '@shared/types'
import type {
  ActionPlaybackMetadata,
  ActionPlaybackOptions,
  PetRenderer,
  RenderPowerMode,
} from './pet-renderer'

const WINDOW_WIDTH = 340
const WINDOW_HEIGHT = 460

const HIT_AREAS: HitArea[] = [
  { id: 'horn-left', type: 'circle', x: 144, y: 84, radius: 20 },
  { id: 'horn-right', type: 'circle', x: 196, y: 84, radius: 20 },
  { id: 'halo', type: 'circle', x: 170, y: 55, radius: 43 },
  { id: 'head', type: 'circle', x: 170, y: 148, radius: 64 },
  { id: 'body', type: 'rect', x: 116, y: 218, width: 108, height: 154 },
]

export class PlaceholderPixiRenderer implements PetRenderer {
  readonly id = '2d-placeholder'

  private app = new Application()
  private body!: Container
  private head!: Container
  private halo!: Graphics
  private leftEye!: Graphics
  private rightEye!: Graphics
  private mouth!: Graphics
  private blush!: Graphics
  private elapsedMs = 0
  private lookTargetX = 0
  private lookTargetY = 0
  private currentLookX = 0
  private currentLookY = 0
  private action: PetAnimation = 'idle'
  private actionStartedAt = 0
  private expression: PetExpression = 'neutral'
  private expressionUntil = 0
  private facing: FacingDirection = 'right'
  private destroyed = false
  private powerMode: RenderPowerMode = 'active'

  async mount(container: HTMLElement): Promise<void> {
    await this.app.init({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    })

    const canvas = this.app.canvas
    canvas.id = 'pet-canvas'
    canvas.dataset.renderPowerMode = this.powerMode
    container.prepend(canvas)

    const shadow = new Graphics().ellipse(170, 417, 78, 18).fill({ color: 0x45375f, alpha: 0.13 })
    this.app.stage.addChild(shadow)

    this.halo = new Graphics()
      .ellipse(0, 0, 47, 14)
      .stroke({ color: 0x8a6cff, alpha: 0.34, width: 9 })
      .ellipse(0, 0, 47, 14)
      .stroke({ color: 0xd7c9ff, alpha: 0.95, width: 3 })
    this.halo.position.set(170, 55)
    this.app.stage.addChild(this.halo)

    this.body = this.createBody()
    this.app.stage.addChild(this.body)
    this.head = this.createHead()
    this.app.stage.addChild(this.head)

    const leftEye = this.head.getChildByName('left-eye')
    const rightEye = this.head.getChildByName('right-eye')
    if (!(leftEye instanceof Graphics) || !(rightEye instanceof Graphics)) {
      throw new Error('Pet eyes were not created.')
    }
    this.leftEye = leftEye
    this.rightEye = rightEye

    const mouth = this.head.getChildByName('mouth')
    const blush = this.head.getChildByName('blush')
    if (!(mouth instanceof Graphics) || !(blush instanceof Graphics)) {
      throw new Error('Pet face features were not created.')
    }
    this.mouth = mouth
    this.blush = blush

    this.app.ticker.add((ticker) => {
      if (!this.destroyed) {
        this.update(ticker.deltaMS)
      }
    })
  }

  getCanvas(): HTMLCanvasElement {
    return this.app.canvas
  }

  playAction(action: PetAnimation, options: ActionPlaybackOptions = {}): ActionPlaybackMetadata {
    this.action = action
    this.actionStartedAt = performance.now()
    return {
      durationMs: action === 'idle' || action === 'walk' || action === 'sleep' ? 2_400 : 1_200,
      loop: options.loop ?? (action === 'idle' || action === 'walk' || action === 'sleep'),
    }
  }

  playSustainedAction(action: PetAnimation): ActionPlaybackMetadata {
    this.app.canvas.dataset.sustainedAction = action
    return {
      durationMs: 2_400,
      loop: true,
    }
  }

  setExpression(expression: PetExpression): void {
    this.expression = expression
    this.expressionUntil = expression === 'neutral' ? 0 : performance.now() + 2200
  }

  setMicroMotion(motion: MicroMotionKind, durationMs: number): void {
    this.app.canvas.dataset.microMotion = motion
    this.app.canvas.dataset.microMotionUntil = String(performance.now() + durationMs)
  }

  setGaze(point: Point2D | null): void {
    if (!point) {
      this.lookTargetX = 0
      this.lookTargetY = 0
      return
    }
    this.lookTargetX = clamp((point.x - 170) / 120, -1, 1)
    this.lookTargetY = clamp((point.y - 145) / 130, -1, 1)
  }

  setFacing(direction: FacingDirection): void {
    this.facing = direction
  }

  setPowerMode(mode: RenderPowerMode): void {
    this.powerMode = mode
    this.app.canvas.dataset.renderPowerMode = mode
    if (mode === 'paused') {
      this.app.ticker.stop()
      this.app.render()
      return
    }
    this.app.ticker.maxFPS = mode === 'low-power' ? 15 : mode === 'idle' ? 30 : 60
    this.app.ticker.start()
  }

  getHitAreas(): readonly HitArea[] {
    return HIT_AREAS
  }

  hitTest(point: Point2D): HitArea | undefined {
    return HIT_AREAS.find((area) => {
      if (area.type === 'circle') {
        const dx = point.x - area.x
        const dy = point.y - area.y
        return dx * dx + dy * dy <= area.radius * area.radius
      }
      return (
        point.x >= area.x &&
        point.x <= area.x + area.width &&
        point.y >= area.y &&
        point.y <= area.y + area.height
      )
    })
  }

  destroy(): void {
    this.destroyed = true
    this.app.destroy(true, { children: true })
  }

  private update(deltaMs: number): void {
    this.elapsedMs += deltaMs
    const now = performance.now()
    const actionAge = now - this.actionStartedAt
    const actionPulse = actionAge < 900 ? Math.max(0, 1 - actionAge / 900) : 0
    const idle = Math.sin(this.elapsedMs / 720)
    const slowIdle = Math.sin(this.elapsedMs / 1180)

    if (this.expression !== 'neutral' && now > this.expressionUntil) {
      this.expression = 'neutral'
    }

    this.body.y = 294 + idle * 1.7
    this.body.rotation = slowIdle * 0.006
    this.body.scale.set(1)
    this.head.y = 148 + idle * 2.4
    this.head.scale.set(1)
    this.halo.y = 55 + idle * 2.8
    this.halo.rotation = slowIdle * 0.035

    this.currentLookX += (this.lookTargetX - this.currentLookX) * 0.08
    this.currentLookY += (this.lookTargetY - this.currentLookY) * 0.08
    this.head.x = 170 + this.currentLookX * 6
    this.head.rotation = this.currentLookX * 0.035
    this.head.y += this.currentLookY * 2

    switch (this.action) {
      case 'sleep':
        this.head.rotation = 0.12
        this.head.y += 6
        this.body.y += 2
        this.expression = 'sleepy'
        break
      case 'annoyed':
        this.head.x += Math.sin(now / 35) * 4 * actionPulse
        this.body.rotation -= 0.025 * actionPulse
        break
      case 'surprised':
        this.head.scale.set(1 + 0.08 * actionPulse)
        break
      case 'drag_start':
      case 'drag_loop':
        this.body.rotation = Math.sin(now / 90) * 0.04
        this.head.rotation += Math.sin(now / 60) * 0.04
        break
      case 'tap_head':
      case 'headpat':
      case 'happy':
        this.head.y -= Math.sin(actionPulse * Math.PI) * 10
        this.head.scale.set(1 + actionPulse * 0.04)
        break
      case 'tap_horn':
      case 'tap_halo':
      case 'tap_body':
        this.head.x += Math.sin(now / 45) * 3 * actionPulse
        break
      case 'wave':
        this.body.rotation = Math.sin(now / 140) * 0.045
        break
      case 'stretch':
        this.body.scale.set(1 - actionPulse * 0.02, 1 + actionPulse * 0.04)
        break
      default:
        break
    }

    let eyeScale = 1
    let eyeRotation = 0
    if (this.expression === 'sleepy') {
      eyeScale = 0.12
    } else if (this.expression === 'happy') {
      eyeScale = 0.62
    } else if (this.expression === 'surprised') {
      eyeScale = 1.2
    } else if (this.expression === 'annoyed') {
      eyeRotation = 0.15
    }

    this.leftEye.scale.y = eyeScale
    this.rightEye.scale.y = eyeScale
    this.leftEye.rotation = -eyeRotation
    this.rightEye.rotation = eyeRotation
    this.mouth.scale.x = this.expression === 'happy' ? 1.35 : 1
    this.blush.alpha = this.expression === 'embarrassed' ? 0.55 : 0.22

    const facingScale = this.facing === 'left' ? -1 : 1
    this.head.scale.x = Math.abs(this.head.scale.x) * facingScale
    this.body.scale.x = Math.abs(this.body.scale.x) * facingScale
  }

  private createHead(): Container {
    const headContainer = new Container()
    headContainer.position.set(170, 148)

    const backHair = new Graphics()
      .roundRect(-62, -58, 124, 126, 49)
      .fill({ color: 0xd9d2f3 })
      .roundRect(-69, -18, 35, 107, 18)
      .fill({ color: 0xe7e2fb })
      .roundRect(34, -18, 35, 107, 18)
      .fill({ color: 0xe7e2fb })

    const leftHorn = new Graphics()
      .poly([-31, -52, -17, -84, -12, -48])
      .fill({ color: 0x343047 })
      .poly([-28, -56, -19, -75, -17, -52])
      .fill({ color: 0x5b5473 })

    const rightHorn = new Graphics()
      .poly([31, -52, 17, -84, 12, -48])
      .fill({ color: 0x343047 })
      .poly([28, -56, 19, -75, 17, -52])
      .fill({ color: 0x5b5473 })

    const face = new Graphics().circle(0, 3, 43).fill({ color: 0xffe8e3 })

    const fringe = new Graphics()
      .poly([
        -49, -35, -30, -61, -10, -43, 3, -65, 19, -42, 43, -57, 50, -19, 38, -2, 22, -27, 6, -15,
        -11, -34, -29, -5, -51, -12,
      ])
      .fill({ color: 0xf3efff })
      .poly([-4, -26, 12, -48, 19, -19, 38, -5, 8, 0])
      .fill({ color: 0xe8e1fa })

    const leftEye = new Graphics()
      .ellipse(0, 0, 5.2, 8.2)
      .fill({ color: 0x6e4d9d })
      .circle(1.5, -2.2, 1.3)
      .fill({ color: 0xffffff, alpha: 0.9 })
    leftEye.name = 'left-eye'
    leftEye.position.set(-17, 7)

    const rightEye = new Graphics()
      .ellipse(0, 0, 5.2, 8.2)
      .fill({ color: 0x6e4d9d })
      .circle(1.5, -2.2, 1.3)
      .fill({ color: 0xffffff, alpha: 0.9 })
    rightEye.name = 'right-eye'
    rightEye.position.set(17, 7)

    const mouth = new Graphics()
      .moveTo(-4, 24)
      .lineTo(4, 24)
      .stroke({ color: 0xa56573, width: 1.6, alpha: 0.8 })
    mouth.name = 'mouth'

    const blush = new Graphics()
      .ellipse(-28, 20, 8, 3.5)
      .fill({ color: 0xe999aa, alpha: 0.2 })
      .ellipse(28, 20, 8, 3.5)
      .fill({ color: 0xe999aa, alpha: 0.2 })
    blush.name = 'blush'

    headContainer.addChild(
      backHair,
      leftHorn,
      rightHorn,
      face,
      blush,
      leftEye,
      rightEye,
      mouth,
      fringe,
    )
    return headContainer
  }

  private createBody(): Container {
    const bodyContainer = new Container()
    bodyContainer.position.set(170, 294)

    const legs = new Graphics()
      .roundRect(-29, 67, 20, 72, 10)
      .fill({ color: 0xffe8e3 })
      .roundRect(9, 67, 20, 72, 10)
      .fill({ color: 0xffe8e3 })
      .ellipse(-19, 139, 17, 7)
      .fill({ color: 0x4a3e67 })
      .ellipse(19, 139, 17, 7)
      .fill({ color: 0x4a3e67 })

    const torso = new Graphics()
      .roundRect(-47, -54, 94, 135, 37)
      .fill({ color: 0xf8f5ff })
      .roundRect(-34, -16, 68, 83, 26)
      .fill({ color: 0x34384d })
      .roundRect(-34, 38, 68, 13, 6)
      .fill({ color: 0xd2c5fa, alpha: 0.8 })

    const arms = new Graphics()
      .moveTo(-41, -33)
      .lineTo(-64, 30)
      .stroke({ color: 0xffe8e3, width: 18, cap: 'round' })
      .moveTo(41, -33)
      .lineTo(64, 28)
      .stroke({ color: 0xffe8e3, width: 18, cap: 'round' })

    const ring = new Graphics()
      .ellipse(0, 50, 63, 18)
      .stroke({ color: 0xffa0b5, width: 13, alpha: 0.93 })
      .ellipse(0, 50, 63, 18)
      .stroke({ color: 0xffd6df, width: 4, alpha: 0.9 })

    bodyContainer.addChild(legs, torso, arms, ring)
    return bodyContainer
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
