// 编年：列国、疆域沿革、大事、战役。
// 疆域取主流复原图之概貌，以事件为界作阶段切换，非逐年精确。

export const START = -475;
export const END = -221;

export const STATES = {
  qin: { name: '秦', full: '秦', color: '#4a6274', ink: '#95b3c8', order: 1 },
  chu: { name: '楚', full: '楚', color: '#b8452f', ink: '#e08a72', order: 2 },
  qi: { name: '齐', full: '齐', color: '#3d8ea3', ink: '#7cc4d6', order: 3 },
  zhao: { name: '赵', full: '赵', color: '#8e5aa0', ink: '#c194d2', order: 4 },
  wei: { name: '魏', full: '魏', color: '#c9982f', ink: '#e8c268', order: 5 },
  han: { name: '韩', full: '韩', color: '#7e9a45', ink: '#b4cc7c', order: 6 },
  yan: { name: '燕', full: '燕', color: '#5f6fa8', ink: '#96a4d8', order: 7 },
  jin: { name: '晋', full: '晋', color: '#a2703f', ink: '#d0a273', order: 8 },
  yue: { name: '越', full: '越', color: '#2f8f7a', ink: '#6fc3ae', order: 9 },
  song: { name: '宋', full: '宋', color: '#a4568a', ink: '#d691bd', order: 10 },
  zhou: { name: '周', full: '周', color: '#c9a227', ink: '#efd06a', order: 11 },
  lu: { name: '鲁', full: '鲁', color: '#6d8fae', ink: '#a5c3dc', order: 12 },
  zhongshan: { name: '中山', full: '中山', color: '#a06840', ink: '#cf9a70', order: 13 },
  zheng: { name: '郑', full: '郑', color: '#8d7ea8', ink: '#bdb0d6', order: 14 },
  wey: { name: '卫', full: '卫', color: '#8a8f5c', ink: '#bcc190', order: 15 },
  wuguo: { name: '吴', full: '吴', color: '#3f7f8f', ink: '#7fb8c6', order: 16 },
  ba: { name: '巴', full: '巴', color: '#7a6a55', ink: '#a99b80', order: 17 },
  shu: { name: '蜀', full: '蜀', color: '#6b7b58', ink: '#9dae89', order: 18 },
  daiguo: { name: '代', full: '代', color: '#8a7060', ink: '#b6a094', order: 19 },
  // 诸戎狄百越，不列入七雄计
  yiqu: { name: '义渠', tribe: true, color: '#4c4d43', order: 30 },
  linhu: { name: '林胡楼烦', tribe: true, color: '#4c4d43', order: 31 },
  xiongnu: { name: '匈奴', tribe: true, color: '#4c4d43', order: 32 },
  donghu: { name: '东胡', tribe: true, color: '#4c4d43', order: 33 },
  yuezhi: { name: '月氏', tribe: true, color: '#4c4d43', order: 34 },
  qiang: { name: '羌', tribe: true, color: '#4c4d43', order: 35 },
  baiyue: { name: '百越', tribe: true, color: '#46514a', order: 36 },
  dian: { name: '滇', tribe: true, color: '#46514a', order: 37 },
  yelang: { name: '夜郎', tribe: true, color: '#46514a', order: 38 },
  chaoxian: { name: '朝鲜', tribe: true, color: '#4a4e54', order: 39 },
};

export const SEVEN = ['qin', 'chu', 'qi', 'zhao', 'wei', 'han', 'yan'];

export const BASE = {
  neishi: 'qin', longxi: 'qin', beidi: 'qin', shangyu: 'qin', hexi: 'qin',
  yiqu: 'yiqu', shangjun: 'yiqu',
  hedong: 'jin', taiyuan: 'jin', shangdang: 'jin', yanmen: 'jin', handan: 'jin',
  julu: 'jin', henei: 'jin', daliang: 'jin', dongjun: 'jin', sanchuan: 'jin', yingchuan: 'jin',
  dai: 'daiguo', zhongshan: 'zhongshan', luoyi: 'zhou', xinzheng: 'zheng', weidi: 'wey',
  songdu: 'song', pengcheng: 'song', tao: 'song', tengxue: 'song', lu: 'lu',
  linzi: 'qi', jiaodong: 'qi', jixi: 'qi',
  kuaiji: 'yue', langya: 'yue', wu: 'wuguo',
  ji: 'yan', yixia: 'yan',
  shanggu: 'donghu', yuyang: 'donghu', liaoxi: 'donghu', liaodong: 'donghu', donghu: 'donghu',
  chaoxian: 'chaoxian',
  ying: 'chu', yancheng: 'chu', chen: 'chu', runan: 'chu', shouchun: 'chu', sishui: 'chu',
  jiangxia: 'chu', changsha: 'chu', wuling: 'chu', yuzhang: 'chu', qianzhong: 'chu', wujun: 'chu',
  hanzhong: 'chu', nanyang: 'chu',
  ba: 'ba', shu: 'shu', qiongzuo: 'qiang', qiang: 'qiang', yuezhi: 'yuezhi',
  linhu: 'linhu', yunzhong: 'linhu', xiongnu: 'xiongnu',
  lingnan: 'baiyue', cangwu: 'baiyue', minyue: 'baiyue', ouyue: 'baiyue', dian: 'dian', yelang: 'yelang',
};

