import type {PokemonSet, SpeciesData} from '../types';

export const MECHANISM_GROUPS = [
  {id: 'speed', label: '速度与行动顺序'},
  {id: 'weather', label: '天气'},
  {id: 'terrain', label: '场地'},
  {id: 'protection', label: '保护与掩护'},
  {id: 'disruption', label: '干扰与反制'},
  {id: 'offense', label: '进攻与强化'},
  {id: 'resources', label: '轮转与续航'},
  {id: 'endgame', label: '终局路线'},
] as const;
export type MechanismGroup = typeof MECHANISM_GROUPS[number]['id'];
export interface MechanismRule {
  readonly id: string;
  readonly label: string;
  readonly group: MechanismGroup;
  /** A shared team function. Conditions without a role never add a coverage bonus. */
  readonly role?: string;
  readonly moves?: readonly string[];
  readonly abilities?: readonly string[];
  readonly items?: readonly string[];
  readonly mechanism: string;
  readonly limits: string;
  /** Only list conditions exposed by the current fast calculation adapter. */
  readonly quick?: string;
  readonly reference?: string;
}

export const MECHANISMS: readonly MechanismRule[] = [
  {id: 'tailwind', label: '顺风', group: 'speed', role: '控速', moves: ['tailwind'],
    mechanism: '在有限回合内提高己方速度，帮助搭档争取先手。', limits: '需要成功建立；不改变招式优先度，也不能抵消戏法空间的顺序反转。', quick: '速度与伤害页可指定双方顺风；不自动视为已经成功使用。', reference: 'https://www.vgcguide.com/speed-control'},
  {id: 'trickroom', label: '戏法空间', group: 'speed', role: '控速', moves: ['trickroom'],
    mechanism: '反转同优先度内的速度顺序，也可再次使用解除空间。', limits: '低速收益取决于实际对手；封印、挑衅、击掌与集火会影响建立窗口。', quick: '选定空间条件后反向比较速度；不把同速算作稳定先手。'},
  {id: 'speeddrop', label: '降速招式', group: 'speed', role: '控速', moves: ['icywind', 'electroweb', 'scaryface', 'bulldoze', 'lowsweep', 'rocktomb', 'stringshot'],
    mechanism: '通过降低对手速度等级改变后续行动顺序。', limits: '命中、能力下降免疫和反向强化会影响收益；重踏还会攻击队友。', quick: '可按明确的速度等级比较速度；不预先假设降速命中。'},
  {id: 'paralysis', label: '麻痹控速', group: 'speed', role: '控速', moves: ['thunderwave', 'nuzzle', 'glare', 'stunspore'],
    mechanism: '施加麻痹，降低速度并可能阻止行动。', limits: '电属性、特性、已有异常和场地可能阻挡；电磁波还受地面免疫影响。', quick: '指定麻痹后的速度可精算；麻痹无法行动交给回合执行。'},
  {id: 'turnorder', label: '延后与您先请', group: 'speed', role: '行动顺序', moves: ['quash', 'afteryou'],
    mechanism: '直接调整目标本回合的行动位置。', limits: '需要使用者及时行动且目标尚未行动；不能当成永久速度提升。'},
  {id: 'prioritysupport', label: '变化招式先制', group: 'speed', abilities: ['prankster', 'triage'],
    mechanism: '恶作剧之心或先行治疗让符合条件的变化招式优先行动。', limits: '恶作剧之心对恶属性对手的目标招式无效；先行治疗只作用于治疗类招式。'},
  {id: 'weatherspeed', label: '天气加速特性', group: 'speed', abilities: ['chlorophyll', 'swiftswim', 'sandrush', 'slushrush'],
    mechanism: '叶绿素、悠游自如、拨沙或拨雪在对应天气下提高速度。', limits: '天气必须实际生效；天气被覆盖或压制后速度优势会消失。', quick: '速度精算读取实际特性和指定天气。'},
  {id: 'terrainspeed', label: '电气场地加速', group: 'speed', abilities: ['surgesurfer'],
    mechanism: '冲浪之尾在电气场地下提高速度。', limits: '需要电气场地保持有效；不能从队友存在直接推断场地已建立。', quick: '速度精算读取冲浪之尾与电气场地条件。'},
  {id: 'unburden', label: '轻装', group: 'speed', abilities: ['unburden'],
    mechanism: '失去或消耗道具后提高速度，是具体配置的触发条件。', limits: '持有种子并不等于已经触发；需要匹配场地等消耗路线，换出后重新判断。', quick: '按明确的道具消耗状态或匹配的场地种子计算速度。'},

  {id: 'sun', label: '晴天', group: 'weather', role: '晴天', moves: ['sunnyday'], abilities: ['drought', 'orichalcumpulse'],
    mechanism: '建立晴天，改变火、水伤害并启用相应招式和天气特性。', limits: '招式设置需要行动；Mega 日照只在进化后成立；会同时影响对手。', quick: '晴天伤害、速度与命中风险；不提前计入尚未使用的晴天招式。'},
  {id: 'rain', label: '雨天', group: 'weather', role: '雨天', moves: ['raindance'], abilities: ['drizzle'],
    mechanism: '建立雨天，增强水属性输出并支持雨天速度、命中或续航路线。', limits: '雨天也削弱己方火属性攻击；天气争夺和对方受益者需要一起考虑。', quick: '雨天下的伤害、速度和打雷、暴风等命中条件。'},
  {id: 'sand', label: '沙暴', group: 'weather', role: '沙暴', moves: ['sandstorm'], abilities: ['sandstream', 'sandspit'],
    mechanism: '建立沙暴，支持拨沙、沙之力与岩石属性特防。', limits: '吐沙需要受到攻击；持续伤害可能破坏己方气腰或满血减伤。', quick: '沙暴下的伤害与速度；回合末削血由 Showdown 执行。'},
  {id: 'snow', label: '雪天', group: 'weather', role: '雪天', moves: ['snowscape'], abilities: ['snowwarning'],
    mechanism: '建立雪天，提高冰属性物理防御，支持暴风雪、拨雪和极光幕。', limits: '极光幕仍需要成功使用；雪天没有沙暴式的回合末伤害。', quick: '雪天物防、速度及暴风雪命中；极光幕不包含在当前条件精算中。'},
  {id: 'weatherdeny', label: '天气效果压制', group: 'weather', role: '天气压制', abilities: ['cloudnine', 'airlock'],
    mechanism: '在特性有效时压制天气效果，干扰依赖天气的进攻路线。', limits: '压制不等于删除天气；特性离场后天气可能恢复生效。', quick: '攻击或承伤双方的天气压制特性进入伤害计算；后排不提供压制。'},

  {id: 'grassy', label: '青草场地', group: 'terrain', role: '青草场地', moves: ['grassyterrain'], abilities: ['grassysurge'],
    mechanism: '支持草属性伤害、青草滑梯、青草种子与接地成员恢复。', limits: '接地和场地争夺决定效果；对接地目标的地震、重踏等会减伤。', quick: '场地伤害、青草滑梯及种子条件；回合末恢复在模拟中执行。'},
  {id: 'psychic', label: '精神场地', group: 'terrain', role: '精神场地', moves: ['psychicterrain'], abilities: ['psychicsurge'],
    mechanism: '支持超能力输出与广域战力，并保护接地成员免受敌方先制招式。', limits: '保护作用于接地目标；也可能阻挡己方对接地对手的先制进攻。', quick: '接地条件、广域战力与先制伤害阻断。'},
  {id: 'electric', label: '电气场地', group: 'terrain', role: '电气场地', moves: ['electricterrain'], abilities: ['electricsurge', 'hadronengine'],
    mechanism: '增强接地成员电属性输出，支持电气种子并防止接地成员新陷入睡眠。', limits: '不会唤醒已经睡着的成员；对手也可能受益。', quick: '场地伤害、种子与速度条件；睡眠限制由回合执行。'},
  {id: 'misty', label: '薄雾场地', group: 'terrain', role: '薄雾场地', moves: ['mistyterrain'], abilities: ['mistysurge'],
    mechanism: '保护接地成员免受新的异常状态，并降低对接地目标的龙属性伤害。', limits: '不增强妖精伤害、不解除已有异常，也可能阻碍己方催眠或灼伤。', quick: '龙属性伤害减免与种子条件；异常状态限制由回合执行。'},
  {id: 'terrainseed', label: '场地种子', group: 'terrain', items: ['grassyseed', 'psychicseed', 'electricseed', 'mistyseed'],
    mechanism: '在匹配场地中消耗种子，获得对应防御等级提升。', limits: '不是所有种子都加同一项能力；轻装需要同时拥有该特性。', quick: '防御等级和轻装使用同一场地、道具状态。'},

  {id: 'protect', label: '守住类招式', group: 'protection', role: '守住', moves: ['protect', 'detect', 'spikyshield', 'banefulbunker', 'kingsshield', 'obstruct', 'silktrap', 'burningbulwark'],
    mechanism: '用行动保护自己，消耗对方进攻、天气或控速回合。', limits: '连续使用会影响成功率；佯攻、穿透特性与附加惩罚分别处理。', quick: '可指定防守方已成功守住；不把连续守住成功视为必然。'},
  {id: 'redirection', label: '看我嘛与愤怒粉', group: 'protection', role: '掩护', moves: ['followme', 'ragepowder'],
    mechanism: '把可重定向的单体招式引到自己，为队友争取行动。', limits: '范围攻击不受普通重定向影响；草属性、防尘与防尘护目镜可无视愤怒粉。'},
  {id: 'wideguard', label: '广域防守', group: 'protection', role: '范围防护', moves: ['wideguard'],
    mechanism: '保护己方免受符合条件的范围攻击，包括队友的范围误伤。', limits: '不能阻挡单体攻击；需要核对实际目标类型与破防手段。'},
  {id: 'quickguard', label: '快速防守', group: 'protection', role: '先制阻断', moves: ['quickguard'],
    mechanism: '用招式阻挡敌方符合条件的先制行动。', limits: '占用行动；不等同于永久先制免疫。'},
  {id: 'priorityblock', label: '先制阻断特性', group: 'protection', role: '先制阻断', abilities: ['armortail', 'queenlymajesty', 'dazzling'],
    mechanism: '尾甲、女王的威严或鲜艳之躯阻挡对己方的敌方先制招式。', limits: '需要特性持有者在场且特性生效；特性穿透或消除另行判断。'},
  {id: 'screens', label: '反射壁与光墙', group: 'protection', role: '双墙', moves: ['reflect', 'lightscreen'],
    mechanism: '分别降低己方承受的物理或特殊伤害，为强化与交换提供空间。', limits: '双打减伤与单打不同；要害、穿透和拆墙手段可能绕过效果。', quick: '可分别设置双方反射壁和光墙，按双打规则计算。'},
  {id: 'veil', label: '极光幕', group: 'protection', role: '双墙', moves: ['auroraveil'],
    mechanism: '在雪天下建立同时覆盖物理与特殊伤害的屏障。', limits: '需要使用时有雪；不与反射壁、光墙重复叠加同类减伤。'},
  {id: 'friendguard', label: '友情防守', group: 'protection', role: '减伤支援', abilities: ['friendguard'],
    mechanism: '降低搭档受到的伤害，保护能力与持有者自身输出分开评价。', limits: '不保护特性持有者自己；依赖该成员仍在场且特性有效。', quick: '伤害页可指定防守方搭档的友情防守。'},
  {id: 'statusguard', label: '异常与行动保护', group: 'protection', role: '异常防护', moves: ['safeguard', 'mist'], abilities: ['sweetveil', 'aromaveil', 'flowerveil', 'pastelveil'],
    mechanism: '按招式或特性规则保护己方免受特定异常、能力下降或行动限制。', limits: '甜幕、芳香幕、花幕与粉彩护幕保护对象不同，不能视为全异常免疫。'},
  {id: 'powderimmune', label: '防粉末条件', group: 'protection', abilities: ['overcoat'], items: ['safetygoggles'],
    mechanism: '防尘或防尘护目镜提供粉末免疫，可绕过愤怒粉等干扰。', limits: '草属性本身也有粉末免疫；这里仅检索特性和道具配置。'},
  {id: 'survival', label: '气腰与满血防守', group: 'protection', abilities: ['sturdy', 'multiscale', 'shadowshield', 'disguise', 'iceface'], items: ['focussash'],
    mechanism: '以满血、首次命中或指定攻击类别等条件保留行动机会。', limits: '不同效果不能混为一谈；多段攻击、天气削血和失效后的形态需分别检查。', quick: '当前 HP、多段命中、气腰及首次防护失效状态可精算。'},

  {id: 'fakeout', label: '击掌奇袭', group: 'disruption', role: '干扰', moves: ['fakeout'],
    mechanism: '在刚入场的时机用先制畏缩干扰对手，为搭档争取行动。', limits: '幽灵、精神场地、先制阻断和畏缩免疫会使路线失效；不是每回合都能使用。', quick: '伤害计算包含属性和场地限制；入场时机与畏缩由回合判断。'},
  {id: 'intimidate', label: '威吓', group: 'disruption', role: '威吓', abilities: ['intimidate'],
    mechanism: '入场时降低对手攻击，配合换人反复干预物理输出。', limits: '能力下降免疫、好胜与不服输会改变甚至反转收益。', quick: '威吓及相应免疫、反向强化交给 Champions 伤害实现。'},
  {id: 'outputdrop', label: '削弱输出', group: 'disruption', role: '削弱输出', moves: ['snarl', 'partingshot', 'charm', 'featherdance', 'eerieimpulse', 'strugglebug', 'mysticalfire', 'chillingwater', 'breakingswipe', 'lunge', 'tropkick', 'babydolleyes'],
    mechanism: '按招式降低攻击或特攻，改变后续伤害交换。', limits: '需要命中及能力下降生效；换出后通常恢复，反向强化可能惩罚使用者。', quick: '可指定实际能力等级比较伤害；不提前计入尚未成功的削弱。'},
  {id: 'sleep', label: '催眠', group: 'disruption', role: '异常干扰', moves: ['spore', 'sleeppowder', 'hypnosis', 'yawn', 'sing', 'darkvoid', 'lovelykiss'],
    mechanism: '用睡眠或哈欠倒计时限制对方行动和站场。', limits: '粉末免疫、场地、特性、已有异常与命中率分别影响；哈欠不是立刻睡眠。'},
  {id: 'burn', label: '灼伤', group: 'disruption', role: '异常干扰', moves: ['willowisp'],
    mechanism: '削弱多数物理攻击并施加持续伤害。', limits: '火属性和部分特性免疫；毅力等特性可能反过来受益。', quick: '可指定灼伤后的伤害条件；不预先假设鬼火命中。'},
  {id: 'taunt', label: '挑衅', group: 'disruption', role: '行动限制', moves: ['taunt'],
    mechanism: '阻止对方使用变化招式，干扰空间、掩护、回复和强化。', limits: '精神香草、迟钝、芳香幕、魔法镜及恶作剧之心的目标限制需核对。'},
  {id: 'encoredisable', label: '再来一次与定身法', group: 'disruption', role: '行动限制', moves: ['encore', 'disable', 'torment'],
    mechanism: '根据已使用招式锁定或封锁行动选择。', limits: '需要具体回合历史；未观察到对方招式时不能宣称能稳定封锁。'},
  {id: 'imprison', label: '封印', group: 'disruption', role: '封印', moves: ['imprison'],
    mechanism: '封锁对手与使用者重合的招式，可针对戏法空间、守住等。', limits: '只有同时携带的招式才受封锁；持有者离场后失效。'},
  {id: 'antisetup', label: '清除与无视强化', group: 'disruption', role: '反强化', moves: ['haze', 'clearsmog', 'topsyturvy'], abilities: ['unaware'],
    mechanism: '按机制清除、反转或无视对方能力变化，限制强化路线。', limits: '黑雾也清除己方强化；清除之烟受免疫等条件影响，纯朴不等于清除状态。', quick: '纯朴进入双方伤害计算；清除与反转需要回合执行。'},
  {id: 'itemcontrol', label: '道具干扰', group: 'disruption', role: '道具干扰', moves: ['knockoff', 'trick', 'switcheroo', 'corrosivegas', 'incinerate'], abilities: ['unnerve'],
    mechanism: '移除、交换、破坏道具或阻止树果使用。', limits: 'Mega 石等道具有特殊规则；紧张感不等同于移除道具。', quick: '可指定道具与消耗状态进行对照，交换或移除过程交给回合执行。'},
  {id: 'abilitycontrol', label: '特性干扰与穿透', group: 'disruption', role: '特性干扰', moves: ['skillswap', 'gastroacid', 'worryseed', 'simplebeam', 'entrainment'], abilities: ['neutralizinggas', 'moldbreaker', 'teravolt', 'turboblaze'],
    mechanism: '按招式或特性消除、交换、替换或绕过指定特性。', limits: '化学变化气体与破格作用范围不同；不可消除特性和在场条件需分别检查。', quick: '可明确指定替换后的特性；不自动假定化学变化气体已处理所有场上交互。'},
  {id: 'antidrop', label: '抗威吓与反向强化', group: 'disruption', abilities: ['clearbody', 'whitesmoke', 'fullmetalbody', 'innerfocus', 'oblivious', 'owntempo', 'scrappy', 'defiant', 'competitive', 'guarddog', 'contrary'], items: ['clearamulet'],
    mechanism: '抵抗能力下降，或利用对手的能力下降触发反向收益。', limits: '部分特性只免疫威吓，不免疫所有降能力招式；需按实际机制区分。', quick: '威吓、能力下降免疫与相应反向强化可对照。'},
  {id: 'bounce', label: '反弹与解除干扰', group: 'disruption', abilities: ['magicbounce'], items: ['mentalherb'],
    mechanism: '以魔法镜反弹符合条件的变化招式，或用精神香草解除特定行动限制。', limits: '精神香草为一次性资源；并非所有变化招式都能反弹。'},
  {id: 'phazing', label: '强制换人', group: 'disruption', role: '强制换人', moves: ['roar', 'whirlwind', 'dragontail', 'circlethrow'],
    mechanism: '迫使目标换出，打断强化或固定站场路线。', limits: '后备、优先度、免疫、替身与扎根等条件影响是否成功。'},

  {id: 'spread', label: '范围输出', group: 'offense', role: '范围输出', moves: ['heatwave', 'hypervoice', 'makeitrain', 'rockslide', 'earthquake', 'dazzlinggleam', 'expandingforce', 'blizzard', 'eruption', 'waterspout', 'originpulse', 'precipiceblades', 'muddywater', 'discharge', 'surf', 'snarl', 'icywind', 'electroweb', 'bleakwindstorm', 'wildboltstorm', 'sandsearstorm', 'springtidestorm', 'matchagotcha', 'petalblizzard', 'boomburst', 'breakingswipe', 'bulldoze', 'strugglebug'],
    mechanism: '攻击多个目标，制造双目标压力或同时附加干扰。', limits: '实际目标、范围衰减、广域防守与队友误伤分别判断；广域战力依赖场地。', quick: '按范围衰减、场地、目标数与真实伤害分布计算。'},
  {id: 'priority', label: '先制进攻', group: 'offense', role: '先制', moves: ['fakeout', 'suckerpunch', 'aquajet', 'extremespeed', 'grassyglide', 'machpunch', 'bulletpunch', 'iceshard', 'shadowsneak', 'quickattack', 'feint', 'firstimpression', 'accelerock', 'jetpunch', 'thunderclap', 'vacuumwave', 'watershuriken'],
    mechanism: '以招式优先度收割或干扰速度更快的对手。', limits: '击掌奇袭、突袭、迎头一击、青草滑梯等各有条件；先制阻断也需检查。', quick: '伤害可精算；突袭是否成功等同时行动条件在回合内判断。'},
  {id: 'physicalsetup', label: '物理强化', group: 'offense', role: '强化', moves: ['swordsdance', 'dragondance', 'bulkup', 'bellydrum', 'coil', 'howl', 'shiftgear', 'tidyup'],
    mechanism: '投入行动或 HP 提升物理进攻能力。', limits: '需要出手机会；强化次数不等同于稳定收益，换出或反强化可能清除投入。', quick: '可以明确指定强化等级比较伤害、速度与生存。'},
  {id: 'specialsetup', label: '特殊强化', group: 'offense', role: '强化', moves: ['nastyplot', 'calmmind', 'quiverdance', 'geomancy', 'tailglow'],
    mechanism: '提升特攻，部分招式同时增加特防或速度。', limits: '行动窗口、充能条件与反强化手段需单独评估。', quick: '可指定实际强化等级精算。'},
  {id: 'defensivesetup', label: '防守与复合强化', group: 'offense', role: '强化', moves: ['irondefense', 'acidarmor', 'amnesia', 'cosmicpower', 'stockpile', 'shellsmash', 'workup', 'noretreat'],
    mechanism: '通过防守强化或多项能力变化建立站场和后续输出。', limits: '破壳会降低双防；不能将复合能力变化统称为无代价强化。', quick: '伤害与速度可使用实际能力等级，条件性招式效果由引擎处理。'},
  {id: 'helpinghand', label: '帮助', group: 'offense', role: '支援', moves: ['helpinghand'],
    mechanism: '增强搭档本回合的攻击，集中突破关键目标。', limits: '搭档守住、换人、使用变化招式或未能攻击时可能空转。', quick: '按搭档实际伤害计算增幅；模拟评分检查搭档的同时行动。'},
  {id: 'allyboost', label: '队友强化', group: 'offense', role: '支援', moves: ['coaching', 'decorate', 'acupressure', 'gearup', 'magneticflux'], abilities: ['steelyspirit', 'powerspot'],
    mechanism: '为搭档提升能力，或按特性为搭档增幅攻击。', limits: '辅助手段的作用对象与所需特性不同；增幅只在条件实际满足时成立。'},
  {id: 'protectbreak', label: '穿过守住', group: 'offense', role: '破防', moves: ['feint', 'hyperspacehole', 'hyperspacefury'], abilities: ['unseenfist'],
    mechanism: '按招式或接触条件绕过、移除守住类防护。', limits: '不可见之拳依赖接触；佯攻和其他穿透招式并非相同的防护移除效果。', quick: '可在成功守住条件下逐招对照伤害。'},
  {id: 'screenbreak', label: '拆墙', group: 'offense', role: '破防', moves: ['brickbreak', 'psychicfangs', 'ragingbull', 'defog'], abilities: ['infiltrator'],
    mechanism: '拆除屏障或按特性穿透屏障与替身。', limits: '拆墙与穿过守住不同；替身和屏障的处理取决于具体招式。', quick: '伤害页可指定反射壁、光墙进行对照；移除过程交给回合执行。'},

  {id: 'pivot', label: '轮转招式', group: 'resources', role: '轮转', moves: ['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'batonpass', 'chillyreception', 'shedtail'],
    mechanism: '用招式更换在场成员，调整搭档与出场顺序。', limits: '招式成功、免疫、捕获和可用后备都会影响能否换出。'},
  {id: 'switchrecovery', label: '再生力与换出恢复', group: 'resources', role: '续航', abilities: ['regenerator', 'naturalcure'],
    mechanism: '利用换人回复 HP 或清除异常，支持重复入场。', limits: '再生力与自然回复恢复内容不同；需要安全的轮转路线。'},
  {id: 'recovery', label: '自身回复', group: 'resources', role: '续航', moves: ['recover', 'roost', 'slackoff', 'softboiled', 'rest', 'wish', 'moonlight', 'morningsun', 'synthesis', 'shoreup', 'strengthsap', 'milkdrink', 'healorder', 'drainingkiss', 'gigadrain', 'drainpunch', 'oblivionwing', 'matchagotcha'], abilities: ['poisonheal'],
    mechanism: '通过回复、吸取或特性维持 HP 与站场能力。', limits: '花费行动、天气、睡眠、对方伤害及回复封锁会改变实际收益。'},
  {id: 'allyheal', label: '队友回复与款待', group: 'resources', role: '回复支援', moves: ['lifedew', 'healpulse', 'floralhealing', 'pollenpuff', 'lunarblessing', 'junglehealing'], abilities: ['hospitality', 'healer'],
    mechanism: '为搭档恢复 HP 或异常，款待通过入场触发。', limits: '必须有受益搭档；回复不足时不能声称恢复了满血减伤。'},
  {id: 'revive', label: '复生祈祷', group: 'resources', role: '复活', moves: ['revivalblessing'],
    mechanism: '让倒下的关键队友重新参与对局。', limits: '需要倒下队友、PP、行动窗口及重新入场机会；不是无条件增加攻击回合。', reference: 'https://www.smogon.com/forums/threads/vgc-reg-m-c-metagame-discussion-thread.3788116/'},

  {id: 'perish', label: '灭亡之歌', group: 'endgame', role: '灭歌', moves: ['perishsong'],
    mechanism: '用灭亡倒数迫换，或配合限制换人结束对局。', limits: '隔音、换出与最后存活者判定影响路线；己方也需要安全撤退。'},
  {id: 'trap', label: '限制换人', group: 'endgame', role: '限制换人', moves: ['meanlook', 'block', 'spiderweb', 'infestation', 'whirlpool', 'firespin', 'sandtomb', 'wrap', 'bind', 'thundercage', 'snaptrap'], abilities: ['shadowtag', 'arenatrap', 'magnetpull'],
    mechanism: '按招式或特性限制目标换出，维持集火或倒数路线。', limits: '幽灵、飞行/飘浮、属性、逃脱道具与特殊换人招式需要分别判断；Mega 踩影只在进化后成立。'},
  {id: 'chip', label: '持续消耗', group: 'endgame', role: '消耗', moves: ['leechseed', 'saltcure', 'toxic', 'toxicthread', 'infestation', 'whirlpool', 'firespin', 'sandtomb'],
    mechanism: '叠加持续损耗，配合保护与轮转缩短对手站场时间。', limits: '属性、免疫、换出与回复会改变持续效果；不把标签数量当作消耗成功率。'},
  {id: 'trade', label: '同命与定量交换', group: 'endgame', role: '交换路线', moves: ['destinybond', 'finalgambit', 'endeavor', 'explosion', 'selfdestruct'],
    mechanism: '通过同命、HP 交换或自我牺牲建立人数或残局优势。', limits: '是否换到关键成员取决于行动顺序、目标、免疫和对方选择。'},
];

const byMove = new Map([...new Set(MECHANISMS.flatMap(rule => rule.moves ?? []))].map(id => [id, MECHANISMS.filter(rule => rule.moves?.includes(id))]));
const byAbility = new Map([...new Set(MECHANISMS.flatMap(rule => rule.abilities ?? []))].map(id => [id, MECHANISMS.filter(rule => rule.abilities?.includes(id))]));
const byItem = new Map([...new Set(MECHANISMS.flatMap(rule => rule.items ?? []))].map(id => [id, MECHANISMS.filter(rule => rule.items?.includes(id))]));
const order = new Map(MECHANISMS.map((rule, index) => [rule.id, index]));

export function setMechanisms(set: PokemonSet): MechanismRule[] {
  return [...new Set([...set.moves.flatMap(id => byMove.get(id) ?? []), ...(byAbility.get(set.abilityId ?? '') ?? []), ...(byItem.get(set.itemId ?? '') ?? [])])]
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

/** Only the chosen stone's form is searchable as a possible Mega condition. */
export function configurationMechanisms(set: PokemonSet, species?: SpeciesData): {rule: MechanismRule; mega: boolean}[] {
  const initial = setMechanisms(set);
  const form = species?.megaForms.find(form => form.itemId === set.itemId);
  const after = form ? (byAbility.get(form.abilityId) ?? []).filter(rule => !initial.includes(rule)) : [];
  return [...initial.map(rule => ({rule, mega: false})), ...after.map(rule => ({rule, mega: true}))];
}
