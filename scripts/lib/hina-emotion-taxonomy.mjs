export const HINA_EMOTIONS = [
  'neutral',
  'tired',
  'soft',
  'happy',
  'embarrassed',
  'annoyed',
  'stern',
  'sad',
  'surprised',
  'playful',
]

const CAPTIONS = {
  neutral: '落ち着いた低めの女性話者。抑揚を抑えた、自然でクールな話し方。',
  tired: '落ち着いた低めの女性話者。疲れていて少し眠そう。声に力がなく、ゆっくり話す。',
  soft: '落ち着いた低めの女性話者。先生にだけ心を緩めた、控えめで柔らかな話し方。',
  happy: '落ち着いた低めの女性話者。静かな喜びと達成感を含み、少しだけ声が明るい。',
  embarrassed: '落ち着いた低めの女性話者。照れて少し慌て、強がりながら声が上ずる。',
  annoyed: '落ち着いた低めの女性話者。呆れや不機嫌を抑え、短く鋭く返す。',
  stern: '落ち着いた低めの女性話者。冷静で凛とした命令口調。強い意志を込める。',
  sad: '落ち着いた低めの女性話者。悔しさや寂しさをこらえ、静かに低く話す。',
  surprised: '落ち着いた低めの女性話者。不意を突かれて息をのみ、少し慌てた声。',
  playful: '落ち着いた低めの女性話者。皮肉や軽い茶化しを混ぜた、冷静で少し遊びのある声。',
}

const CAPTION_VARIATIONS = {
  neutral: [
    CAPTIONS.neutral,
    '落ち着いた低めの女性話者。感情を大げさに出さず、淡々と自然に話す。',
    'クールで落ち着いた低めの女性話者。一定のテンポで、抑制の効いた話し方。',
  ],
  tired: [
    CAPTIONS.tired,
    '低めの女性話者。疲労で声に張りがなく、ため息まじりにゆっくり話す。',
    '落ち着いた女性話者。眠そうで気だるげ。語尾の力を弱めて話す。',
  ],
  soft: [
    CAPTIONS.soft,
    '低めの落ち着いた女性話者。信頼する相手に向ける、優しく穏やかな声。',
    'クールな女性話者。いつもの硬さを少し緩め、近い距離感で静かに話す。',
  ],
  happy: [
    CAPTIONS.happy,
    '落ち着いた低めの女性話者。控えめだが、嬉しさが自然に声へにじむ。',
    'クールな女性話者。冷静さを保ちながら、柔らかい笑みを含んだ明るい声。',
  ],
  embarrassed: [
    CAPTIONS.embarrassed,
    '低めの女性話者。照れを隠そうとして少し早口になり、声が揺れる。',
    '落ち着いた女性話者。恥ずかしさをこらえ、強がりとためらいが混ざる。',
  ],
  annoyed: [
    CAPTIONS.annoyed,
    '低めの女性話者。疲れたような呆れをにじませ、短く冷たく話す。',
    'クールな女性話者。不機嫌を大声にせず、抑えた鋭い口調で返す。',
  ],
  stern: [
    CAPTIONS.stern,
    '低めの凛とした女性話者。落ち着きと威厳を保ち、迷いなく命じる。',
    'クールな女性話者。静かな圧を感じさせる、明確で断定的な話し方。',
  ],
  sad: [
    CAPTIONS.sad,
    '低めの女性話者。悲しみと悔しさを飲み込み、声を落として静かに話す。',
    '落ち着いた女性話者。涙をこらえ、途切れがちで弱い語尾の声。',
  ],
  surprised: [
    CAPTIONS.surprised,
    '低めの女性話者。予想外の言葉に一瞬息をのみ、平静を取り戻そうとする。',
    'クールな女性話者。動揺を隠せず、声が上ずって少し慌てる。',
  ],
  playful: [
    CAPTIONS.playful,
    '低めの女性話者。冷静なまま、からかうような軽さと笑みを声に混ぜる。',
    'クールな女性話者。いたずらっぽい含みを持たせ、余裕のある口調で話す。',
  ],
}