// 疆域变更，按年递进
export const CHANGES = [
  { year: -473, note: '越灭吴，尽有江东', set: { wu: 'yue' } },
  { year: -457, note: '赵襄子灭代', set: { dai: 'zhao' } },
  { year: -453, note: '三家分晋，晋室名存实亡', set: { taiyuan: 'zhao', yanmen: 'zhao', handan: 'zhao', julu: 'zhao', hedong: 'wei', henei: 'wei', daliang: 'wei', dongjun: 'wei', sanchuan: 'han', yingchuan: 'han', shangdang: 'han' } },
  { year: -409, note: '魏取秦上郡', set: { shangjun: 'wei' } },
  { year: -408, note: '吴起尽取河西', set: { hexi: 'wei' } },
  { year: -406, note: '魏灭中山', set: { zhongshan: 'wei' } },
  { year: -380, note: '中山复国', set: { zhongshan: 'zhongshan' } },
  { year: -379, note: '越南徙，齐取琅琊', set: { langya: 'qi' } },
  { year: -375, note: '韩灭郑，徙都新郑', set: { xinzheng: 'han', nanyang: 'han' } },
  { year: -330, note: '雕阴战后魏献河西', set: { hexi: 'qin' } },
  { year: -328, note: '魏献上郡于秦', set: { shangjun: 'qin' } },
  { year: -316, note: '秦并巴蜀', set: { ba: 'qin', shu: 'qin' } },
  { year: -312, note: '秦取楚汉中', set: { hanzhong: 'qin' } },
  { year: -306, note: '楚灭越，有吴会', set: { kuaiji: 'chu', wu: 'chu' } },
  { year: -300, note: '秦开却东胡，赵武灵王开云中九原', set: { shanggu: 'yan', yuyang: 'yan', liaoxi: 'yan', liaodong: 'yan', yunzhong: 'zhao', linhu: 'zhao' } },
  { year: -296, note: '赵灭中山', set: { zhongshan: 'zhao' } },
  { year: -291, note: '秦取宛', set: { nanyang: 'qin' } },
  { year: -290, note: '魏献河东四百里', set: { hedong: 'qin' } },
  { year: -286, note: '齐灭宋', set: { songdu: 'qi', pengcheng: 'qi', tao: 'qi', tengxue: 'qi' } },
  { year: -284, note: '五国破齐，三国分宋', set: { linzi: 'yan', jixi: 'yan', tao: 'qin', songdu: 'wei', pengcheng: 'chu', tengxue: 'chu' } },
  { year: -279, note: '田单复齐七十余城', set: { linzi: 'qi', jixi: 'qi' } },
  { year: -278, note: '白起拔郢，秦置南郡', set: { ying: 'qin', yancheng: 'qin', jiangxia: 'qin' } },
  { year: -277, note: '秦取巫、黔中', set: { wujun: 'qin', qianzhong: 'qin' } },
  { year: -272, note: '秦灭义渠', set: { yiqu: 'qin' } },
  { year: -262, note: '秦取野王，上党归赵', set: { henei: 'qin', shangdang: 'zhao' } },
  { year: -260, note: '长平战后上党入秦', set: { shangdang: 'qin' } },
  { year: -256, note: '楚灭鲁', set: { lu: 'chu' } },
  { year: -254, note: '卫为魏附庸', set: { weidi: 'wei' } },
  { year: -249, note: '秦灭东周，置三川郡', set: { luoyi: 'qin', sanchuan: 'qin' } },
  { year: -248, note: '蒙骜取太原', set: { taiyuan: 'qin' } },
  { year: -242, note: '秦置东郡', set: { dongjun: 'qin' } },
  { year: -241, note: '卫徙野王，其地入秦', set: { weidi: 'qin' } },
  { year: -230, note: '秦灭韩', set: { xinzheng: 'qin', yingchuan: 'qin' } },
  { year: -228, note: '秦灭赵', set: { handan: 'qin', julu: 'qin', zhongshan: 'qin' } },
  { year: -226, note: '秦拔蓟，燕王走辽东', set: { ji: 'qin', yixia: 'qin', shanggu: 'qin', yuyang: 'qin', liaoxi: 'qin' } },
  { year: -225, note: '秦灭魏', set: { daliang: 'qin', songdu: 'qin' } },
  { year: -224, note: '王翦破楚军于蕲南', set: { chen: 'qin', runan: 'qin', sishui: 'qin', pengcheng: 'qin', tengxue: 'qin' } },
  { year: -223, note: '秦灭楚', set: { shouchun: 'qin', lu: 'qin' } },
  { year: -222, note: '灭代、定江南、下辽东', set: { changsha: 'qin', wuling: 'qin', yuzhang: 'qin', wu: 'qin', kuaiji: 'qin', dai: 'qin', yanmen: 'qin', yunzhong: 'qin', linhu: 'qin', liaodong: 'qin' } },
  { year: -221, note: '秦灭齐，天下一统', set: { linzi: 'qin', jiaodong: 'qin', jixi: 'qin', langya: 'qin' } },
];

