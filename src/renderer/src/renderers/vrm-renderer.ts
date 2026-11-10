import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
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
  { id: 'head', type: 'circle', x: 170, y: 142, radius: 66 },
  { id: 'body', type: 'rect', x: 118, y: 205, width: 104, height: 185 },
]

const EXPRESSION_MAP: Record<PetExpression, readonly [string, number][]> = {
  neutral: [['neutral', 1]],
  happy: [['happy', 1]],
  annoyed: [['angry', 0.9]],
  embarrassed: [
    ['relaxed', 0.7],
    ['happy', 0.25],
  ],
  sleepy: [['blink', 0.9]],
  surprised: [['surprised', 1]],
}

export class VRMRenderer implements PetRenderer {
  readonly id = '3d-vrm'

  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(30, WINDOW_WIDTH / WINDOW_HEIGHT, 0.01, 20)
  private readonly renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  })
  private readonly lookTarget = new THREE.Object3D()
  private readonly baseQuaternions = new Map<VRMHumanBoneName, THREE.Quaternion>()
  private readonly temporaryQuaternion = new THREE.Quaternion()
  private readonly temporaryEuler = new THREE.Euler()
  private vrm: VRM | null = null
  private action: PetAnimation = 'idle'
  private actionStartedAt = 0
  private expression: PetExpression = 'neutral'
  private destroyed = false
  private facing: FacingDirection = 'right'
  private powerMode: RenderPowerMode = 'active'
  private animationLoopRunning = false
  private lastRenderAt = 0
  private elapsedSeconds = 0

  constructor(
    private readonly assetPath: string,
    private readonly loadAsset: (assetPath: string) => Promise<Uint8Array>,
  ) {}

  async mount(container: HTMLElement): Promise<void> {
    this.updateRendererResolution()
    this.renderer.setSize(WINDOW_WIDTH, WINDOW_HEIGHT)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    const canvas = this.renderer.domElement
    canvas.id = 'pet-canvas'
    container.prepend(canvas)

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x78699c, 1.15)
    const keyLight = new THREE.DirectionalLight(0xfff7ee, 1.35)
    keyLight.position.set(2.5, 4, 3)
    const rimLight = new THREE.DirectionalLight(0xcbb8ff, 0.55)
    rimLight.position.set(-2.5, 2.5, -2)
    this.scene.add(hemisphere, keyLight, rimLight, this.lookTarget)

    const asset = await this.loadAsset(this.assetPath)
    const gltf = await this.parseVrm(asset)
    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm) {
      throw new Error('The selected file does not contain VRM data.')
    }

    this.vrm = vrm
    VRMUtils.rotateVRM0(vrm)
    vrm.scene.traverse((object) => {
      object.frustumCulled = false
    })

    const bounds = new THREE.Box3().setFromObject(vrm.scene)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    vrm.scene.position.x -= center.x
    vrm.scene.position.y -= bounds.min.y
    vrm.scene.position.z -= center.z
    this.scene.add(vrm.scene)

    const height = Math.max(1, size.y)
    const targetY = height * 0.52
    const distance = (height / (2 * Math.tan(THREE.MathUtils.degToRad(15)))) * 1.32
    this.camera.position.set(0, targetY, distance)
    this.camera.lookAt(0, targetY, 0)

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(0.3, size.x * 0.42), 48),
      new THREE.MeshBasicMaterial({
        color: 0x3f315c,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.008
    this.scene.add(shadow)

    this.captureBaseBones()
    if (vrm.lookAt) {
      this.lookTarget.position.set(0, targetY, distance)
      vrm.lookAt.target = this.lookTarget
    }

    this.startAnimationLoop()
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement
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
    this.action = action
    this.actionStartedAt = performance.now()
    this.renderer.domElement.dataset.sustainedAction = action
    return {
      durationMs: 2_400,
      loop: true,
    }
  }

  setExpression(expression: PetExpression): void {
    this.expression = expression
  }

  setMicroMotion(motion: MicroMotionKind, durationMs: number): void {
    this.renderer.domElement.dataset.microMotion = motion
    this.renderer.domElement.dataset.microMotionUntil = String(performance.now() + durationMs)
  }

  setGaze(point: Point2D | null): void {
    if (!point || !this.vrm?.lookAt) {
      return
    }
    const normalizedX = THREE.MathUtils.clamp((point.x - 170) / 110, -1, 1)
    const normalizedY = THREE.MathUtils.clamp((145 - point.y) / 130, -1, 1)
    this.lookTarget.position.set(normalizedX * 0.65, 1.28 + normalizedY * 0.36, 1.5)
  }

  setFacing(direction: FacingDirection): void {
    this.facing = direction
  }

  setPowerMode(mode: RenderPowerMode): void {
    this.powerMode = mode
    this.renderer.domElement.dataset.renderPowerMode = mode
    this.updateRendererResolution()
    if (mode === 'paused') {
      this.renderFrame(true)
      this.stopAnimationLoop()
      return
    }
    this.startAnimationLoop()
    this.lastRenderAt = performance.now()
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
    this.stopAnimationLoop()
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene)
      this.vrm = null
    }
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private updateRendererResolution(): void {
    const powerScale = this.powerMode === 'low-power' ? 0.72 : 1
    this.renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * powerScale, 2))
    this.renderer.domElement.dataset.renderPowerMode = this.powerMode
  }

  private startAnimationLoop(): void {
    if (this.destroyed || this.animationLoopRunning || this.powerMode === 'paused') {
      return
    }
    this.animationLoopRunning = true
    this.renderer.setAnimationLoop(() => {
      if (!this.destroyed && this.powerMode !== 'paused') {
        this.renderFrame()
      }
    })
  }

  private stopAnimationLoop(): void {
    this.animationLoopRunning = false
    this.renderer.setAnimationLoop(null)
  }

  private renderFrame(force = false): void {
    const vrm = this.vrm
    if (!vrm) {
      return
    }

    const now = performance.now()
    const targetFps = this.powerMode === 'low-power' ? 15 : this.powerMode === 'idle' ? 30 : 60
    if (!force && now - this.lastRenderAt < 1000 / targetFps - 1) {
      return
    }

    const delta = Math.min((now - this.lastRenderAt) / 1000, 0.05)
    this.lastRenderAt = now
    this.elapsedSeconds += delta
    const elapsed = this.elapsedSeconds
    const actionPulse = THREE.MathUtils.clamp(1 - (now - this.actionStartedAt) / 900, 0, 1)

    this.resetBones()
    this.applyRestPose()
    this.applyProceduralAnimation(elapsed, actionPulse)
    this.applyExpression()
    vrm.scene.rotation.y = this.facing === 'left' ? 0.16 : -0.16
    vrm.update(delta)
    this.renderer.render(this.scene, this.camera)
  }

  private captureBaseBones(): void {
    if (!this.vrm) {
      return
    }
    const boneNames: VRMHumanBoneName[] = [
      'hips',
      'spine',
      'chest',
      'head',
      'leftUpperArm',
      'rightUpperArm',
      'leftLowerArm',
      'rightLowerArm',
      'leftUpperLeg',
      'rightUpperLeg',
    ]
    for (const name of boneNames) {
      const bone = this.vrm.humanoid.getNormalizedBoneNode(name)
      if (bone) {
        this.baseQuaternions.set(name, bone.quaternion.clone())
      }
    }
  }

  private resetBones(): void {
    if (!this.vrm) {
      return
    }
    for (const [name, quaternion] of this.baseQuaternions) {
      this.vrm.humanoid.getNormalizedBoneNode(name)?.quaternion.copy(quaternion)
    }
  }

  private addBoneRotation(name: VRMHumanBoneName, x: number, y: number, z: number): void {
    const bone = this.vrm?.humanoid.getNormalizedBoneNode(name)
    if (!bone) {
      return
    }
    this.temporaryEuler.set(x, y, z)
    this.temporaryQuaternion.setFromEuler(this.temporaryEuler)
    bone.quaternion.multiply(this.temporaryQuaternion)
  }

  private applyProceduralAnimation(elapsed: number, actionPulse: number): void {
    const idle = Math.sin(elapsed * 1.45)
    this.addBoneRotation('chest', idle * 0.008, 0, idle * 0.012)
    this.addBoneRotation('head', idle * 0.014, Math.sin(elapsed * 0.55) * 0.025, 0)

    switch (this.action) {
      case 'sleep':
        this.addBoneRotation('head', 0.23, 0.08, 0.06)
        this.addBoneRotation('chest', 0.04, 0, 0.02)
        break
      case 'walk': {
        const stride = Math.sin(elapsed * 9)
        this.addBoneRotation('leftUpperLeg', stride * 0.24, 0, 0)
        this.addBoneRotation('rightUpperLeg', -stride * 0.24, 0, 0)
        this.addBoneRotation('leftUpperArm', -stride * 0.2, 0, 0)
        this.addBoneRotation('rightUpperArm', stride * 0.2, 0, 0)
        break
      }
      case 'wave':
        this.addBoneRotation('rightUpperArm', 0, 0, -0.72 + Math.sin(elapsed * 8) * 0.12)
        this.addBoneRotation('rightLowerArm', 0, 0, -0.45 + Math.sin(elapsed * 8) * 0.16)
        break
      case 'stretch':
        this.addBoneRotation('leftUpperArm', 0, 0, -0.55)
        this.addBoneRotation('rightUpperArm', 0, 0, 0.55)
        this.addBoneRotation('chest', -0.08, 0, 0)
        break
      case 'tap_head':
      case 'headpat':
        this.addBoneRotation('head', -0.12 * actionPulse, 0, 0.08 * actionPulse)
        break
      case 'tap_horn':
      case 'tap_halo':
      case 'tap_body':
        this.addBoneRotation('head', 0, Math.sin(elapsed * 40) * 0.12 * actionPulse, 0)
        break
      case 'annoyed':
      case 'drag_loop':
        this.addBoneRotation('head', 0, Math.sin(elapsed * 35) * 0.16 * actionPulse, 0)
        this.addBoneRotation('chest', 0, 0, -0.06 * actionPulse)
        break
      case 'surprised':
      case 'wake':
        this.addBoneRotation('head', -0.12 * actionPulse, 0, 0)
        this.addBoneRotation('chest', -0.05 * actionPulse, 0, 0)
        break
      default:
        break
    }
  }

  private applyRestPose(): void {
    this.addBoneRotation('leftUpperArm', 0, 0, -1.05)
    this.addBoneRotation('rightUpperArm', 0, 0, 1.05)
    this.addBoneRotation('leftLowerArm', 0, 0, -0.08)
    this.addBoneRotation('rightLowerArm', 0, 0, 0.08)

    if (this.action === 'wave') {
      this.addBoneRotation('rightUpperArm', 0, 0, 1.26)
      this.addBoneRotation('rightLowerArm', 0, 0, 0.6)
    } else if (this.action === 'stretch') {
      this.addBoneRotation('leftUpperArm', 0, 0, 0.72)
      this.addBoneRotation('rightUpperArm', 0, 0, -0.72)
    }
  }

  private applyExpression(): void {
    const expressionManager = this.vrm?.expressionManager
    if (!expressionManager) {
      return
    }

    expressionManager.resetValues()
    for (const [name, value] of EXPRESSION_MAP[this.expression]) {
      if (expressionManager.getExpression(name)) {
        expressionManager.setValue(name, value)
      }
    }
  }

  private parseVrm(asset: Uint8Array): Promise<GLTF> {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    const arrayBuffer = asset.buffer.slice(
      asset.byteOffset,
      asset.byteOffset + asset.byteLength,
    ) as ArrayBuffer

    return new Promise<GLTF>((resolve, reject) => {
      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          resolve(gltf)
        },
        (error) => {
          reject(error)
        },
      )
    })
  }
}