const CLIP_RULES = [
  [/Battle_Damage/, 'annoyed'],
  [/Battle_Retire/, 'sad'],
  [/Battle_Victory|Tactic_Victory/, 'happy'],
  [/Tactic_Defeat/, 'sad'],
  [/Battle_Shout|TacticalAction|ExSkill|CommonSkill/, 'stern'],
  [/Battle_(In|Move|Covered|Buff|Recovery)/, 'stern'],
  [/Tactic_In|Formation_/, 'stern'],
  [/Cafe_monolog/, 'neutral'],
  [/CardGame/, 'playful'],
  [/MemorialLobby|Relationship_Up/, 'soft'],
  [/EventLobby|Season_|EventLogin|LogIn/, 'soft'],
  [/Growup|ExWeapon/, 'happy'],
  [/Gachaget|Title/, 'neutral'],
]

const TEXT_RULES = [
  [/びっくり|驚|えっ[、！!]|ちょっと待って|どうして/, 'surprised'],
  [/ありがとう|嬉しい|よかった|楽しみ|誇らし|やった/, 'happy'],
  [/ごめん|すまない|悔しい|申し訳|寂し|つらい|負け/, 'sad'],
  [/眠|だるい|疲|休ませて|少しだけ|めんどくさい|面倒|終わらない|暑い|何も考えたくない/, 'tired'],
  [/恥ずかし|照れ|心の準備|そんなこと/, 'embarrassed'],
  [/まったく|うるさい|嫌|呆れ|諦め|しつこい|まだいるの|しょうがない/, 'annoyed'],
  [/先生.*(そば|一緒|嬉しい|助ける)|大丈夫|安心/, 'soft'],
]