export const CAPITALS = [
  { state: 'qin', name: '雍', lon: 107.4, lat: 34.52, from: -475, to: -350 },
  { state: 'qin', name: '咸阳', lon: 108.72, lat: 34.35, from: -350, to: -221 },
  { state: 'wei', name: '安邑', lon: 111.22, lat: 35.14, from: -453, to: -361 },
  { state: 'wei', name: '大梁', lon: 114.35, lat: 34.79, from: -361, to: -225 },
  { state: 'han', name: '阳翟', lon: 113.4, lat: 34.16, from: -453, to: -375 },
  { state: 'han', name: '新郑', lon: 113.72, lat: 34.4, from: -375, to: -230 },
  { state: 'zhao', name: '晋阳', lon: 112.55, lat: 37.87, from: -453, to: -386 },
  { state: 'zhao', name: '邯郸', lon: 114.49, lat: 36.6, from: -386, to: -228 },
  { state: 'chu', name: '郢', lon: 112.19, lat: 30.42, from: -475, to: -278 },
  { state: 'chu', name: '陈', lon: 114.88, lat: 33.73, from: -278, to: -241 },
  { state: 'chu', name: '寿春', lon: 116.78, lat: 32.0, from: -241, to: -223 },
  { state: 'qi', name: '临淄', lon: 118.31, lat: 36.87, from: -475, to: -221 },
  { state: 'yan', name: '蓟', lon: 116.4, lat: 39.9, from: -475, to: -226 },
  { state: 'yan', name: '辽东', lon: 123.0, lat: 41.3, from: -226, to: -222 },
  { state: 'zhou', name: '洛邑', lon: 112.45, lat: 34.68, from: -475, to: -249 },
  { state: 'jin', name: '绛', lon: 111.55, lat: 35.6, from: -475, to: -453 },
  { state: 'song', name: '商丘', lon: 115.65, lat: 34.41, from: -475, to: -286 },
  { state: 'lu', name: '曲阜', lon: 116.99, lat: 35.6, from: -475, to: -256 },
  { state: 'yue', name: '琅琊', lon: 119.2, lat: 35.6, from: -475, to: -379 },
  { state: 'yue', name: '吴', lon: 120.6, lat: 31.3, from: -379, to: -306 },
  { state: 'zhongshan', name: '灵寿', lon: 114.5, lat: 38.5, from: -475, to: -296 },
  { state: 'zheng', name: '新郑', lon: 113.72, lat: 34.4, from: -475, to: -375 },
  { state: 'wey', name: '帝丘', lon: 115.0, lat: 35.7, from: -475, to: -241 },
  { state: 'shu', name: '成都', lon: 104.07, lat: 30.66, from: -475, to: -316 },
  { state: 'ba', name: '江州', lon: 106.55, lat: 29.56, from: -475, to: -316 },
  { state: 'wuguo', name: '姑苏', lon: 120.6, lat: 31.3, from: -475, to: -473 },
];

