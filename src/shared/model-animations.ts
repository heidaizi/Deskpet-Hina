export interface ModelAnimationDefinition {
  clip: string
  label: string
  category: string
  loop: boolean
  speed?: number
}

export const MODEL_SCALE_MIN = 0.3
export const MODEL_SCALE_MAX = 1

export const HINA_SWIMSUIT_ANIMATIONS: readonly ModelAnimationDefinition[] = [
  { clip: 'Cafe_Idle', label: '咖啡厅待机', category: '日常', loop: true },
  { clip: 'Cafe_Reaction', label: '互动反应', category: '日常', loop: false },
  { clip: 'Cafe_Walk', label: '咖啡厅走路', category: '日常', loop: true },
  { clip: 'Formation_Idle', label: '编队待机', category: '编队', loop: true },
  { clip: 'Formation_Pickup', label: '被提起', category: '编队', loop: false },
  { clip: 'Public01', label: '开心展示', category: '表现', loop: false },
  { clip: 'Normal_Idle', label: '战斗待机', category: '战斗', loop: true },
  { clip: 'Normal_Attack_Delay', label: '攻击预备', category: '战斗', loop: false },
  { clip: 'Normal_Attack_Start', label: '攻击开始', category: '战斗', loop: false },
  { clip: 'Normal_Attack_Ing', label: '攻击中', category: '战斗', loop: false },
  { clip: 'Normal_Attack_End', label: '攻击结束', category: '战斗', loop: false },
  { clip: 'Normal_Callsign', label: '响应集合', category: '战斗', loop: false },
  { clip: 'Normal_Reload', label: '换弹', category: '战斗', loop: false },
  { clip: 'Move_Ing', label: '移动中', category: '移动', loop: true },
  { clip: 'Move_End_Normal', label: '移动停止', category: '移动', loop: false },
  { clip: 'Exs', label: 'EX 技能', category: '技能', loop: false },
  { clip: 'Cutin', label: '特写演出', category: '技能', loop: false },
  { clip: 'Vital_Panic', label: '慌乱', category: '状态', loop: false },
  { clip: 'Vital_Retreat', label: '撤退', category: '状态', loop: false },
  { clip: 'Vital_Dying_ing', label: '倒地挣扎', category: '状态', loop: false },
  { clip: 'Vital_Death', label: '倒下', category: '状态', loop: false },
  { clip: 'Victory_Start', label: '胜利开始', category: '胜利', loop: false },
  { clip: 'Victory_End', label: '胜利结束', category: '胜利', loop: false },
] as const

export function isHinaSwimsuitAnimation(clip: unknown): clip is string {
  return (
    typeof clip === 'string' &&
    HINA_SWIMSUIT_ANIMATIONS.some((animation) => animation.clip === clip)
  )
}