const ID_OVERRIDES = {
  'dress:Battle_Defense_1': 'stern',
  'dress:Battle_Recovery_1': 'happy',
  'dress:Cafe_monolog_1': 'embarrassed',
  'dress:Cafe_monolog_5': 'stern',
  'dress:EventLobby_1': 'soft',
  'dress:EventLobby_2': 'annoyed',
  'dress:EventLobby_3': 'stern',
  'dress:EventLobby_4_2': 'embarrassed',
  'dress:EventLogin_1': 'soft',
  'dress:EventLogin_2': 'soft',
  'dress:EventLogin_Season_1': 'tired',
  'dress:EventLogin_Season_2': 'tired',
  'dress:EventLogin_Season_End': 'soft',
  'dress:EventLobby_4_1': 'neutral',
  'dress:ExSkill_2': 'soft',
  'dress:ExSkill_3': 'embarrassed',
  'dress:ExSkill_Level_5': 'soft',
  'dress:ExSkill_Level_6': 'happy',
  'dress:Formation_Select': 'embarrassed',
  'dress:Gachaget': 'embarrassed',
  'dress:Lobby_1_1': 'soft',
  'dress:Lobby_1_2': 'surprised',
  'dress:Lobby_2': 'happy',
  'dress:Lobby_3': 'embarrassed',
  'dress:Lobby_4': 'stern',
  'dress:Lobby_5': 'embarrassed',
  'dress:LogIn_2_2': 'surprised',
  'dress:MemorialLobby_2_1': 'embarrassed',
  'dress:MemorialLobby_2_2': 'embarrassed',
  'dress:MemorialLobby_2_3': 'embarrassed',
  'dress:MemorialLobby_3_1': 'embarrassed',
  'dress:MemorialLobby_3_2': 'embarrassed',
  'dress:MemorialLobby_4_1': 'sad',
  'dress:MemorialLobby_4_2': 'soft',
  'dress:MemorialLobby_5_1': 'soft',
  'dress:MemorialLobby_5_2': 'soft',
  'dress:Relationship_Up_1': 'happy',
  'dress:Relationship_Up_2': 'embarrassed',
  'dress:Relationship_Up_3': 'happy',
  'dress:Relationship_Up_4': 'embarrassed',
  'dress:Season_Birthday_Player_1': 'soft',
  'dress:Season_Birthday_Player_2': 'embarrassed',
  'dress:Season_Halloween': 'playful',
  'dress:Season_Xmas_1': 'embarrassed',
  'dress:Season_Xmas_2': 'surprised',
  'dress:Tactic_In_2': 'soft',
  'normal:Battle_Defense_1': 'stern',
  'normal:Battle_Move_1': 'tired',
  'normal:Battle_Move_2': 'tired',
  'normal:Battle_Recovery_1': 'happy',
  'normal:Battle_TSA_1': 'stern',
  'normal:EventMission_1_1': 'tired',
  'normal:EventMission_1_2': 'playful',
  'normal:EventMission_2': 'stern',
  'normal:EventMission_Get_2': 'happy',
  'normal:EventMission_Login_1': 'soft',
  'normal:EventMission_Login_2': 'soft',
  'normal:ExWeapon_Get': 'stern',
  'normal:Formation_In_1': 'tired',
  'normal:Formation_Select': 'neutral',
  'normal:Lobby_3': 'embarrassed',
  'normal:Lobby_4': 'embarrassed',
  'normal:Lobby_5': 'embarrassed',
  'normal:Lobby_6': 'stern',
  'normal:Lobby_7': 'soft',
  'normal:Lobby_8': 'soft',
  'normal:Lobby_9': 'sad',
  'normal:Lobby_10': 'surprised',
  'normal:LogIn_1': 'soft',
  'normal:MemorialLobby_3_1': 'embarrassed',
  'normal:MemorialLobby_4_1': 'tired',
  'normal:Relationship_Up_1': 'sad',
  'normal:Relationship_Up_3': 'sad',
  'normal:Relationship_Up_4': 'embarrassed',
  'normal:Season_Birthday_Player': 'soft',
  'normal:Season_Halloween': 'neutral',
  'normal:Season_Xmas': 'happy',
  'normal:Tactic_In_1': 'tired',
  'normal:Tactic_In_2': 'neutral',
  'normal:Tactic_Defeat_1': 'stern',
  'normal:Tactic_Victory_1': 'neutral',
  'normal:Tactic_Victory_2': 'tired',
  'swimsuit:Battle_Move_1': 'tired',
  'swimsuit:Battle_Move_2': 'annoyed',
  'swimsuit:Battle_Victory_1': 'embarrassed',
  'swimsuit:Battle_Victory_2': 'embarrassed',
  'swimsuit:Cafe_monolog_1': 'embarrassed',
  'swimsuit:Cafe_monolog_3': 'sad',
  'swimsuit:Cafe_monolog_4': 'soft',
  'swimsuit:EventLobby_1': 'tired',
  'swimsuit:EventLobby_2': 'soft',
  'swimsuit:EventLobby_3': 'embarrassed',
  'swimsuit:EventLobby_4_1': 'embarrassed',
  'swimsuit:EventLobby_4_2': 'embarrassed',
  'swimsuit:EventLogin_2': 'soft',
  'swimsuit:Formation_Select': 'surprised',
  'swimsuit:Gachaget': 'soft',
  'swimsuit:Growup_2': 'soft',
  'swimsuit:Lobby_2': 'embarrassed',
  'swimsuit:LogIn_2': 'embarrassed',
  'swimsuit:MemorialLobby_1_1': 'sad',
  'swimsuit:MemorialLobby_1_2': 'sad',
  'swimsuit:MemorialLobby_2_1': 'sad',
  'swimsuit:MemorialLobby_3_1': 'sad',
  'swimsuit:MemorialLobby_3_2': 'sad',
  'swimsuit:MemorialLobby_4_1': 'soft',
  'swimsuit:MemorialLobby_5_2': 'happy',
  'swimsuit:Relationship_Up_2': 'embarrassed',
  'swimsuit:Relationship_Up_4': 'embarrassed',
  'swimsuit:Tactic_Defeat_1': 'stern',
  'swimsuit:Tactic_Defeat_2': 'stern',
  'swimsuit:Tactic_In_1': 'tired',
  'swimsuit:Tactic_In_2': 'neutral',
  'swimsuit:Tactic_Victory_2': 'neutral',
}

export function classifyHinaEmotion(id, clip, text) {
  const override = ID_OVERRIDES[id]
  if (override) {
    return { primary: override, intensity: 'high', source: 'manual' }
  }
  for (const [pattern, emotion] of TEXT_RULES) {
    if (pattern.test(text)) {
      return { primary: emotion, intensity: 'high', source: 'text' }
    }
  }
  for (const [pattern, emotion] of CLIP_RULES) {
    if (pattern.test(clip)) {
      return {
        primary: emotion,
        intensity: /Battle_|ExSkill|CommonSkill|Tactic_/.test(clip) ? 'high' : 'medium',
        source: 'clip',
      }
    }
  }
  return { primary: 'neutral', intensity: 'medium', source: 'default' }
}

export function captionForEmotion(emotion) {
  return CAPTIONS[emotion] ?? CAPTIONS.neutral
}

export function captionVariantsForEmotion(emotion) {
  return CAPTION_VARIATIONS[emotion] ?? CAPTION_VARIATIONS.neutral
}