// 战役：行军路线用于沙盘推演
export const BATTLES = [
  {
    id: 'jinyang', year: -453, name: '晋阳之战', at: [112.55, 37.87],
    sides: '智伯率韩魏攻赵，围晋阳三年，决汾水灌城',
    force: '智氏联军约十万 · 赵氏守卒数万',
    result: '赵襄子策反韩魏，反灌智军，智伯身死族灭',
    weight: '晋国公室名存实亡，三家分晋自此定局',
    steps: [
      '智伯挟韩魏之师北上，围晋阳三年',
      '韩康子之军东来会围',
      '魏桓子自安邑北上，决汾水灌城，城不没者三版',
      '张孟谈夜出说韩魏，反决水灌智军，智伯身死族灭',
    ],
    arrows: [
      { state: 'jin', label: '智', path: [[111.6, 35.7], [112.0, 36.6], [112.5, 37.6]] },
      { state: 'han', label: '韩', path: [[113.3, 34.4], [112.9, 36.2], [112.7, 37.6]] },
      { state: 'wei', label: '魏', path: [[111.3, 35.2], [112.2, 36.8], [112.5, 37.7]] },
    ],
  },
  {
    id: 'yinjin', year: -389, name: '阴晋之战', at: [110.2, 34.6],
    sides: '吴起以魏武卒五万拒秦五十万',
    force: '魏五万 · 秦五十万（号）',
    result: '魏大破秦军，尽有河西',
    weight: '魏武卒之名震动天下，魏国霸业极盛',
    steps: [
      '秦五十万东出，压至阴晋',
      '吴起以魏武卒五万迎击于河西',
      '秦师大溃，魏尽有河西之地',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [109.6, 34.5], [110.1, 34.6]] },
      { state: 'wei', label: '魏', path: [[111.2, 35.2], [110.7, 34.9], [110.3, 34.65]] },
    ],
  },
  {
    id: 'guiling', year: -353, name: '桂陵之战', at: [115.5, 35.4],
    sides: '齐救赵，孙膑围魏救赵',
    force: '齐八万 · 魏军主力围邯郸',
    result: '齐军半途截击于桂陵，擒魏将庞涓',
    weight: '「围魏救赵」出典，魏国东向受挫',
    steps: [
      '魏军北上围邯郸，赵求救于齐',
      '孙膑不救赵而直趋大梁，中途设伏于桂陵',
      '魏军回师救国，遭截击而败，庞涓被擒',
    ],
    arrows: [
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [114.4, 35.6], [114.5, 36.5]] },
      { state: 'qi', label: '齐', path: [[118.31, 36.87], [116.8, 36.2], [115.6, 35.5]] },
    ],
  },
  {
    id: 'maling', year: -341, name: '马陵之战', at: [115.6, 36.0],
    sides: '齐救韩，孙膑减灶诱敌',
    force: '齐十万 · 魏十万',
    result: '魏军全没，庞涓自刭，太子申被虏',
    weight: '魏失霸主之位，天下由一强变为群雄并峙',
    steps: [
      '魏挟旧怨伐韩，韩五战不胜而告急于齐',
      '齐师又直指大梁，太子申回师追击',
      '孙膑日减其灶，退至马陵设伏',
      '万弩俱发，魏军全没，庞涓自刭',
    ],
    arrows: [
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [113.9, 34.5], [113.72, 34.4]] },
      { state: 'wei', label: '魏追', path: [[113.8, 34.5], [114.8, 35.3], [115.5, 35.95]] },
      { state: 'qi', label: '齐', path: [[118.31, 36.87], [116.9, 36.4], [115.7, 36.05]] },
    ],
  },
  {
    id: 'diaoyin', year: -330, name: '雕阴之战', at: [109.9, 36.4],
    sides: '秦公孙衍攻魏西河',
    force: '魏军四万五千尽没',
    result: '虏魏将龙贾，魏尽献河西之地',
    weight: '崤函之固归秦，此后秦可出关而列国不可入关',
    steps: [
      '公孙衍北上直取雕阴',
      '斩首四万五千，虏龙贾，魏尽献河西',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [109.3, 35.4], [109.9, 36.3]] },
    ],
  },
  {
    id: 'hanguu318', year: -318, name: '五国攻秦', at: [110.9, 34.62],
    sides: '公孙衍倡合纵，魏赵韩燕楚共攻函谷',
    force: '五国之师 · 秦守关',
    result: '楚燕观望，三晋独战，次年修鱼之败斩首八万',
    weight: '首次合纵伐秦无功，连横之势渐成',
    steps: [
      '魏师西出，压至函谷关',
      '韩师自新郑西上会师',
      '赵师南下会师，然楚燕观望，实为三晋独战',
      '秦守关不出，次年修鱼之战斩首八万',
    ],
    arrows: [
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [112.6, 34.7], [111.2, 34.62]] },
      { state: 'han', label: '韩', path: [[113.72, 34.4], [112.4, 34.5], [111.3, 34.6]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [113.2, 35.4], [111.4, 34.8]] },
    ],
  },
  {
    id: 'bashu', year: -316, name: '秦并巴蜀', at: [104.6, 30.9],
    sides: '司马错争于朝堂：得蜀则得楚',
    force: '秦师自石牛道入',
    result: '灭蜀，继灭巴与苴，置蜀郡',
    weight: '秦得天府之粮仓与顺江伐楚之上游',
    steps: [
      '司马错自石牛道入蜀，十月而灭之',
      '回师东下，并巴与苴，置蜀郡',
      '天府之粮与顺江伐楚之上游，皆入于秦',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [106.9, 33.3], [105.4, 32.0], [104.3, 30.9]] },
      { state: 'qin', label: '秦', path: [[105.4, 32.0], [106.2, 30.6], [106.6, 30.1]] },
    ],
  },
  {
    id: 'danyang', year: -312, name: '丹阳·蓝田之战', at: [111.0, 33.0],
    sides: '张仪诈许商於六百里，楚怀王怒而兴师',
    force: '楚军八万战没',
    result: '秦斩甲士八万，取汉中；楚再攻蓝田又败',
    weight: '楚失汉中，秦本土与巴蜀连成一片',
    steps: [
      '楚怒张仪之诈，倾国北上',
      '秦师东出，会楚军于丹阳',
      '斩甲士八万，取汉中；楚再攻蓝田又败',
    ],
    arrows: [
      { state: 'chu', label: '楚', path: [[112.19, 30.42], [112.0, 32.0], [111.2, 33.0]] },
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [109.8, 33.6], [110.9, 33.1]] },
    ],
  },
  {
    id: 'yique', year: -293, name: '伊阙之战', at: [112.45, 34.5],
    sides: '白起初露锋芒，各个击破韩魏联军',
    force: '韩魏联军二十四万 · 秦军不及其半',
    result: '斩首二十四万，虏公孙喜，拔五城',
    weight: '韩魏精锐尽丧，中原门户洞开',
    steps: [
      '白起自函谷东出，趋伊阙',
      '韩军当其前，魏军列于侧，互相观望不肯先',
      '白起以奇兵先袭魏军，魏溃而韩自乱',
      '斩首二十四万，韩魏精锐尽丧，中原门户洞开',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [110.6, 34.6], [112.2, 34.52]] },
      { state: 'han', label: '韩', path: [[113.72, 34.4], [113.0, 34.5], [112.6, 34.5]] },
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [113.4, 34.8], [112.7, 34.6]] },
    ],
  },
  {
    id: 'jixi', year: -284, name: '济西之战·五国破齐', at: [116.3, 36.6],
    sides: '乐毅将燕秦赵魏韩之师伐齐',
    force: '五国联军 · 齐触子二十万',
    result: '齐军溃于济西，燕军入临淄，下七十余城',
    weight: '东帝一夕而亡，齐自此不复能与秦争',
    steps: [
      '乐毅将燕师南下',
      '赵师东出，会于济西',
      '齐触子二十万列阵于济水之西',
      '齐军一战而溃，燕师长驱入临淄，下七十余城',
    ],
    arrows: [
      { state: 'yan', label: '燕', path: [[116.4, 39.9], [116.0, 38.4], [116.2, 37.2], [116.6, 36.5]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [115.4, 36.6], [116.2, 36.6]] },
      { state: 'qi', label: '齐', path: [[118.31, 36.87], [117.4, 36.7], [116.6, 36.6]] },
      { state: 'yan', label: '燕', path: [[116.4, 36.6], [117.4, 36.8], [118.3, 36.87]] },
    ],
  },
  {
    id: 'jimo', year: -279, name: '即墨之战', at: [120.2, 36.4],
    sides: '田单以反间去乐毅，火牛夜出',
    force: '齐残卒数千 · 燕骑劫之军',
    result: '燕军大溃，七十余城尽复',
    weight: '齐虽复国而元气已尽，山东再无抗秦之柱',
    steps: [
      '田单以反间去乐毅，纵火牛夜出即墨',
      '莒城之师并起，两路夹攻',
      '燕军大溃，七十余城尽复，然齐元气自此不振',
    ],
    arrows: [
      { state: 'qi', label: '齐', path: [[120.3, 36.5], [119.2, 36.7], [118.31, 36.87]] },
      { state: 'qi', label: '齐', path: [[118.8, 35.7], [118.4, 36.4], [118.31, 36.8]] },
    ],
  },
  {
    id: 'yanying', year: -278, name: '鄢郢之战', at: [112.2, 30.8],
    sides: '白起沿汉水而下，引夷水灌鄢城',
    force: '秦数万孤军深入 · 楚举国之众',
    result: '拔郢烧夷陵，楚东徙于陈，秦置南郡',
    weight: '楚失江汉根本，屈原沉江于此年',
    steps: [
      '白起自汉中沿汉水而下，弃粮道而深入',
      '楚人东徙于陈，江汉之众星散',
      '引夷水灌鄢城，拔郢烧夷陵，秦置南郡',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[107.0, 33.1], [109.4, 32.7], [111.4, 32.3], [112.1, 31.4], [112.2, 30.6]] },
      { state: 'chu', label: '楚', path: [[112.19, 30.42], [113.4, 31.6], [114.88, 33.73]] },
    ],
  },
  {
    id: 'huayang', year: -273, name: '华阳之战', at: [113.6, 34.6],
    sides: '白起八日行军八百里，突袭赵魏',
    force: '赵魏联军十五万',
    result: '斩首十三万，沉赵卒二万于河',
    weight: '魏献南阳求和，三晋再无野战之力',
    steps: [
      '白起八日行军八百里，突至华阳',
      '赵魏之师仓促应战',
      '斩首十三万，沉赵卒二万于河，魏献南阳求和',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[110.9, 34.62], [112.2, 34.5], [113.4, 34.6]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [114.0, 35.6], [113.7, 34.8]] },
    ],
  },
  {
    id: 'eyu', year: -269, name: '阏与之战', at: [113.6, 37.05],
    sides: '赵奢「狭路相逢勇者胜」',
    force: '秦胡阳部 · 赵奢轻兵疾进',
    result: '赵军先据北山，大破秦军',
    weight: '战国唯一一次野战大败秦军，赵成为最后的对手',
    steps: [
      '秦胡阳部越上党，围阏与',
      '赵奢卷甲疾进，先据北山',
      '狭路相逢勇者胜，秦军大败而还',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[111.2, 35.2], [112.4, 36.2], [113.4, 36.9]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [114.0, 36.9], [113.7, 37.0]] },
    ],
  },
  {
    id: 'changping', year: -260, name: '长平之战', at: [112.9, 35.98],
    sides: '上党献赵，秦赵倾国相持三年',
    force: '秦六十万 · 赵四十五万',
    result: '赵括代廉颇出击，被断粮道四十六日，降卒四十万尽坑',
    weight: '山东六国最后一支野战军团覆灭，天下无人能挡秦',
    steps: [
      '秦师东出，取野王而绝上党归韩之道',
      '赵以廉颇筑垒于长平，坚壁三年不出',
      '赵括代将出击，秦奇兵二万五千绝其后',
      '断粮四十六日，赵括战死，降卒四十万尽坑',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [110.4, 34.9], [111.6, 35.4], [112.6, 35.9]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [113.8, 36.3], [113.1, 36.05]] },
      { state: 'qin', label: '秦奇兵', path: [[111.9, 35.6], [112.4, 36.6], [113.2, 36.3], [113.1, 35.7]] },
    ],
  },
  {
    id: 'handan', year: -257, name: '邯郸之战', at: [114.49, 36.6],
    sides: '秦围邯郸逾年，信陵君窃符救赵',
    force: '秦军数十万 · 赵魏楚联军',
    result: '魏无忌、春申君内外夹击，秦军大败，郑安平降赵',
    weight: '秦东进受挫二十年，合纵最后一次奏效',
    steps: [
      '秦围邯郸逾年，城中析骸而炊',
      '信陵君窃符夺晋鄙军，北上救赵',
      '春申君之师亦自陈北来',
      '内外夹击，秦军大败，郑安平以二万人降赵',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[112.9, 35.9], [113.6, 36.3], [114.2, 36.55]] },
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [114.5, 35.6], [114.6, 36.45]] },
      { state: 'chu', label: '楚', path: [[114.88, 33.73], [115.0, 35.0], [114.8, 36.4]] },
    ],
  },
  {
    id: 'heiwai', year: -247, name: '河外之战', at: [112.6, 34.6],
    sides: '信陵君合五国之师败蒙骜',
    force: '五国之师 · 秦蒙骜军',
    result: '追秦军至函谷关，秦人闭关不出',
    weight: '六国最后一次得势，此后魏王疑忌信陵君，合纵遂绝',
    steps: [
      '信陵君合五国之师西向',
      '蒙骜之军退保函谷',
      '追至关下，秦人闭关不出——六国最后一次得势',
    ],
    arrows: [
      { state: 'wei', label: '五国', path: [[114.35, 34.79], [113.2, 34.7], [111.6, 34.65], [111.0, 34.62]] },
      { state: 'qin', label: '秦', path: [[112.4, 34.5], [111.6, 34.6], [110.9, 34.62]] },
    ],
  },
  {
    id: 'zui', year: -241, name: '蕞之战·最后合纵', at: [109.4, 34.5],
    sides: '春申君为纵约长，五国攻秦至蕞',
    force: '楚赵魏韩卫之师',
    result: '秦出兵还击，五国之师皆罢',
    weight: '合纵之局自此永绝，楚畏秦而迁都寿春',
    steps: [
      '春申君为纵约长，五国之师入关中',
      '秦师出咸阳，迎击于蕞',
      '五国皆罢，合纵之局自此永绝',
    ],
    arrows: [
      { state: 'chu', label: '五国', path: [[114.88, 33.73], [112.6, 34.4], [110.8, 34.6], [109.6, 34.5]] },
      { state: 'qin', label: '秦', path: [[108.72, 34.35], [109.2, 34.45], [109.4, 34.5]] },
    ],
  },
  {
    id: 'daliang', year: -225, name: '水灌大梁', at: [114.35, 34.79],
    sides: '王贲决鸿沟之水灌大梁',
    force: '秦军十万',
    result: '三月城坏，魏王假降，魏亡',
    weight: '中原腹心入秦，六国仅余楚齐燕代',
    steps: [
      '王贲引河沟之水灌大梁',
      '三月城坏，魏王假出降，魏亡',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[112.2, 34.5], [113.3, 34.7], [114.1, 34.79]] },
    ],
  },
  {
    id: 'chuwang', year: -224, name: '王翦灭楚', at: [116.0, 32.6],
    sides: '王翦请六十万，坚壁一年而后动',
    force: '秦六十万 · 楚项燕之众',
    result: '楚军东徙，秦乘其移而击，项燕死，次年虏楚王负刍',
    weight: '南方最后的巨国倾覆，秦有江淮',
    steps: [
      '王翦以六十万入楚境，坚壁一年不战',
      '项燕之军东移',
      '秦乘其移而击，追至蕲南',
      '项燕死，次年虏楚王负刍，楚亡',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[112.4, 34.5], [114.2, 33.6], [115.6, 33.0], [116.6, 32.2]] },
      { state: 'chu', label: '楚', path: [[116.78, 32.0], [116.0, 32.8], [115.2, 33.2]] },
      { state: 'qin', label: '秦', path: [[116.6, 32.2], [118.4, 32.0], [120.2, 31.5]] },
    ],
  },
  {
    id: 'miehan', year: -230, name: '灭韩·内史腾', at: [113.72, 34.4],
    sides: '内史腾南下渡河',
    force: '秦军 · 韩已削弱至一郡之地',
    result: '虏韩王安，以其地置颍川郡',
    weight: '六国之亡，自韩始',
    steps: [
      '内史腾自南阳渡河，直取新郑',
      '虏韩王安，以其地置颍川郡——六国之亡自韩始',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[112.2, 34.5], [113.0, 34.45], [113.6, 34.4]] },
    ],
  },
  {
    id: 'miezhao', year: -228, name: '灭赵·王翦破邯郸', at: [114.49, 36.6],
    sides: '秦行反间，赵王杀李牧',
    force: '秦军数十万 · 赵大旱且饥',
    result: '三月拔邯郸，虏赵王迁，公子嘉走代自立',
    weight: '与秦相抗最久者亡',
    steps: [
      '王翦自上党东出',
      '另一军自太原北路夹击，赵王中反间而杀李牧',
      '三月拔邯郸，虏赵王迁，公子嘉走代自立',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[112.6, 35.9], [113.6, 36.3], [114.2, 36.6]] },
      { state: 'qin', label: '秦', path: [[113.0, 37.8], [113.9, 38.0], [114.4, 37.0]] },
    ],
  },
  {
    id: 'mieyan', year: -226, name: '灭燕·易水之后', at: [116.4, 39.9],
    sides: '荆轲刺秦不中，秦大举伐燕',
    force: '王翦、辛胜之军',
    result: '破燕代联军于易水西，拔蓟城，燕王喜走辽东',
    weight: '北方屏障尽失，四年后辽东亦下',
    steps: [
      '王翦、辛胜北上，破燕代联军于易水之西',
      '拔蓟城，燕王喜走辽东，四年后亦亡',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[114.49, 36.6], [115.4, 38.0], [115.9, 39.2], [116.3, 39.8]] },
    ],
  },
  {
    id: 'mieqi', year: -221, name: '灭齐·不战而下', at: [118.31, 36.87],
    sides: '王贲自燕地南下，齐相后胜受秦金',
    force: '秦军 · 齐四十年不修攻战之备',
    result: '齐王建不战而降，迁于共，饿死松柏之间',
    weight: '海内为郡县，法令由一统',
    steps: [
      '王贲自燕地南下，齐人四十年不修攻战之备',
      '齐王建不战而降，海内为郡县',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[116.4, 39.9], [117.2, 38.4], [117.8, 37.4], [118.3, 36.9]] },
    ],
  },
];

