import * as THREE from 'three'
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type {
  FacingDirection,
  HitArea,
  MicroMotionKind,
  PetAnimation,
  PetExpression,
  Point2D,
} from '@shared/types'
import {
  HINA_SWIMSUIT_ANIMATIONS,
  MODEL_SCALE_MAX,
  MODEL_SCALE_MIN,
} from '@shared/model-animations'
import { GLB_ANIMATION_MAP } from './glb-action-map'
import type {
  ActionPlaybackMetadata,
  ActionPlaybackOptions,
  PetRenderer,
  RenderPowerMode,
} from './pet-renderer'
import { idleGazeOffset, normalizeGazeTarget, resolveRenderPixelRatio } from './gaze'
import { dampMotion, stableUnitHash } from './procedural-motion'

const WINDOW_WIDTH = 340
const WINDOW_HEIGHT = 460
const RENDER_SUPERSAMPLE = 1.5
const MAX_RENDER_PIXEL_RATIO = 3
const MAX_TEXTURE_ANISOTROPY = 16
const GAZE_RESPONSIVENESS = 14

interface HairBoneMotion {
  bone: THREE.Object3D
  phase: number
  amplitude: number
}

const HIT_AREAS: HitArea[] = [
  { id: 'head', type: 'circle', x: 170, y: 140, radius: 67 },
  { id: 'body', type: 'rect', x: 116, y: 205, width: 108, height: 190 },
]

const MOUTH_MAP: Record<PetExpression, string> = {
  neutral: 'Mouth_0_1',
  happy: 'Mouth_1_1',
  annoyed: 'Mouth_0_3',
  embarrassed: 'Mouth_1_3',
  sleepy: 'Mouth_0_1',
  surprised: 'Mouth_0_0',
}

const MOUTH_NODE_NAMES = ['Mouth_0', 'Mouth_100', 'Mouth_101', 'Mouth_300', 'Mouth_301'] as const

