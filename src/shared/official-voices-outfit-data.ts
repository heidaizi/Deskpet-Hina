// 由脚本从 multiform 训练素材生成：各服装对应的官方语音路径。
export const OUTFIT_VOICE_PATHS: Record<string, Record<string, string>> = {
  'hina-swimsuit': {
    Cafe_monolog_1:
      'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Cafe_monolog_1.ogg',
    Lobby_2: 'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Lobby_2.ogg',
    EventLobby_3: 'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/EventLobby_3.ogg',
    Battle_Damage_2:
      'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Battle_Damage_2.ogg',
    ExSkill_Level_1:
      'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/ExSkill_Level_1.ogg',
    Cafe_monolog_2:
      'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Cafe_monolog_2.ogg',
    Lobby_3: 'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Lobby_3.ogg',
    Lobby_4: 'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Lobby_4.ogg',
    Lobby_5: 'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Lobby_5.ogg',
    Relationship_Up_1:
      'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Relationship_Up_1.ogg',
    Battle_Move_2:
      'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Battle_Move_2.ogg',
    Season_Birthday_2:
      'assets/characters/hina-swimsuit/private/audio/outfit/swimsuit/Season_Birthday_2.ogg',
  },
  'hina-dress': {
    Cafe_monolog_1: 'assets/characters/hina-swimsuit/private/audio/outfit/dress/Cafe_monolog_1.ogg',
    Lobby_2: 'assets/characters/hina-swimsuit/private/audio/outfit/dress/Lobby_2.ogg',
    EventLobby_3: 'assets/characters/hina-swimsuit/private/audio/outfit/dress/EventLobby_3.ogg',
    ExSkill_Level_1:
      'assets/characters/hina-swimsuit/private/audio/outfit/dress/ExSkill_Level_1.ogg',
    Cafe_monolog_2: 'assets/characters/hina-swimsuit/private/audio/outfit/dress/Cafe_monolog_2.ogg',
    Lobby_3: 'assets/characters/hina-swimsuit/private/audio/outfit/dress/Lobby_3.ogg',
    Lobby_4: 'assets/characters/hina-swimsuit/private/audio/outfit/dress/Lobby_4.ogg',
    Lobby_5: 'assets/characters/hina-swimsuit/private/audio/outfit/dress/Lobby_5.ogg',
    Relationship_Up_1:
      'assets/characters/hina-swimsuit/private/audio/outfit/dress/Relationship_Up_1.ogg',
    Battle_Move_2: 'assets/characters/hina-swimsuit/private/audio/outfit/dress/Battle_Move_2.ogg',
  },
  'hina-normal': {
    Lobby_2: 'assets/characters/hina-swimsuit/private/audio/outfit/normal/Lobby_2.ogg',
    Battle_Damage_2:
      'assets/characters/hina-swimsuit/private/audio/outfit/normal/Battle_Damage_2.ogg',
    ExSkill_Level_1:
      'assets/characters/hina-swimsuit/private/audio/outfit/normal/ExSkill_Level_1.ogg',
    Lobby_3: 'assets/characters/hina-swimsuit/private/audio/outfit/normal/Lobby_3.ogg',
    Lobby_4: 'assets/characters/hina-swimsuit/private/audio/outfit/normal/Lobby_4.ogg',
    Lobby_5: 'assets/characters/hina-swimsuit/private/audio/outfit/normal/Lobby_5.ogg',
    Relationship_Up_1:
      'assets/characters/hina-swimsuit/private/audio/outfit/normal/Relationship_Up_1.ogg',
    Battle_Move_2: 'assets/characters/hina-swimsuit/private/audio/outfit/normal/Battle_Move_2.ogg',
  },
}

// 各服装对应的官方语音中文文本（由对话池与问候语生成）。
export const OUTFIT_VOICE_TEXT: Record<string, Record<string, string>> = {
  'hina-swimsuit': {
    Cafe_monolog_1: '这件泳装，不奇怪吗……？',
    Lobby_2: '倒也不是期待，或者一直盼着……。那个，只有一点点而已……。',
    EventLobby_3: '夏季训练合宿。没想到今年会和老师一起……有点新鲜。',
    Battle_Damage_2: '唉，真是的……！',
    ExSkill_Level_1: '差不多该放弃了吧？',
    Cafe_monolog_2: '也许是训练的缘故……身体有点发沉。',
    Lobby_3: '训练固然好，但休息也很重要？……确实这也很有道理。可是，我不能偷懒。',
    'StudentProfile.Background': '不用就浪费了。',
    Lobby_4: '有什么我能做的……？谢谢你，老师。光是这么说，我就很高兴。',
    Lobby_5: '直到这个夏天结束的最后一刻……我都会在老师身边，帮助你。',
    Relationship_Up_1: '今年夏天，也能和老师在一起呢。',
    Battle_Move_2: '唉……还在啊？',
    Season_Birthday_2: '诶，总之先一起跳进海里吧？等、等一下老师！我、我还没做好心理准备……！',
    LogIn_1: '啊，欢迎回来，老师。训练的准备已经做好了。',
    EventLobby_2: '海边总是伴随着危险。……要是出了什么事，叫我就好。',
  },
  'hina-dress': {
    Cafe_monolog_1: '穿礼服……总有点静不下来。',
    Lobby_2: '最近在练钢琴。……久违地做点风纪委员以外的事，有点新鲜。',
    EventLobby_3: '不管发生什么，风纪委员会要做的事都不会变。……已经习以为常了。',
    ExSkill_Level_1: '要准备的话，我早就准备好了。',
    Cafe_monolog_2: '想找个地方坐下练一会儿……不过，现在不行。',
    Lobby_3: '穿上礼服，背会不自觉地挺直。……所以才会比平时更紧张一点吧。',
    Lobby_4: '就算穿着礼服，我还是我。今天也会在老师身边帮忙。所以……不许逃哦。',
    Lobby_5:
      '「虽然很严格，但日奈果然很可爱」……呜，你、你到底在说什么啊。……虽然有点高兴，但、但是……真是的。',
    Relationship_Up_1: '告诉我「就算是我也有用」的人，是老师。正因为有老师在……我才……真的，谢谢你。',
    Battle_Move_2: '我可不能迟到。',
    LogIn_1: '欢迎回来，老师。有什么需要我帮忙的吗？',
    EventLobby_1: '每次和万魔殿起冲突都让人头疼……不过这次有老师在，真是太好了。',
  },
  'hina-normal': {
    Lobby_2: '在这里，我不过是一名普通部员而已。',
    Battle_Damage_2: '这可不妙啊。',
    ExSkill_Level_1: '能撑多久呢？倒是让人期待。',
    Lobby_3: '那个……能、能不能别摸那么久？',
    Lobby_4: '我好歹也是风纪委员长，而、而且可能会被别人看到……',
    Lobby_5: '被看到也没关系？！你、你在说什么啊？！',
    Relationship_Up_1: '……这样的我，也可以吗？',
    Battle_Move_2: '真是的，做多少都做不完……',
    LogIn_1: '啊，老师，我一直在等你。',
    Relationship_Up_2: '……谢谢你陪着我，老师。',
  },
}