// 非战之大事
const OTHER_EVENTS = [
  { year: -473, kind: '并', title: '越灭吴', text: '勾践二十年生聚教训，卒灭吴而北会诸侯于徐州，号称霸王。' },
  { year: -453, kind: '并', title: '三家分晋', text: '赵魏韩共灭智氏而分其地，晋国实亡。司马光以此年为《资治通鉴》之外的另一战国之始。' },
  { year: -445, kind: '变', title: '李悝相魏', text: '尽地力之教、平籴之法，著《法经》六篇。变法自此为战国之通例。' },
  { year: -409, kind: '变', title: '吴起为西河守', text: '创魏武卒之制：衣三属之甲、操十二石之弩，中试者复其户。天下强兵之始。' },
  { year: -403, kind: '纵', title: '周威烈王命三晋为诸侯', text: '名分既坏，君臣之礼遂亡。《资治通鉴》以此年开卷。' },
  { year: -386, kind: '并', title: '田氏代齐', text: '田和列为诸侯，姜姓之齐传二十余世而绝。' },
  { year: -382, kind: '变', title: '吴起变法于楚', text: '废公族疏远者，明法审令。悼王一死，宗室尽射吴起于王尸之上。' },
  { year: -361, kind: '都', title: '魏徙都大梁', text: '魏惠王自安邑东迁，图霸中原，亦自此与秦隔河而不复能制。' },
  { year: -356, kind: '变', title: '商鞅变法', text: '徙木立信、开阡陌、行县制、废世卿。秦自此耕战一体，赏罚必信。' },
  { year: -344, kind: '纵', title: '逢泽之会', text: '魏惠王率十二诸侯朝天子，僭称夏王，霸业之顶亦其转折。' },
  { year: -334, kind: '纵', title: '徐州相王', text: '齐魏会于徐州而互尊为王，周天子之号自此不足贵。' },
  { year: -333, kind: '纵', title: '苏秦约纵', text: '佩六国相印，合纵以摈秦，秦兵十五年不敢窥函谷关。' },
  { year: -328, kind: '纵', title: '张仪相秦', text: '连横之术起：事一强以攻众弱，散六国之从而使之西面事秦。' },
  { year: -323, kind: '纵', title: '五国相王', text: '魏韩赵燕中山互王，中山以千乘之国而王，赵怒之，伏灭国之因。' },
  { year: -307, kind: '变', title: '赵武灵王胡服骑射', text: '去长裾而习骑射，北破林胡楼烦，辟地千里，置云中雁门代郡。中原骑兵之始。' },
  { year: -288, kind: '纵', title: '秦称西帝·齐称东帝', text: '两强并帝，苏代说齐去帝号以孤秦。两月而罢，然天下已知只余两极。' },
  { year: -286, kind: '并', title: '齐灭宋', text: '取膏腴之地而结怨于天下，五国伐齐之祸自此始。' },
  { year: -283, kind: '纵', title: '完璧归赵', text: '蔺相如奉璧入秦，秦不予城，璧复归赵。次年渑池之会，赵始与秦分庭。' },
  { year: -268, kind: '纵', title: '范雎远交近攻', text: '得寸则王之寸，得尺亦王之尺。秦之战略自此由掠地转为夺国。' },
  { year: -256, kind: '并', title: '秦灭西周·楚灭鲁', text: '周赧王卒，九鼎入秦。孔子之国亦亡于是年。' },
  { year: -249, kind: '并', title: '秦灭东周', text: '吕不韦攻东周君，周祀绝。秦置三川郡，兵锋直抵中原。' },
  { year: -246, kind: '变', title: '郑国渠成', text: '韩以疲秦之计使郑国凿渠，渠成而关中为沃野，秦反以富强。' },
  { year: -238, kind: '变', title: '秦王政亲政', text: '平嫪毐之乱，免吕不韦。次年下逐客令又收之，李斯《谏逐客书》遂行。' },
  { year: -237, kind: '变', title: '尉缭、李斯定灭国之策', text: '以金三十万斤离间诸侯豪臣，谋臣先行而后甲兵。' },
  { year: -222, kind: '并', title: '灭代·定江南', text: '王贲虏代王嘉，王翦降越君，置会稽郡。' },
  { year: -221, kind: '并', title: '海内为郡县', text: '初并天下，号皇帝，分三十六郡，一法度衡石丈尺，车同轨，书同文。' },
];