export class GLBPetRenderer implements PetRenderer {
  readonly id = '3d-glb'

  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(30, WINDOW_WIDTH / WINDOW_HEIGHT, 0.01, 30)
  private readonly renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  })
  private outlineEffect: OutlineEffect | null = null
  private shadowSprite: THREE.Sprite | null = null
  private shadowTexture: THREE.CanvasTexture | null = null
  private readonly footBones: THREE.Object3D[] = []
  private readonly shadowWorldPosition = new THREE.Vector3()
  private readonly shadowLocalPosition = new THREE.Vector3()
  private modelHeight = 1
  private toonGradientMap: THREE.DataTexture | null = null
  private modelRoot = new THREE.Group()
  private model: THREE.Object3D | null = null
  private mixer: THREE.AnimationMixer | null = null
  private clips = new Map<string, THREE.AnimationClip>()
  private animations = new Map<string, THREE.AnimationAction>()
  private currentAction: THREE.AnimationAction | null = null
  private headBone: THREE.Object3D | null = null
  private neckBone: THREE.Object3D | null = null
  private spineBone: THREE.Object3D | null = null
  private spine1Bone: THREE.Object3D | null = null
  private leftClavicleBone: THREE.Object3D | null = null
  private rightClavicleBone: THREE.Object3D | null = null
  private readonly eyeBones: THREE.Object3D[] = []
  private readonly proceduralRestQuaternions = new Map<THREE.Object3D, THREE.Quaternion>()
  private hairBones: HairBoneMotion[] = []
  private readonly mouthNodes = new Map<string, THREE.Object3D>()
  private readonly temporaryEuler = new THREE.Euler()
  private readonly temporaryQuaternion = new THREE.Quaternion()
  private expression: PetExpression = 'neutral'
  private facing: FacingDirection = 'right'
  private gazeTargetX = 0
  private gazeTargetY = 0
  private currentGazeX = 0
  private currentGazeY = 0
  private gazeTargetActive = false
  private action: PetAnimation = 'idle'
  private microMotion: MicroMotionKind | null = null
  private microMotionUntil = 0
  private modelScale = 1
  private powerMode: RenderPowerMode = 'active'
  private animationLoopRunning = false
  private lastRenderAt = 0
  private elapsedSeconds = 0
  private lastClipTime = 0
  private clipCycleCount = 0
  private destroyed = false
  private readonly updateRenderResolution = (): void => {
    const pixelRatio = resolveRenderPixelRatio(
      window.devicePixelRatio || 1,
      RENDER_SUPERSAMPLE,
      this.powerMode,
      MAX_RENDER_PIXEL_RATIO,
    )
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(WINDOW_WIDTH, WINDOW_HEIGHT, false)
    const canvas = this.renderer.domElement
    canvas.dataset.renderPixelRatio = pixelRatio.toFixed(2)
    canvas.dataset.renderSupersample = RENDER_SUPERSAMPLE.toFixed(2)
  }

  constructor(
    private readonly assetPath: string,
    private readonly loadAsset: (assetPath: string) => Promise<Uint8Array>,
  ) {}

  async mount(container: HTMLElement): Promise<void> {
    this.updateRenderResolution()
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.setClearColor(0x000000, 0)
    this.outlineEffect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.0018,
      defaultColor: [0.09, 0.065, 0.13],
      defaultAlpha: 0.68,
      defaultKeepAlive: true,
    })
    const canvas = this.renderer.domElement
    canvas.id = 'pet-canvas'
    container.prepend(canvas)
    window.addEventListener('resize', this.updateRenderResolution)

    const hemisphere = new THREE.HemisphereLight(0xfff8ff, 0x5e4d82, 0.82)
    const keyLight = new THREE.DirectionalLight(0xffe9df, 1.5)
    keyLight.position.set(2.2, 3.6, 2.8)
    const rimLight = new THREE.DirectionalLight(0xddb8ff, 0.92)
    rimLight.position.set(-2.8, 2.6, -1.8)
    const fillLight = new THREE.DirectionalLight(0xffe6ef, 0.46)
    fillLight.position.set(-1.5, 1.8, 3.2)
    this.scene.add(hemisphere, keyLight, rimLight, fillLight, this.modelRoot)

    const asset = await this.loadAsset(this.assetPath)
    const gltf = await this.parseGlb(asset)
    this.model = gltf.scene
    this.modelRoot.add(this.model)
    this.hideNonPetParts()
    this.prepareMouthMeshes()
    this.toonGradientMap = this.createToonGradientMap()
    this.refineMaterials()
    this.improveTextureQuality()
    this.createHaloGlow()

    this.model.traverse((object) => {
      object.frustumCulled = false
    })

    const bounds = new THREE.Box3().setFromObject(this.model)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    this.model.position.x -= center.x
    this.model.position.y -= bounds.min.y
    this.model.position.z -= center.z

    const height = Math.max(0.1, size.y)
    this.modelHeight = height
    const leftFoot = this.findBone(['Bip001 L Foot', 'Bip001_L_Foot'])
    const rightFoot = this.findBone(['Bip001 R Foot', 'Bip001_R_Foot'])
    this.footBones.push(
      ...[leftFoot, rightFoot].filter((bone): bone is THREE.Object3D => Boolean(bone)),
    )
    const targetY = height * 0.5
    const distance = (height / (2 * Math.tan(THREE.MathUtils.degToRad(15)))) * 1.3
    this.camera.position.set(0, targetY, distance)
    this.camera.lookAt(0, targetY, 0)

    this.createContactShadow(size)

    this.mixer = new THREE.AnimationMixer(this.model)
    for (const clip of gltf.animations) {
      this.clips.set(clip.name, clip)
    }
    this.mixer.addEventListener('finished', this.handleAnimationFinished)
    this.captureProceduralRig()
    this.applyExpression()
    this.transitionTo('idle')

    const mappedClips = new Set(Object.values(GLB_ANIMATION_MAP).map((binding) => binding.clip))
    canvas.dataset.modelAnimations = String(this.clips.size)
    canvas.dataset.modelMissingClips = String(
      [...mappedClips].filter((clipName) => !this.clips.has(clipName)).length,
    )
    canvas.dataset.modelTextures = String(this.countMaterialTextures())
    canvas.dataset.modelFormat = 'gltf2'
    canvas.dataset.renderStyle = 'toon-outline'
    canvas.dataset.renderPowerMode = this.powerMode
    canvas.dataset.proceduralMotion = 'breath,hair,gaze'
    canvas.dataset.hairBones = String(this.hairBones.length)
    canvas.dataset.gazeSmoothing = 'damped'

    this.startAnimationLoop()
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }

  playAction(
    action: PetAnimation,
    options: ActionPlaybackOptions = {},
  ): ActionPlaybackMetadata | undefined {
    this.action = action
    this.renderer.domElement.dataset.lastAction = action
    this.renderer.domElement.dataset.lastTransitionImmediate = String(options.immediate === true)
    this.renderer.domElement.dataset.sustainedAction = ''
    const playback =
      this.transitionTo(action, options.immediate === true, options.loop) ?? undefined
    this.renderer.domElement.dataset.currentActionLoop = String(playback?.loop ?? false)
    return playback
  }

  playClip(clip: string): ActionPlaybackMetadata | undefined {
    const definition = HINA_SWIMSUIT_ANIMATIONS.find((animation) => animation.clip === clip)
    if (!definition) {
      return
    }
    this.action = 'idle'
    this.renderer.domElement.dataset.sustainedAction = ''
    const playback = this.transitionToClip(clip, definition.loop, definition.speed) ?? undefined
    this.renderer.domElement.dataset.currentActionLoop = String(playback?.loop ?? false)
    return playback
  }

  playSustainedAction(action: PetAnimation): ActionPlaybackMetadata | undefined {
    const binding = GLB_ANIMATION_MAP[action] ?? GLB_ANIMATION_MAP.idle
    this.action = action
    this.renderer.domElement.dataset.lastAction = action
    this.renderer.domElement.dataset.lastTransitionImmediate = 'true'
    this.renderer.domElement.dataset.sustainedAction = action
    return this.transitionToClip(binding.clip, true, binding.speed, true) ?? undefined
  }

  setExpression(expression: PetExpression): void {
    this.expression = expression
    this.applyExpression()
  }

  setMicroMotion(motion: MicroMotionKind, durationMs: number): void {
    this.microMotion = motion
    this.microMotionUntil = performance.now() + Math.max(0, durationMs)
    this.renderer.domElement.dataset.microMotion = motion
    this.renderer.domElement.dataset.microMotionUntil = this.microMotionUntil.toFixed(0)
    this.renderer.domElement.dataset.microMotionActive = 'true'
  }

  setGaze(point: Point2D | null): void {
    if (!point) {
      this.gazeTargetActive = false
      return
    }
    this.gazeTargetActive = true
    const target = normalizeGazeTarget(point)
    this.gazeTargetX = target.x
    this.gazeTargetY = target.y
    this.renderer.domElement.dataset.gazeTargetX = this.gazeTargetX.toFixed(3)
    this.renderer.domElement.dataset.gazeTargetY = this.gazeTargetY.toFixed(3)
  }

  setFacing(direction: FacingDirection): void {
    this.facing = direction
  }

  setScale(scale: number): void {
    this.modelScale = THREE.MathUtils.clamp(scale, MODEL_SCALE_MIN, MODEL_SCALE_MAX)
    this.modelRoot.scale.setScalar(this.modelScale)
    this.renderer.domElement.dataset.shadowScaleMode = 'parented'
    this.renderer.domElement.dataset.modelScale = this.modelScale.toFixed(2)
  }

  setPowerMode(mode: RenderPowerMode): void {
    this.powerMode = mode
    this.renderer.domElement.dataset.renderPowerMode = mode
    this.updateRenderResolution()
    if (mode === 'paused') {
      this.renderFrame(true)
      this.stopAnimationLoop()
      return
    }
    this.startAnimationLoop()
    this.lastRenderAt = performance.now()
  }

  getHitAreas(): readonly HitArea[] {
    const anchorX = 170
    const anchorY = 400
    return HIT_AREAS.map((area) =>
      area.type === 'circle'
        ? {
            ...area,
            x: anchorX + (area.x - anchorX) * this.modelScale,
            y: anchorY + (area.y - anchorY) * this.modelScale,
            radius: area.radius * this.modelScale,
          }
        : {
            ...area,
            x: anchorX + (area.x - anchorX) * this.modelScale,
            y: anchorY + (area.y - anchorY) * this.modelScale,
            width: area.width * this.modelScale,
            height: area.height * this.modelScale,
          },
    )
  }

  hitTest(point: Point2D): HitArea | undefined {
    return this.getHitAreas().find((area) => {
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
    window.removeEventListener('resize', this.updateRenderResolution)
    this.stopAnimationLoop()
    if (this.mixer) {
      this.mixer.removeEventListener('finished', this.handleAnimationFinished)
      this.mixer.stopAllAction()
      this.mixer.uncacheRoot(this.model ?? this.modelRoot)
      this.mixer = null
    }
    this.animations.clear()
    this.clips.clear()
    this.mouthNodes.clear()
    this.outlineEffect = null
    if (this.shadowSprite) {
      this.shadowSprite.removeFromParent()
      this.shadowSprite.material.dispose()
      this.shadowSprite = null
    }
    this.shadowTexture?.dispose()
    this.shadowTexture = null
    this.toonGradientMap?.dispose()
    this.toonGradientMap = null
    this.disposeObject(this.modelRoot)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private readonly handleAnimationFinished = (event: {
    type: string
    action: THREE.AnimationAction
  }): void => {
    if (event.action !== this.currentAction) {
      return
    }
    this.transitionTo('idle')
  }

  private transitionTo(
    action: PetAnimation,
    immediate = false,
    loopOverride?: boolean,
  ): ActionPlaybackMetadata | null {
    if (!this.mixer) {
      return null
    }

    const binding = GLB_ANIMATION_MAP[action] ?? GLB_ANIMATION_MAP.idle
    return this.transitionToClip(
      binding.clip,
      loopOverride ?? binding.loop,
      binding.speed,
      immediate,
    )
  }

  private transitionToClip(
    clipName: string,
    loop: boolean,
    speed = 1,
    immediate = false,
  ): ActionPlaybackMetadata | null {
    if (!this.mixer || !this.model) {
      return null
    }

    let clip = this.clips.get(clipName)
    if (!clip) {
      clipName = 'Cafe_Idle'
      clip = this.clips.get(clipName) ?? this.clips.values().next().value
    }
    if (!clip) {
      return null
    }

    const actionKey = `${clipName}:${loop ? 'loop' : 'once'}`
    let nextAction = this.animations.get(actionKey)
    if (!nextAction) {
      nextAction = this.mixer.clipAction(clip, this.model)
      nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
      nextAction.clampWhenFinished = !loop
      nextAction.enabled = true
      this.animations.set(actionKey, nextAction)
    }

    if (this.currentAction === nextAction && loop) {
      return {
        durationMs: (clip.duration * 1_000) / Math.max(0.01, speed),
        loop: true,
      }
    }

    nextAction.reset()
    nextAction.setEffectiveTimeScale(speed)
    nextAction.setEffectiveWeight(1)
    nextAction.play()
    if (this.currentAction && this.currentAction !== nextAction) {
      if (immediate) {
        this.currentAction.stop()
      } else {
        this.currentAction.crossFadeTo(nextAction, 0.2, false)
      }
    }
    this.currentAction = nextAction
    this.lastClipTime = 0
    this.clipCycleCount = 0
    this.renderer.domElement.dataset.lastModelClip = clipName
    this.renderer.domElement.dataset.modelClipDuration = clip.duration.toFixed(3)
    this.renderer.domElement.dataset.currentActionLoop = String(loop)
    if (immediate) {
      this.renderFrame(true)
    }
    return {
      durationMs: (clip.duration * 1_000) / Math.max(0.01, speed),
      loop,
    }
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
    if (!this.model || !this.mixer) {
      return
    }

    const now = performance.now()
    const targetFps = this.powerMode === 'low-power' ? 15 : this.powerMode === 'idle' ? 30 : 60
    if (!force && now - this.lastRenderAt < 1000 / targetFps - 1) {
      return
    }

    const delta = Math.min((now - this.lastRenderAt) / 1000, 0.1)
    this.lastRenderAt = now
    this.elapsedSeconds += delta
    this.updateGaze(delta)
    this.resetProceduralBones()
    this.mixer.update(delta)
    this.applyProceduralPose()
    this.modelRoot.rotation.y = this.facing === 'left' ? 0.16 : -0.16
    this.updateContactShadow()
    this.updateMotionDiagnostics()
    const canvas = this.renderer.domElement
    canvas.dataset.currentActionTime = (this.currentAction?.time ?? 0).toFixed(3)
    canvas.dataset.currentActionRunning = String(this.currentAction?.isRunning() ?? false)
    if (this.outlineEffect) {
      this.outlineEffect.render(this.scene, this.camera)
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  private updateGaze(deltaSeconds: number): void {
    const microMotion = this.getActiveMicroMotion(performance.now())
    const gazeBoost = microMotion === 'gaze' || microMotion === 'gaze_breath' ? 2.6 : 1
    const idle = idleGazeOffset(this.elapsedSeconds, gazeBoost)
    const idleX = idle.x
    const idleY = idle.y
    const targetX = this.gazeTargetActive ? this.gazeTargetX : idleX
    const targetY = this.gazeTargetActive ? this.gazeTargetY : idleY
    this.currentGazeX = dampMotion(this.currentGazeX, targetX, deltaSeconds, GAZE_RESPONSIVENESS)
    this.currentGazeY = dampMotion(this.currentGazeY, targetY, deltaSeconds, GAZE_RESPONSIVENESS)
  }

  private applyProceduralPose(): void {
    const now = performance.now()
    const microMotion = this.getActiveMicroMotion(now)
    const breath = Math.sin(this.elapsedSeconds * (microMotion === 'breath' ? 1.7 : 1.36))
    const fullActionScale = this.getFullActionProceduralScale()
    const microBreathScale = microMotion === 'breath' || microMotion === 'gaze_breath' ? 1.38 : 1
    const bodyScale = (this.action === 'sleep' ? 0.55 : 1) * fullActionScale * microBreathScale

    if (this.spineBone) {
      this.addBoneRotation(this.spineBone, breath * 0.011 * bodyScale, 0, 0)
    }
    if (this.spine1Bone) {
      this.addBoneRotation(this.spine1Bone, breath * 0.017 * bodyScale, 0, 0)
    }
    if (this.leftClavicleBone) {
      this.addBoneRotation(this.leftClavicleBone, 0, 0, breath * 0.009 * bodyScale)
    }
    if (this.rightClavicleBone) {
      this.addBoneRotation(this.rightClavicleBone, 0, 0, -breath * 0.009 * bodyScale)
    }
    if (this.neckBone) {
      this.addBoneRotation(
        this.neckBone,
        this.currentGazeY * 0.022 - breath * 0.005,
        this.currentGazeX * 0.038,
        -this.currentGazeX * 0.008,
      )
    }
    if (this.headBone) {
      this.addBoneRotation(
        this.headBone,
        this.currentGazeY * 0.074 - breath * 0.008,
        this.currentGazeX * 0.145,
        -this.currentGazeX * 0.018,
      )
    }
    for (const eyeBone of this.eyeBones) {
      this.addBoneRotation(eyeBone, this.currentGazeY * 0.082, this.currentGazeX * 0.11, 0)
    }
    if (this.spineBone && this.action === 'sleep') {
      this.addBoneRotation(this.spineBone, 0.11, 0, 0.05)
    }

    this.applyHairSway(fullActionScale, microMotion)
    this.renderer.domElement.dataset.proceduralWeight = fullActionScale.toFixed(2)
    if (!microMotion && this.renderer.domElement.dataset.microMotionActive === 'true') {
      this.renderer.domElement.dataset.microMotionActive = 'false'
    }
  }

  private getActiveMicroMotion(now: number): MicroMotionKind | null {
    return now < this.microMotionUntil ? this.microMotion : null
  }

  private getFullActionProceduralScale(): number {
    if (
      this.action === 'drag_start' ||
      this.action === 'drag_loop' ||
      this.action === 'walk' ||
      this.action === 'wave' ||
      this.action === 'stretch' ||
      this.action === 'surprised'
    ) {
      return 0.42
    }
    return 1
  }

  private applyHairSway(fullActionScale: number, microMotion: MicroMotionKind | null): void {
    const actionEnergy =
      this.action === 'walk'
        ? 2
        : this.action === 'drag_start' || this.action === 'drag_loop'
          ? 1.8
          : this.action === 'surprised' || this.action === 'wave'
            ? 1.35
            : this.action === 'sleep'
              ? 0.3
              : 1
    const microHairScale = microMotion === 'hair' || microMotion === 'gaze_breath' ? 1.55 : 1
    for (const hair of this.hairBones) {
      const phase = this.elapsedSeconds + hair.phase * Math.PI * 2
      const swayX =
        (Math.sin(phase * 1.45) * 0.8 + Math.sin(phase * 2.7 + 0.6) * 0.24) *
        hair.amplitude *
        actionEnergy *
        fullActionScale *
        microHairScale
      const swayY = Math.cos(phase * 1.12 + 0.4) * hair.amplitude * 0.32 * actionEnergy
      const swayZ =
        (Math.cos(phase * 1.28 + 1.1) * 0.55 + this.currentGazeX * 0.34) *
        hair.amplitude *
        actionEnergy *
        fullActionScale *
        microHairScale
      this.addBoneRotation(hair.bone, swayX, swayY, swayZ)
    }
  }

  private addBoneRotation(bone: THREE.Object3D, x: number, y: number, z: number): void {
    this.temporaryEuler.set(x, y, z)
    this.temporaryQuaternion.setFromEuler(this.temporaryEuler)
    bone.quaternion.multiply(this.temporaryQuaternion)
  }

  private resetProceduralBones(): void {
    for (const [bone, quaternion] of this.proceduralRestQuaternions) {
      bone.quaternion.copy(quaternion)
    }
  }

  private updateMotionDiagnostics(): void {
    const canvas = this.renderer.domElement
    canvas.dataset.gazeCurrentX = this.currentGazeX.toFixed(3)
    canvas.dataset.gazeCurrentY = this.currentGazeY.toFixed(3)
    canvas.dataset.breathLevel = Math.sin(this.elapsedSeconds * 1.36).toFixed(3)
    if (this.currentAction) {
      const clipTime = this.currentAction.time
      if (clipTime + 0.05 < this.lastClipTime) {
        this.clipCycleCount += 1
      }
      this.lastClipTime = clipTime
      canvas.dataset.modelClipTime = clipTime.toFixed(3)
      canvas.dataset.modelClipCycles = String(this.clipCycleCount)
    }
  }

  private captureProceduralRig(): void {
    this.headBone = this.captureBone('Bip001_Head')
    this.neckBone = this.captureBone('Bip001_Neck')
    this.spineBone = this.captureBone('Bip001_Spine')
    this.spine1Bone = this.captureBone('Bip001_Spine1')
    this.leftClavicleBone = this.captureBone('Bip001_L_Clavicle')
    this.rightClavicleBone = this.captureBone('Bip001_R_Clavicle')

    for (const name of ['Bip001_eye_L', 'Bip001_eye_R']) {
      const eyeBone = this.captureBone(name)
      if (eyeBone) {
        this.eyeBones.push(eyeBone)
      }
    }

    this.model?.traverse((object) => {
      if (!object.name.startsWith('bone_hair_')) {
        return
      }
      this.captureBone(object.name)
      let depth = 0
      let parent = object.parent
      while (parent?.name.startsWith('bone_hair_')) {
        depth += 1
        parent = parent.parent
      }
      this.hairBones.push({
        bone: object,
        phase: stableUnitHash(object.name),
        amplitude: 0.019 / (1 + depth * 0.48),
      })
    })
  }

  private captureBone(name: string): THREE.Object3D | null {
    const bone = this.findBone([name])
    if (bone && !this.proceduralRestQuaternions.has(bone)) {
      this.proceduralRestQuaternions.set(bone, bone.quaternion.clone())
    }
    return bone
  }

  private findBone(names: string[]): THREE.Object3D | null {
    for (const name of names) {
      const direct = this.model?.getObjectByName(name)
      if (direct) {
        return direct
      }
      const sanitized = name.replace(/\s+/gu, '_')
      const compatible = this.model?.getObjectByName(sanitized)
      if (compatible) {
        return compatible
      }
    }
    return null
  }

  private prepareMouthMeshes(): void {
    for (const name of MOUTH_NODE_NAMES) {
      const node = this.model?.getObjectByName(name)
      if (node) {
        this.mouthNodes.set(name, node)
      }
    }
  }

  private applyExpression(): void {
    const activeMouth = MOUTH_MAP[this.expression]
    for (const [name, node] of this.mouthNodes) {
      node.visible = name === activeMouth
    }
  }

  private refineMaterials(): void {
    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      const refinedMaterials = materials.map((material) => {
        // 先对原材质着色，兼容 Standard / Basic / Physical 等类型。
        const colorMaterial = material as THREE.Material & { color?: THREE.Color }
        if (colorMaterial.color instanceof THREE.Color) {
          if (/Face/i.test(material.name)) {
            colorMaterial.color.multiply(new THREE.Color(0xffd8c4))
          } else if (/Body/i.test(material.name)) {
            colorMaterial.color.multiply(new THREE.Color(0xffdfcf))
          } else if (/Hair/i.test(material.name)) {
            colorMaterial.color.multiply(new THREE.Color(0xfff9ff))
          }
        }
        if (!(material instanceof THREE.MeshStandardMaterial)) {
          return material
        }
        const isPlanarFaceLayer = /EyeMouth|Mouth_|Eyebrow|Face/.test(material.name)
        const isHalo = material.name === 'Hina_Halo'
        const refined =
          isPlanarFaceLayer || isHalo
            ? new THREE.MeshBasicMaterial({
                name: material.name,
                map: material.map,
                transparent: material.transparent,
                opacity: material.opacity,
                alphaTest: material.alphaTest,
                side: THREE.DoubleSide,
                toneMapped: !isHalo,
              })
            : new THREE.MeshToonMaterial({
                name: material.name,
                map: material.map,
                gradientMap: this.toonGradientMap,
                transparent: material.transparent,
                opacity: material.opacity,
                alphaTest: material.alphaTest,
                side: THREE.DoubleSide,
              })
        refined.color.copy(material.color)
        refined.userData.outlineParameters = {
          visible: !isPlanarFaceLayer,
          thickness: isHalo ? 0.0025 : 0.002,
          color: isHalo ? [0.16, 0.015, 0.21] : [0.075, 0.05, 0.11],
          alpha: isHalo ? 0.9 : 0.78,
          keepAlive: true,
        }
        material.dispose()
        return refined
      })
      object.material = Array.isArray(object.material) ? refinedMaterials : refinedMaterials[0]
    })
  }

  private improveTextureQuality(): void {
    const maxAnisotropy = Math.max(
      1,
      Math.min(MAX_TEXTURE_ANISOTROPY, this.renderer.capabilities.getMaxAnisotropy()),
    )
    const textures = new Set<THREE.Texture>()

    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if ('map' in material && material.map instanceof THREE.Texture) {
          textures.add(material.map)
        }
      }
    })

    for (const texture of textures) {
      texture.anisotropy = maxAnisotropy
      texture.generateMipmaps = true
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.needsUpdate = true
    }
    this.renderer.domElement.dataset.textureAnisotropy = String(maxAnisotropy)
  }

  private createToonGradientMap(): THREE.DataTexture {
    const gradient = new THREE.DataTexture(
      new Uint8Array([96, 136, 175, 211, 238, 255]),
      6,
      1,
      THREE.RedFormat,
    )
    gradient.minFilter = THREE.NearestFilter
    gradient.magFilter = THREE.NearestFilter
    gradient.generateMipmaps = false
    gradient.needsUpdate = true
    return gradient
  }

  private createHaloGlow(): void {
    const halo = this.model?.getObjectByName('Hina_Original_Halo')
    if (!(halo instanceof THREE.Mesh)) {
      return
    }
    const haloMaterial = Array.isArray(halo.material) ? halo.material[0] : halo.material
    if (!haloMaterial.map) {
      return
    }

    const glowMaterial = new THREE.MeshBasicMaterial({
      map: haloMaterial.map,
      color: 0xd889ff,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    glowMaterial.userData.outlineParameters = { visible: false, keepAlive: true }
    const glow = new THREE.Mesh(halo.geometry, glowMaterial)
    glow.name = 'Hina_Halo_Glow'
    glow.position.copy(halo.position)
    glow.quaternion.copy(halo.quaternion)
    glow.scale.copy(halo.scale).multiplyScalar(1.07)
    glow.renderOrder = 1
    halo.parent?.add(glow)
  }

  private createContactShadow(size: THREE.Vector3): void {
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = 256
    shadowCanvas.height = 256
    const context = shadowCanvas.getContext('2d')
    if (!context) {
      return
    }

    const gradient = context.createRadialGradient(128, 128, 12, 128, 128, 126)
    gradient.addColorStop(0, 'rgba(58, 39, 78, 0.34)')
    gradient.addColorStop(0.42, 'rgba(58, 39, 78, 0.13)')
    gradient.addColorStop(1, 'rgba(58, 39, 78, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)

    this.shadowTexture = new THREE.CanvasTexture(shadowCanvas)
    this.shadowTexture.colorSpace = THREE.SRGBColorSpace
    this.shadowTexture.minFilter = THREE.LinearFilter
    this.shadowTexture.magFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({
      map: this.shadowTexture,
      transparent: true,
      opacity: 0.58,
      depthTest: false,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    const shadowWidth = THREE.MathUtils.clamp(size.y * 0.16, 0.5, 1.15)
    sprite.scale.set(shadowWidth, shadowWidth * 0.28, 1)
    sprite.renderOrder = -10
    sprite.name = 'Hina_Contact_Shadow'
    this.modelRoot.add(sprite)
    this.shadowSprite = sprite
    this.updateContactShadow(true)
  }

  private updateContactShadow(force = false): void {
    if (!this.shadowSprite || this.footBones.length === 0) {
      return
    }
    this.model?.updateMatrixWorld(true)
    this.shadowSprite.updateMatrixWorld(true)
    let centerX = 0
    let centerZ = 0
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    for (const foot of this.footBones) {
      foot.getWorldPosition(this.shadowWorldPosition)
      this.modelRoot.worldToLocal(this.shadowLocalPosition.copy(this.shadowWorldPosition))
      centerX += this.shadowLocalPosition.x
      centerZ += this.shadowLocalPosition.z
      minX = Math.min(minX, this.shadowLocalPosition.x)
      maxX = Math.max(maxX, this.shadowLocalPosition.x)
      minZ = Math.min(minZ, this.shadowLocalPosition.z)
      maxZ = Math.max(maxZ, this.shadowLocalPosition.z)
    }
    centerX /= this.footBones.length
    centerZ /= this.footBones.length
    const footSpan = Math.hypot(maxX - minX, maxZ - minZ)
    const targetWidth = THREE.MathUtils.clamp(
      Math.max(this.modelHeight * 0.12, footSpan * 1.72),
      0.46,
      1.05,
    )
    const targetHeight = targetWidth * 0.27
    if (
      force ||
      Math.abs(this.shadowSprite.position.x - centerX) > 0.002 ||
      Math.abs(this.shadowSprite.position.z - centerZ) > 0.002 ||
      Math.abs(this.shadowSprite.scale.x - targetWidth) > 0.002
    ) {
      this.shadowSprite.position.set(centerX, 0.012, centerZ)
      this.shadowSprite.scale.set(targetWidth, targetHeight, 1)
    }
    const canvas = this.renderer.domElement
    canvas.dataset.shadowTracking = 'animated-feet'
    canvas.dataset.shadowLocalX = centerX.toFixed(3)
    canvas.dataset.shadowLocalZ = centerZ.toFixed(3)
    canvas.dataset.shadowFootSpan = footSpan.toFixed(3)
    canvas.dataset.shadowWidth = targetWidth.toFixed(3)
    canvas.dataset.shadowScaleMode = 'parented'
  }

  private countMaterialTextures(): number {
    const textures = new Set<THREE.Texture>()
    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if ('map' in material && material.map instanceof THREE.Texture && material.map.image) {
          textures.add(material.map)
        }
      }
    })
    return textures.size
  }

  private hideNonPetParts(): void {
    for (const name of ['CH0063_Weapon', 'fire_01', 'fire_02']) {
      const object = this.model?.getObjectByName(name)
      if (object) {
        object.visible = false
      }
    }
  }

  private parseGlb(asset: Uint8Array): Promise<GLTF> {
    const loader = new GLTFLoader()
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

  private disposeObject(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const textures = new Set<THREE.Texture>()

    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }
      geometries.add(object.geometry)
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of objectMaterials) {
        materials.add(material)
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) {
            textures.add(value)
          }
        }
      }
    })

    for (const geometry of geometries) {
      geometry.dispose()
    }
    for (const texture of textures) {
      texture.dispose()
    }
    for (const material of materials) {
      material.dispose()
    }
  }
}