export const EVENTS = [
  ...BATTLES.map((b) => ({ year: b.year, kind: '战', title: b.name, text: b.result, battle: b.id })),
  ...OTHER_EVENTS,
].sort((a, b) => a.year - b.year || (a.kind === '战' ? -1 : 1));

// 六幕：把二百五十四年切成有主题的段落，读者才知道该看什么
export const ACTS = [
  { no: '一', from: -475, to: -404, title: '晋亡而战国立',
    thesis: '春秋的霸主秩序散了。三家分晋、田氏代齐，卿大夫取代诸侯成为主角；越灭吴而北会诸侯，中原一时无主。' },
  { no: '二', from: -403, to: -342, title: '魏之霸',
    thesis: '李悝尽地力、吴起练武卒，魏先行一步而独强六十年。但大梁居四战之地，经不起两线——桂陵、马陵之后，霸业一战而尽。' },
  { no: '三', from: -341, to: -297, title: '三极与纵横',
    thesis: '秦并巴蜀、齐几灭燕、楚地最广，天下成三极之势。苏秦张仪往来其间：合纵者说以存亡，连横者诱以土地，各国比的已不是德，是算。' },
  { no: '四', from: -296, to: -261, title: '白起的时代',
    thesis: '伊阙二十四万、鄢郢烧夷陵、华阳十三万。秦以斩首计功，山东诸国的野战兵力被逐次抹去；五国破齐，又去其一极。' },
  { no: '五', from: -260, to: -242, title: '长平之后',
    thesis: '四十万降卒尽坑，六国再无成建制的野战军团。邯郸之战与信陵君两度合纵稍挫秦锋，然已是回光。' },
  { no: '六', from: -241, to: -221, title: '十年而并天下',
    thesis: '尉缭以金三十万斤离间豪臣，李斯定先弱后强之序。自韩始，十年之内六王毕、四海一。' },
];

export function actAt(year) {
  return ACTS.find((a) => year >= a.from && year <= a.to) || ACTS[ACTS.length - 1];
}

export function ownerAt(year) {

  const map = { ...BASE };
  for (const c of CHANGES) {
    if (c.year > year) break;
    Object.assign(map, c.set);
  }
  return map;
}

export function capitalsAt(year) {
  return CAPITALS.filter((c) => year >= c.from && year < c.to);
}

export function formatYear(y) {
  return y < 0 ? `前${-y}` : `${y}`;
}
