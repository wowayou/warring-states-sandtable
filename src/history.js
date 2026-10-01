// 编年：列国、疆域沿革、大事、战役。
// 疆域取主流复原图之概貌，以事件为界作阶段切换，非逐年精确。
// 史料歧出处取通行之说，并在正文里注明「一说」；年代不能确指者标 approx，界面上显示为「约」。

export const START = -475;
export const END = -221;

export const STATES = {
  qin: { name: '秦', full: '秦', color: '#2d5e82', ink: '#8fc2e4', order: 1 },
  chu: { name: '楚', full: '楚', color: '#c1533a', ink: '#f0a086', order: 2 },
  qi: { name: '齐', full: '齐', color: '#2f93a8', ink: '#7fd0e2', order: 3 },
  zhao: { name: '赵', full: '赵', color: '#9a5fb0', ink: '#cb9ada', order: 4 },
  wei: { name: '魏', full: '魏', color: '#e0ac3c', ink: '#f4d47c', order: 5 },
  han: { name: '韩', full: '韩', color: '#8fb04e', ink: '#c6dc8c', order: 6 },
  yan: { name: '燕', full: '燕', color: '#5c72c6', ink: '#a3b2ea', order: 7 },
  jin: { name: '晋', full: '晋', color: '#b07a45', ink: '#dcac7d', order: 8 },
  yue: { name: '越', full: '越', color: '#2f9c81', ink: '#78d0b6', order: 9 },
  song: { name: '宋', full: '宋', color: '#b8618f', ink: '#e29cc2', order: 10 },
  zhou: { name: '周', full: '周', color: '#c9a227', ink: '#efd06a', order: 11 },
  lu: { name: '鲁', full: '鲁', color: '#7a9dbd', ink: '#b2cee6', order: 12 },
  zhongshan: { name: '中山', full: '中山', color: '#a06840', ink: '#cf9a70', order: 13 },
  zheng: { name: '郑', full: '郑', color: '#8d7ea8', ink: '#bdb0d6', order: 14 },
  wey: { name: '卫', full: '卫', color: '#8a8f5c', ink: '#bcc190', order: 15 },
  wuguo: { name: '吴', full: '吴', color: '#3f7f8f', ink: '#7fb8c6', order: 16 },
  ba: { name: '巴', full: '巴', color: '#7a6a55', ink: '#a99b80', order: 17 },
  shu: { name: '蜀', full: '蜀', color: '#6b7b58', ink: '#9dae89', order: 18 },
  // 诸戎狄百越，不列入七雄计
  yiqu: { name: '义渠', tribe: true, color: '#4c4d43', order: 30 },
  linhu: { name: '林胡楼烦', tribe: true, color: '#4c4d43', order: 31 },
  // 河南地在战国早期并无「匈奴」之名，故统称诸胡
  xiongnu: { name: '诸胡', tribe: true, color: '#4c4d43', order: 32 },
  donghu: { name: '东胡', tribe: true, color: '#4c4d43', order: 33 },
  yuezhi: { name: '月氏', tribe: true, color: '#4c4d43', order: 34 },
  qiang: { name: '羌', tribe: true, color: '#4c4d43', order: 35 },
  baiyue: { name: '百越', tribe: true, color: '#46514a', order: 36 },
  dian: { name: '滇', tribe: true, color: '#46514a', order: 37 },
  yelang: { name: '夜郎', tribe: true, color: '#46514a', order: 38 },
  chaoxian: { name: '朝鲜', tribe: true, color: '#4a4e54', order: 39 },
};

export const SEVEN = ['qin', 'chu', 'qi', 'zhao', 'wei', 'han', 'yan'];

// 前475 的全盘归属。晋阳、代等赵氏之地此时仍记在晋名下：三家分晋之前，赵魏韩是晋之卿，不是国
export const BASE = {
  neishi: 'qin', longxi: 'qin', beidi: 'qin', shangyu: 'qin', hexi: 'qin',
  yiqu: 'yiqu', shangjun: 'yiqu',
  hedong: 'jin', taiyuan: 'jin', shangdang: 'jin', yanmen: 'jin', handan: 'jin',
  julu: 'jin', henei: 'jin', daliang: 'jin', dongjun: 'jin', sanchuan: 'jin', yingchuan: 'jin',
  dai: 'jin', zhongshan: 'zhongshan', luoyi: 'zhou', xinzheng: 'zheng', weidi: 'wey',
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
  { year: -453, note: '三家分晋，晋室名存实亡', set: { taiyuan: 'zhao', yanmen: 'zhao', dai: 'zhao', handan: 'zhao', julu: 'zhao', hedong: 'wei', henei: 'wei', daliang: 'wei', dongjun: 'wei', sanchuan: 'han', yingchuan: 'han', shangdang: 'han' } },
  { year: -409, approx: true, note: '魏北略上郡之地', set: { shangjun: 'wei' } },
  { year: -408, note: '吴起尽取秦河西', set: { hexi: 'wei' } },
  { year: -406, note: '魏灭中山', set: { zhongshan: 'wei' } },
  { year: -380, approx: true, note: '中山复国', set: { zhongshan: 'zhongshan' } },
  { year: -379, approx: true, note: '越南徙于吴，齐取琅琊', set: { langya: 'qi' } },
  { year: -375, note: '韩灭郑，徙都新郑', set: { xinzheng: 'han' } },
  { year: -330, note: '雕阴战后魏献河西', set: { hexi: 'qin' } },
  { year: -328, note: '魏献上郡于秦', set: { shangjun: 'qin' } },
  { year: -316, note: '秦并巴蜀', set: { ba: 'qin', shu: 'qin' } },
  { year: -312, note: '秦取楚汉中', set: { hanzhong: 'qin' } },
  { year: -307, note: '秦拔韩宜阳', set: { sanchuan: 'qin' } },
  { year: -306, note: '楚灭越，有吴越故地', set: { kuaiji: 'chu', wu: 'chu' } },
  { year: -301, note: '垂沙之后，韩取宛', set: { nanyang: 'han' } },
  { year: -300, approx: true, note: '燕将秦开却东胡，赵武灵王开云中九原', set: { shanggu: 'yan', yuyang: 'yan', liaoxi: 'yan', liaodong: 'yan', yunzhong: 'zhao', linhu: 'zhao' } },
  { year: -296, note: '赵灭中山', set: { zhongshan: 'zhao' } },
  { year: -291, note: '秦取韩宛', set: { nanyang: 'qin' } },
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
  { year: -254, note: '魏灭陶，卫为魏附庸', set: { weidi: 'wei', tao: 'wei' } },
  { year: -249, note: '秦灭东周，置三川郡', set: { luoyi: 'qin' } },
  { year: -248, note: '蒙骜定太原', set: { taiyuan: 'qin' } },
  { year: -242, note: '秦置东郡', set: { dongjun: 'qin' } },
  { year: -241, note: '卫徙野王，其地入秦', set: { weidi: 'qin' } },
  { year: -230, note: '秦灭韩', set: { xinzheng: 'qin', yingchuan: 'qin' } },
  { year: -228, note: '秦破邯郸，公子嘉走代', set: { handan: 'qin', julu: 'qin', zhongshan: 'qin' } },
  { year: -226, note: '秦拔蓟，燕王走辽东', set: { ji: 'qin', yixia: 'qin', shanggu: 'qin', yuyang: 'qin', liaoxi: 'qin' } },
  { year: -225, note: '秦灭魏', set: { daliang: 'qin', songdu: 'qin', tao: 'qin' } },
  { year: -224, note: '王翦破楚军于蕲南', set: { chen: 'qin', runan: 'qin', sishui: 'qin', pengcheng: 'qin', tengxue: 'qin' } },
  { year: -223, note: '秦灭楚', set: { shouchun: 'qin', lu: 'qin' } },
  { year: -222, note: '灭代、下辽东、定江南', set: { changsha: 'qin', wuling: 'qin', yuzhang: 'qin', wu: 'qin', kuaiji: 'qin', dai: 'qin', yanmen: 'qin', yunzhong: 'qin', linhu: 'qin', liaodong: 'qin' } },
  { year: -221, note: '秦灭齐，天下一统', set: { linzi: 'qin', jiaodong: 'qin', jixi: 'qin', langya: 'qin' } },
];

// 都城：以迁都之年为界
export const CAPITALS = [
  { state: 'qin', name: '雍', lon: 107.4, lat: 34.52, from: -475, to: -383 },
  { state: 'qin', name: '栎阳', lon: 109.24, lat: 34.66, from: -383, to: -350 },
  { state: 'qin', name: '咸阳', lon: 108.72, lat: 34.35, from: -350, to: -221 },
  { state: 'wei', name: '安邑', lon: 111.22, lat: 35.14, from: -453, to: -361 },
  { state: 'wei', name: '大梁', lon: 114.35, lat: 34.79, from: -361, to: -225 },
  { state: 'han', name: '平阳', lon: 111.52, lat: 36.08, from: -453, to: -424 },
  { state: 'han', name: '宜阳', lon: 112.15, lat: 34.52, from: -424, to: -408 },
  { state: 'han', name: '阳翟', lon: 113.45, lat: 34.16, from: -408, to: -375 },
  { state: 'han', name: '新郑', lon: 113.72, lat: 34.4, from: -375, to: -230 },
  { state: 'zhao', name: '晋阳', lon: 112.55, lat: 37.87, from: -453, to: -423 },
  { state: 'zhao', name: '中牟', lon: 114.25, lat: 35.85, from: -423, to: -386 },
  { state: 'zhao', name: '邯郸', lon: 114.49, lat: 36.6, from: -386, to: -228 },
  { state: 'zhao', name: '代', lon: 114.57, lat: 39.84, from: -228, to: -222 },
  { state: 'chu', name: '郢', lon: 112.19, lat: 30.42, from: -475, to: -278 },
  { state: 'chu', name: '陈', lon: 114.88, lat: 33.73, from: -278, to: -253 },
  { state: 'chu', name: '钜阳', lon: 115.75, lat: 33.2, from: -253, to: -241 },
  { state: 'chu', name: '寿春', lon: 116.78, lat: 32.0, from: -241, to: -223 },
  { state: 'qi', name: '临淄', lon: 118.31, lat: 36.87, from: -475, to: -221 },
  { state: 'yan', name: '蓟', lon: 116.4, lat: 39.9, from: -475, to: -226 },
  { state: 'yan', name: '襄平', lon: 123.17, lat: 41.27, from: -226, to: -222 },
  { state: 'zhou', name: '洛邑', lon: 112.45, lat: 34.68, from: -475, to: -256 },
  { state: 'zhou', name: '巩', lon: 112.98, lat: 34.75, from: -256, to: -249 },
  { state: 'jin', name: '绛', lon: 111.4, lat: 35.62, from: -475, to: -453 },
  { state: 'song', name: '商丘', lon: 115.65, lat: 34.41, from: -475, to: -286 },
  { state: 'lu', name: '曲阜', lon: 116.99, lat: 35.6, from: -475, to: -256 },
  { state: 'yue', name: '会稽', lon: 120.58, lat: 30.0, from: -475, to: -468 },
  { state: 'yue', name: '琅琊', lon: 119.2, lat: 35.6, from: -468, to: -379 },
  { state: 'yue', name: '吴', lon: 120.6, lat: 31.3, from: -379, to: -306 },
  { state: 'zhongshan', name: '中人', lon: 114.9, lat: 38.8, from: -475, to: -414 },
  { state: 'zhongshan', name: '顾', lon: 114.99, lat: 38.52, from: -414, to: -406 },
  { state: 'zhongshan', name: '灵寿', lon: 114.2, lat: 38.32, from: -380, to: -296 },
  { state: 'zheng', name: '新郑', lon: 113.72, lat: 34.4, from: -475, to: -375 },
  { state: 'wey', name: '帝丘', lon: 115.0, lat: 35.7, from: -475, to: -241 },
  { state: 'wey', name: '野王', lon: 112.93, lat: 35.09, from: -241, to: -221 },
  { state: 'shu', name: '成都', lon: 104.07, lat: 30.66, from: -475, to: -316 },
  { state: 'ba', name: '江州', lon: 106.55, lat: 29.56, from: -475, to: -316 },
  { state: 'wuguo', name: '姑苏', lon: 120.6, lat: 31.3, from: -475, to: -473 },
];

// 战役：行军路线用于沙盘推演。steps 比 arrows 多一条，末一条是结局
// 兵力只写史籍所载；史无明文的数目不写
export const BATTLES = [
  {
    id: 'jinyang', year: -453, name: '晋阳之战', at: [112.55, 37.87],
    sides: '智伯挟韩、魏之师攻赵，赵襄子退保晋阳',
    force: '智、韩、魏三家之兵 · 赵氏据晋阳坚守',
    result: '张孟谈潜出说韩魏，三家反攻智氏，智伯身死族灭',
    weight: '智氏之地三分，晋公室名存实亡；赵魏韩自此各自成国',
    steps: [
      '智伯以韩、魏之师北上，围赵襄子于晋阳',
      '韩康子之师自平阳北来会围',
      '魏桓子之师自安邑北来；智伯引水灌城，城不浸者三版',
      '张孟谈夜出说韩魏，反决水灌智军，智伯身死族灭',
    ],
    arrows: [
      { state: 'jin', label: '智', path: [[111.4, 35.65], [111.85, 36.6], [112.4, 37.6]] },
      { state: 'han', label: '韩', path: [[111.55, 36.1], [112.25, 36.95], [112.7, 37.7]] },
      { state: 'wei', label: '魏', path: [[111.2, 35.15], [111.6, 36.4], [112.25, 37.75]] },
    ],
  },
  {
    id: 'yinjin', year: -389, name: '阴晋之战', at: [110.2, 34.6],
    sides: '秦师东出争河西，吴起以魏武卒迎击于阴晋',
    force: '魏：吴起之师（《吴子》称五万人） · 秦：号五十万',
    result: '魏大破秦军，河西之守由是益固',
    weight: '魏武卒之名震动天下，魏之霸业极于此时',
    steps: [
      '秦师东出，压至阴晋',
      '吴起以魏武卒迎击于河西',
      '秦师大溃，河西之地仍归于魏',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [109.6, 34.5], [110.1, 34.6]] },
      { state: 'wei', label: '魏', path: [[111.2, 35.2], [110.7, 34.9], [110.3, 34.65]] },
    ],
  },
  {
    id: 'guiling', year: -353, name: '桂陵之战', at: [115.5, 35.4],
    sides: '魏围赵邯郸，齐救赵：孙膑不救邯郸而直趋大梁',
    force: '齐：田忌将、孙膑为师 · 魏：庞涓之军（银雀山汉简《孙膑兵法》各称带甲八万）',
    result: '魏军回救，被截击于桂陵，庞涓被擒',
    weight: '「围魏救赵」出典。魏虽拔邯郸，两年后仍归还于赵，东向之势由此受挫',
    steps: [
      '魏军北上围邯郸，赵求救于齐',
      '孙膑不救赵而直趋大梁，设伏于桂陵',
      '魏军回师自救，遭截击而败，庞涓被擒',
    ],
    arrows: [
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [114.4, 35.6], [114.5, 36.5]] },
      { state: 'qi', label: '齐', path: [[118.31, 36.87], [116.8, 36.2], [115.6, 35.5]] },
    ],
  },
  {
    id: 'maling', year: -341, name: '马陵之战', at: [115.6, 36.0],
    sides: '魏伐韩，齐再救：仍直走大梁，诱魏军回追',
    force: '齐：田忌、田婴将，孙膑为师 · 魏：太子申为上将军，庞涓将',
    result: '魏军大败，庞涓自刭，太子申被虏',
    weight: '魏失霸主之位，天下由一强变为群雄并峙',
    steps: [
      '魏伐韩，韩五战不胜而告急于齐',
      '齐师再走大梁，庞涓去韩而还，太子申率师追之',
      '孙膑日减其灶，诱敌至马陵设伏',
      '万弩俱发，魏军大乱，庞涓自刭，太子申被虏',
    ],
    arrows: [
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [113.9, 34.5], [113.72, 34.4]] },
      { state: 'wei', label: '魏追', path: [[113.8, 34.5], [114.8, 35.3], [115.5, 35.95]] },
      { state: 'qi', label: '齐', path: [[118.31, 36.87], [116.9, 36.4], [115.7, 36.05]] },
    ],
  },
  {
    id: 'diaoyin', year: -330, name: '雕阴之战', at: [109.4, 36.25],
    sides: '秦大良造公孙衍攻魏河西',
    force: '秦：公孙衍之军 · 魏：龙贾之军',
    result: '斩首四万五千，虏魏将龙贾，魏献河西之地',
    weight: '河西尽入于秦，秦魏自此以河为界，秦东出之门洞开',
    steps: [
      '公孙衍北上，击魏军于雕阴',
      '斩首四万五千，虏龙贾，魏纳河西之地',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.8, 34.5], [109.15, 35.4], [109.35, 36.15]] },
    ],
  },
  {
    id: 'hanguu318', year: -318, name: '五国攻秦', at: [110.9, 34.62],
    sides: '公孙衍倡合纵，魏、赵、韩、燕、楚共攻秦，至函谷',
    force: '五国之师（楚怀王为纵长） · 秦据关而守',
    result: '五国之师不能进而还；次年秦败韩赵于修鱼',
    weight: '首次合纵攻秦无功，连横之势渐成',
    steps: [
      '魏师西出，压至函谷关',
      '韩师自新郑西上会师',
      '赵师南下会师；楚燕名列纵约，实际交兵者唯三晋',
      '秦据关不出，五国之师不能进而还',
    ],
    arrows: [
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [112.6, 34.7], [111.2, 34.62]] },
      { state: 'han', label: '韩', path: [[113.72, 34.4], [112.4, 34.5], [111.3, 34.6]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [113.2, 35.4], [111.4, 34.8]] },
    ],
  },
  {
    id: 'bashu', year: -316, name: '秦并巴蜀', at: [104.6, 30.9],
    sides: '张仪请伐韩，司马错请伐蜀：「得蜀则得楚，楚亡则天下并矣」',
    force: '秦：司马错、张仪之军 · 自石牛道入蜀',
    result: '灭蜀，继取苴与巴；其后置巴郡，封公子通为蜀侯',
    weight: '秦得天府之粮与顺江伐楚之上游',
    steps: [
      '司马错、张仪自石牛道入蜀，十月而蜀平',
      '回师东下，取苴与巴',
      '天府之粮与顺江伐楚之上游，皆入于秦',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [106.9, 33.3], [105.4, 32.0], [104.3, 30.9]] },
      { state: 'qin', label: '秦', path: [[105.4, 32.0], [106.2, 30.6], [106.6, 30.1]] },
    ],
  },
  {
    id: 'xiuyu', year: -317, name: '修鱼之战', at: [113.75, 35.0],
    sides: '五国退兵之后，秦庶长樗里疾出关追击',
    force: '秦：樗里疾之军 · 韩、赵之师',
    result: '斩首八万二千，虏韩将申差，败赵公子渴、韩太子奂',
    weight: '合纵之说为天下所疑，张仪连横大行',
    steps: ['樗里疾出函谷东进', '韩师北上迎战于修鱼', '赵师南下会韩', '斩首八万二千，虏申差，诸侯震恐'],
    arrows: [
      { state: 'qin', label: '秦', path: [[110.9, 34.62], [112.3, 34.8], [113.5, 35.0]] },
      { state: 'han', label: '韩', path: [[113.72, 34.4], [113.75, 34.7], [113.75, 34.92]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [114.1, 35.7], [113.85, 35.1]] },
    ],
  },
  {
    id: 'danyang', year: -312, name: '丹阳·蓝田之战', at: [111.0, 33.0],
    sides: '张仪诈许商於之地六百里，楚怀王怒而兴师',
    force: '楚：屈匄之军 · 秦：魏章之军',
    result: '斩甲士八万，虏楚将屈匄，取汉中；楚悉国兵再袭蓝田，又败',
    weight: '楚失汉中，秦本土与巴蜀连成一片',
    steps: [
      '楚怒张仪之诈，兴师北上',
      '秦师东出，会楚军于丹阳',
      '斩甲士八万，虏屈匄，取汉中；楚复袭蓝田又败',
    ],
    arrows: [
      { state: 'chu', label: '楚', path: [[112.19, 30.42], [112.0, 32.0], [111.2, 33.0]] },
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [109.8, 33.6], [110.9, 33.1]] },
    ],
  },
  {
    id: 'shaoliang', year: -362, name: '少梁之战', at: [110.25, 35.5],
    sides: '秦献公末年，与魏争河西之少梁',
    force: '秦献公之师 · 魏公孙痤之军',
    result: '秦大破魏军，虏魏将公孙痤，取庞',
    weight: '秦自此始有东出之力；明年孝公即位，下求贤令',
    steps: ['秦师自栎阳北上少梁', '魏公孙痤自安邑西援', '秦破魏军，虏公孙痤——秦自此始能与魏争河西'],
    arrows: [
      { state: 'qin', label: '秦', path: [[109.24, 34.66], [109.8, 35.1], [110.2, 35.45]] },
      { state: 'wei', label: '魏', path: [[111.2, 35.14], [110.7, 35.4], [110.35, 35.5]] },
    ],
  },
  {
    id: 'yiyang', year: -307, name: '甘茂拔宜阳', at: [112.15, 34.52],
    sides: '秦武王欲通三川以窥周室，甘茂与王盟于息壤',
    force: '秦：甘茂之军 · 韩：宜阳之守',
    result: '五月不拔，武王悉起兵益之，斩首六万，拔宜阳',
    weight: '韩之重镇既失，秦兵可直窥周室——同年武王举鼎绝膑而死',
    steps: ['甘茂自函谷东出，围宜阳', '韩军坚守五月，秦廷议罢兵', '「息壤在彼」——武王悉起兵益之，斩首六万，宜阳下'],
    arrows: [
      { state: 'qin', label: '秦', path: [[110.9, 34.62], [111.6, 34.6], [112.05, 34.52]] },
      { state: 'han', label: '韩', path: [[113.72, 34.4], [112.9, 34.45], [112.35, 34.5]] },
    ],
  },
  {
    id: 'chuisha', year: -301, name: '垂沙之战', at: [112.9, 32.6],
    sides: '齐、韩、魏以匡章为将伐楚（秦亦同时攻楚）',
    force: '齐韩魏之师 · 楚：唐眜之军',
    result: '夹泚水相持六月，联军夜涉而击，唐眜战死，楚军大溃',
    weight: '楚自此一蹶，庄蹻起于国中；宛、叶以北入于韩魏',
    steps: ['匡章将齐师西出，会韩魏于方城之外', '楚唐眜列阵于泚水之南，相持六月', '联军择浅处夜涉突击，唐眜死，宛叶以北尽失'],
    arrows: [
      { state: 'qi', label: '齐', path: [[118.31, 36.87], [116.2, 34.6], [113.8, 33.0], [113.1, 32.65]] },
      { state: 'chu', label: '楚', path: [[112.19, 30.42], [112.4, 31.6], [112.8, 32.45]] },
    ],
  },
  {
    id: 'limu', year: -244, approx: true, name: '李牧破匈奴', at: [112.4, 40.2],
    sides: '李牧守代、雁门数年不战，匈奴以为怯',
    force: '匈奴十余万骑 · 赵：车千三百乘、骑万三千、百金之士五万、彀者十万',
    result: '大纵畜牧诱其深入，张左右翼击之，杀匈奴十余万骑；灭襜褴，破东胡，降林胡',
    weight: '战国北边最大的一次歼灭战，其后十余年匈奴不敢近赵边。年份史无明文，此取悼襄王元年之前',
    steps: ['单于以赵为怯，大举入塞', '李牧纵民畜牧于野，以车骑正面当之', '左右两翼张而合围', '杀匈奴十余万骑，单于奔走，其后十余岁不敢近赵边'],
    arrows: [
      { state: 'xiongnu', label: '匈奴', path: [[108.6, 40.4], [110.4, 40.6], [112.0, 40.35]] },
      { state: 'zhao', label: '赵', path: [[113.9, 39.9], [113.0, 40.0], [112.55, 40.15]] },
      { state: 'zhao', label: '赵翼', path: [[112.3, 39.3], [112.2, 39.9], [112.35, 40.2]] },
    ],
  },
  {
    id: 'yian', year: -233, name: '宜安之战', at: [114.75, 37.95],
    sides: '桓齮既杀赵将扈辄，又攻赤丽、宜安；赵急召李牧自北边南下',
    force: '秦：桓齮之军 · 赵：李牧所将边兵',
    result: '李牧与战于肥下，大破秦军，封武安君',
    weight: '次年番吾再胜，赵得以多撑数年；李牧一死，赵亡在旦夕',
    steps: ['桓齮自邯郸之北深入，攻赤丽、宜安', '李牧引边兵南下，坚壁不与战', '战于肥下，大破秦军，李牧以功封武安君'],
    arrows: [
      { state: 'qin', label: '秦', path: [[113.2, 36.2], [114.0, 37.0], [114.65, 37.85]] },
      { state: 'zhao', label: '李牧', path: [[113.9, 39.9], [114.4, 38.8], [114.75, 38.05]] },
    ],
  },
  {
    id: 'yique', year: -293, name: '伊阙之战', at: [112.45, 34.5],
    sides: '白起初露锋芒，各个击破韩魏联军',
    force: '韩魏之师二十四万 · 秦军（白起自言「不能半之」）',
    result: '斩首二十四万，虏魏将公孙喜，拔五城',
    weight: '韩魏精锐尽丧，中原门户洞开',
    steps: [
      '白起自函谷东出，趋伊阙',
      '韩军当其前，魏军列于侧，互相观望不肯先',
      '白起以奇兵先袭魏军，魏溃而韩自乱',
      '斩首二十四万，虏公孙喜，韩魏精锐尽丧',
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
    force: '五国联军 · 齐：触子之军',
    result: '齐军溃于济西，燕军入临淄，下七十余城',
    weight: '东帝一夕而亡，齐自此不复能与秦争',
    steps: [
      '乐毅将燕师南下',
      '赵师东出，会于济西',
      '齐触子列阵于济水之西',
      '齐军一战而溃；诸侯兵罢归，燕师独追',
      '长驱入临淄，下七十余城，齐仅余莒与即墨',
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
    sides: '燕惠王疑乐毅而以骑劫代之，田单乘隙出击',
    force: '齐：田单之众（火牛千余、壮士五千） · 燕：骑劫之军',
    result: '燕军大溃，骑劫死，七十余城尽复',
    weight: '齐虽复国而元气已尽，山东再无抗秦之柱',
    steps: [
      '田单纵火牛夜出即墨，燕军大骇败走，骑劫被杀',
      '齐人追亡逐北至于河上，七十余城皆复；迎襄王自莒入临淄',
      '齐虽复国，元气自此不振',
    ],
    arrows: [
      { state: 'qi', label: '田单', path: [[120.3, 36.5], [119.2, 36.7], [118.31, 36.87]] },
      { state: 'qi', label: '襄王', path: [[118.8, 35.6], [118.45, 36.3], [118.31, 36.8]] },
    ],
  },
  {
    id: 'yanying', year: -278, name: '鄢郢之战', at: [112.2, 30.8],
    sides: '白起沿汉水而下，前一年引水灌鄢，是年拔郢',
    force: '秦：白起所将数万之众 · 楚：举国之兵',
    result: '拔郢，烧夷陵，楚东徙于陈，秦以其地置南郡',
    weight: '楚失江汉根本，自此不复能西向',
    steps: [
      '白起自汉中沿汉水而下，焚舟绝桥，示无还意',
      '鄢城被灌，楚人东徙于陈，江汉之众星散',
      '拔郢烧夷陵，秦置南郡',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[107.0, 33.1], [109.4, 32.7], [111.4, 32.3], [112.1, 31.4], [112.2, 30.6]] },
      { state: 'chu', label: '楚', path: [[112.19, 30.42], [113.4, 31.6], [114.88, 33.73]] },
    ],
  },
  {
    id: 'huayang', year: -273, name: '华阳之战', at: [113.65, 34.55],
    sides: '赵魏攻韩华阳，韩告急，秦白起往救',
    force: '秦：白起、胡阳之军 · 魏：芒卯之军 · 赵：贾偃之军',
    result: '败魏于华阳，斩首十三万；与赵战，沉其卒二万于河',
    weight: '魏献南阳以和，三晋之力又折一截',
    steps: [
      '秦军八日而至华阳',
      '魏芒卯之军当其前，一战而走',
      '赵贾偃之军北来，亦败',
      '斩首十三万，沉赵卒二万于河，魏献南阳以和',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[110.9, 34.62], [112.2, 34.5], [113.45, 34.55]] },
      { state: 'wei', label: '魏', path: [[114.35, 34.79], [114.05, 34.65], [113.8, 34.57]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [114.0, 35.6], [113.7, 34.75]] },
    ],
  },
  {
    id: 'eyu', year: -269, name: '阏与之战', at: [113.6, 37.05],
    sides: '赵奢：「其道远险狭，譬之犹两鼠斗于穴中，将勇者胜」',
    force: '秦：胡伤之军 · 赵：赵奢所将之师',
    result: '赵奢卷甲疾进，先据北山，大破秦军',
    weight: '赵奢由此封马服君；秦东进为之一顿',
    steps: [
      '秦胡伤之军越上党，围阏与',
      '赵奢卷甲而趋，二日一夜至，先据北山',
      '秦军争山不得上，赵纵兵击之，秦军大败而还',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[111.2, 35.2], [112.4, 36.2], [113.4, 36.9]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [114.0, 36.9], [113.7, 37.0]] },
    ],
  },
  {
    id: 'changping', year: -260, name: '长平之战', at: [112.9, 35.85],
    sides: '上党献赵，秦赵倾国相持',
    force: '秦：发河内民年十五以上悉诣长平 · 赵：前后四十五万',
    result: '赵括代廉颇出击，被断粮道，绝食四十六日，降卒尽坑',
    weight: '赵之壮者尽于长平；此后诸侯唯能合纵自保，再无一国可独当秦',
    steps: [
      '秦师东出，取野王而绝上党归韩之道',
      '赵以廉颇筑垒于长平，坚壁不出',
      '赵括代将出击，秦奇兵二万五千绝其后',
      '绝食四十六日，赵括战死，前后斩首虏四十五万',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[108.7, 34.4], [110.4, 34.9], [111.6, 35.4], [112.6, 35.8]] },
      { state: 'zhao', label: '赵', path: [[114.49, 36.6], [113.8, 36.3], [113.1, 35.95]] },
      { state: 'qin', label: '秦奇兵', path: [[111.9, 35.6], [112.4, 36.5], [113.15, 36.25], [113.05, 35.75]] },
    ],
  },
  {
    id: 'handan', year: -257, name: '邯郸之战', at: [114.49, 36.6],
    sides: '秦围邯郸逾年，信陵君窃符救赵',
    force: '秦：王龁、郑安平之军 · 赵、魏、楚',
    result: '魏无忌、春申君与城中内外夹击，秦军大败，郑安平以二万人降赵',
    weight: '长平之后，秦第一次大败于诸侯合兵之手',
    steps: [
      '秦围邯郸逾年，城中炊骨易子而食',
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
    sides: '信陵君归魏，合五国之师击蒙骜',
    force: '五国之师 · 秦：蒙骜之军',
    result: '败蒙骜于河外，追至函谷关，秦兵不敢出',
    weight: '诸侯合纵最后一次大胜秦军；其后魏王中秦反间，夺信陵君兵',
    steps: [
      '信陵君合五国之师西向',
      '蒙骜之军退保函谷',
      '追至关下，秦人闭关不出——合纵最后一次大胜',
    ],
    arrows: [
      { state: 'wei', label: '五国', path: [[114.35, 34.79], [113.2, 34.7], [111.6, 34.65], [111.0, 34.62]] },
      { state: 'qin', label: '秦', path: [[112.4, 34.5], [111.6, 34.6], [110.9, 34.62]] },
    ],
  },
  {
    id: 'zui', year: -241, name: '蕞之战·最后合纵', at: [109.3, 34.5],
    sides: '春申君为纵约长，赵将庞煖将诸侯之锐师攻秦至蕞',
    force: '楚、赵、魏、韩、卫之师',
    result: '秦出兵还击，五国之师皆罢',
    weight: '合纵之局自此永绝，楚畏秦而迁都寿春',
    steps: [
      '诸侯之师入关中',
      '秦师出咸阳，迎击于蕞',
      '五国皆罢，合纵之局自此永绝',
    ],
    arrows: [
      { state: 'chu', label: '五国', path: [[114.88, 33.73], [112.6, 34.4], [110.8, 34.6], [109.5, 34.5]] },
      { state: 'qin', label: '秦', path: [[108.72, 34.35], [109.0, 34.42], [109.25, 34.5]] },
    ],
  },
  {
    id: 'daliang', year: -225, name: '水灌大梁', at: [114.35, 34.79],
    sides: '王贲攻魏，引河沟之水灌大梁',
    force: '秦：王贲之军 · 魏：大梁守军',
    result: '三月城坏，魏王假降，魏亡',
    weight: '中原腹心入秦，六国仅余楚、齐与燕、代之残局',
    steps: [
      '王贲引河沟之水灌大梁',
      '三月城坏，魏王假出降，魏亡',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[112.2, 34.5], [113.3, 34.7], [114.1, 34.79]] },
    ],
  },
  {
    id: 'chuwang', year: -224, name: '王翦灭楚', at: [116.95, 33.5],
    sides: '王翦请六十万，至楚境坚壁不战',
    force: '秦六十万 · 楚：项燕所将，悉国中之兵',
    result: '楚师东引，秦追击，大破之于蕲南，杀项燕；次年虏楚王负刍',
    weight: '南方最后的巨国倾覆，秦有江淮',
    steps: [
      '王翦以六十万入楚境，坚壁不战，日休士洗沐',
      '楚数挑战不得，乃引而东',
      '秦乘其移而击，追至蕲南',
      '杀项燕，次年虏楚王负刍，楚亡',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[113.9, 34.0], [114.6, 33.6], [115.3, 33.35]] },
      { state: 'chu', label: '楚', path: [[115.5, 33.2], [116.2, 33.35], [116.8, 33.5]] },
      { state: 'qin', label: '秦', path: [[115.3, 33.35], [116.1, 33.55], [116.85, 33.55]] },
    ],
  },
  {
    id: 'miehan', year: -230, name: '灭韩·内史腾', at: [113.72, 34.4],
    sides: '韩已削弱至一隅之地',
    force: '秦：内史腾之军',
    result: '虏韩王安，以其地置颍川郡',
    weight: '六国之亡，自韩始',
    steps: [
      '内史腾举兵攻韩，直取新郑',
      '虏韩王安，以其地置颍川郡——六国之亡自韩始',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[112.6, 33.6], [113.2, 34.0], [113.62, 34.35]] },
    ],
  },
  {
    id: 'miezhao', year: -228, name: '灭赵·王翦破邯郸', at: [114.49, 36.6],
    sides: '秦两路攻赵；赵王中反间，杀李牧',
    force: '秦：王翦、杨端和之军 · 赵：先遭地震大饥',
    result: '李牧死后三月，王翦大破赵军；明年虏赵王迁，公子嘉走代自立',
    weight: '与秦相抗最久者亡',
    steps: [
      '王翦将上地之兵，东下井陉',
      '杨端和将河内之兵北上，围邯郸',
      '赵王杀李牧；邯郸破，虏赵王迁，公子嘉走代自立',
    ],
    arrows: [
      { state: 'qin', label: '王翦', path: [[112.9, 37.9], [113.9, 38.05], [114.4, 37.0]] },
      { state: 'qin', label: '杨端和', path: [[113.4, 35.3], [114.0, 35.9], [114.35, 36.5]] },
    ],
  },
  {
    id: 'mieyan', year: -226, name: '灭燕·易水之后', at: [116.4, 39.9],
    sides: '荆轲刺秦不中，秦大举伐燕',
    force: '秦：王翦、辛胜之军 · 燕代联军',
    result: '破燕代联军于易水之西，拔蓟城，燕王喜走辽东',
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
    sides: '王贲自燕地南下，齐相后胜多受秦金',
    force: '秦：王贲之军 · 齐：四十余年不受兵，不修攻战之备',
    result: '齐王建不战而降，迁于共',
    weight: '海内为郡县，法令由一统',
    steps: [
      '王贲自燕地南下，齐人四十余年不修攻战之备',
      '齐王建不战而降，海内为郡县',
    ],
    arrows: [
      { state: 'qin', label: '秦', path: [[116.4, 39.9], [117.2, 38.4], [117.8, 37.4], [118.3, 36.9]] },
    ],
  },
];

// 非战之大事
const OTHER_EVENTS = [
  { year: -479, kind: '学', title: '孔子卒', at: [116.99, 35.6], text: '哲人其萎。其后儒分为八，墨离为三，诸子之言纷起——争的已不是礼，是天下当如何治。' },
  { year: -475, approx: true, kind: '工', title: '铁耕之世', text: '铁农具与牛耕渐次普及，一夫百亩之家可自立。井田之下的族群耕作瓦解，编户齐民与郡县之制由此而生。' },
  { year: -475, kind: '并', title: '赵襄子灭代', at: [114.57, 39.84], text: '襄子未除服，北登夏屋请代王，令厨人以铜枓击杀之，遂兴兵平代地；其姊代夫人摩笄自杀。《史记》年表系于前457，此从清华简《系年》与《赵世家》「襄子元年，越围吴」。' },
  { year: -473, kind: '并', title: '越灭吴', at: [120.6, 31.3], text: '勾践「十年生聚，十年教训」，卒灭吴，北会诸侯于徐州，号称霸王。春秋之霸业，终于此。' },
  { year: -468, kind: '都', title: '越徙都琅琊', at: [119.2, 35.6], text: '勾践北迁于琅琊（据《竹书纪年》），观兵中原。越之国势至此而极，然去其江海根本，亦伏后来之衰。' },
  { year: -458, kind: '并', title: '四卿分范、中行之地', at: [111.4, 35.62], text: '智、赵、韩、魏尽分二卿故地。晋出公怒，欲借齐鲁之兵伐四卿，反为所逐，道死于奔齐途中。智伯专政，益骄。' },
  { year: -453, kind: '并', title: '三家分晋', at: [112.55, 37.87], text: '赵魏韩共灭智氏而分其地，晋国实亡。一说即以此年为战国之始。' },
  { year: -445, approx: true, kind: '变', title: '魏文侯礼贤', at: [110.3, 35.6], text: '文侯立（《竹书纪年》推为前445，《史记》作前424）。师卜子夏，友田子方，礼段干木；西河之学与三晋之法，皆自此门出。' },
  { year: -440, approx: true, kind: '学', title: '墨子止楚攻宋', at: [112.19, 30.42], text: '公输般为云梯，墨翟行十日十夜至郢，解带为城、以牒为械，九攻九拒而械尽。楚王遂罢兵。' },
  { year: -422, approx: true, kind: '变', title: '李悝相魏', at: [111.22, 35.14], text: '尽地力之教；籴甚贵伤民、甚贱伤农，故行平籴以敛散；著《法经》六篇。变法自此为战国之通例。' },
  { year: -409, approx: true, kind: '变', title: '吴起为西河守', at: [110.3, 35.6], text: '魏武卒之制（见《荀子·议兵》）：衣三属之甲、操十二石之弩、负矢五十，日中而趋百里，中试者复其户。' },
  { year: -403, kind: '纵', title: '周威烈王命三晋为诸侯', at: [112.45, 34.68], text: '名分既坏，君臣之礼遂亡。《资治通鉴》以此年开卷，谓「非三晋之坏礼，乃天子自坏之」。' },
  { year: -396, kind: '变', title: '魏文侯卒', at: [111.22, 35.14], text: '在位五十年（据《竹书纪年》），魏为天下第一强。武侯继之，公叔为相而忌吴起，起遂去魏奔楚。' },
  { year: -386, kind: '并', title: '田氏代齐', at: [118.31, 36.87], text: '周安王列田和为诸侯。七年后齐康公卒，吕氏绝祀——太公望之齐，遂为陈完之后所有。' },
  { year: -382, approx: true, kind: '变', title: '吴起变法于楚', at: [112.19, 30.42], text: '废公族疏远者以抚养战斗之士，明法审令，捐不急之官。南平百越，北并陈蔡、却三晋，西伐秦。' },
  { year: -381, kind: '变', title: '楚悼王卒，吴起被诛', at: [112.19, 30.42], text: '宗室大臣射起于王尸之上。肃王立，以中王尸罪夷宗死者七十余家——变法虽废，王权反强。' },
  { year: -376, kind: '并', title: '晋绝祀', at: [111.4, 35.62], text: '韩赵魏废晋静公为庶人，尽分其地。唐叔虞之封，至此六百余年而终。' },
  { year: -375, kind: '并', title: '韩灭郑', at: [113.72, 34.4], text: '郑自桓公受封，四百三十余年而亡。韩徙都新郑，据中原腹心。' },
  { year: -374, approx: true, kind: '学', title: '稷下学宫', at: [118.31, 36.87], text: '田齐设学宫于稷门之下，「不治而议论」。淳于髡、邹衍、慎到、荀卿先后居之，天下辩士辐辏于临淄。' },
  { year: -370, kind: '战', title: '魏之内乱', at: [111.22, 35.14], text: '武侯卒而未立太子，公中缓与惠王争立；韩赵合兵，败魏于浊泽而围惠王。二国意见不合，引兵而去，魏得以不分。' },
  { year: -361, kind: '都', title: '魏徙都大梁', at: [114.35, 34.79], text: '惠王自安邑东迁（据《竹书纪年》；《史记》系于前340），图霸中原。然大梁居四战之地，西顾河西，鞭长莫及。' },
  { year: -361, kind: '变', title: '秦孝公求贤令', at: [109.24, 34.66], text: '「宾客群臣有能出奇计强秦者，吾且尊官，与之分土。」卫鞅闻是令下，乃西入秦。' },
  { year: -356, kind: '变', title: '商鞅第一次变法', at: [109.24, 34.66], text: '什伍连坐、告奸者与斩敌同赏、有军功者各以率受上爵、宗室非有军功论不得为属籍。徙木立信，法乃行。' },
  { year: -350, kind: '变', title: '商鞅第二次变法·徙都咸阳', at: [108.72, 34.35], text: '集小乡邑聚为县，凡三十一县；为田开阡陌封疆，平斗桶权衡丈尺。秦自此耕战一体，赏罚必信。' },
  { year: -344, kind: '纵', title: '逢泽之会', at: [114.35, 34.79], text: '魏惠王率十二诸侯朝天子，乘夏车、称夏王。霸业之顶，亦其转折——齐楚由是恶之。' },
  { year: -340, kind: '战', title: '商鞅诈虏公子卬', at: [110.2, 35.4], text: '卫鞅与魏公子卬约会盟，饮而伏甲虏之，因攻其军，尽破之。魏惠王叹「寡人恨不用公叔座之言也」。秦封鞅于商於十五邑，号商君。' },
  { year: -338, kind: '变', title: '商鞅车裂', at: [108.72, 34.35], text: '孝公卒，惠文王立，商君亡至关下，舍人不知其是商君而拒之——「为法之敝，一至此哉」。人被车裂，而《韩非子》谓「秦法未败也」。' },
  { year: -334, kind: '纵', title: '徐州相王', at: [117.2, 35.0], text: '齐魏会于徐州而互尊为王。周天子之号自此不足贵，天下遂无共主。' },
  { year: -328, kind: '纵', title: '张仪相秦', at: [108.72, 34.35], text: '连横之术起：事一强以攻众弱。散六国之从而使之西面事秦，一辩士之口，胜十万之师。' },
  { year: -325, kind: '纵', title: '秦惠文君称王', at: [108.72, 34.35], text: '秦亦称王，明年改元。王号自此遍于诸侯，周天子徒存其名。' },
  { year: -323, kind: '纵', title: '五国相王', at: [114.2, 38.32], text: '公孙衍倡议，魏、韩、赵、燕、中山互尊为王。齐耻与中山并王，欲伐之以废其号；赵武灵王曰「无其实，敢处其名乎」，令国人称己为君。' },
  { year: -320, approx: true, kind: '学', title: '孟子见梁惠王', at: [114.35, 34.79], text: '「王何必曰利？亦有仁义而已矣。」惠王以为迂远而阔于事情，未能用——然其言二千年后犹在。' },
  { year: -316, kind: '纵', title: '燕王哙让国于子之', at: [116.4, 39.9], text: '效尧舜之禅而不度其时，国大乱。齐宣王乘之，五旬而举燕——让国之美名，几亡其社稷。' },
  { year: -314, kind: '并', title: '齐取燕', at: [116.4, 39.9], text: '齐师入蓟，燕王哙死，子之被醢。诸侯将谋救燕，齐乃引去。燕人立昭王，二十八年后之复仇自此始。' },
  { year: -311, kind: '变', title: '燕昭王招贤', at: [116.4, 39.9], text: '卑身厚币以招贤者，为郭隗改筑宫而师事之——「先从隗始」。乐毅自魏往，邹衍自齐往，剧辛自赵往，士争趋燕。后世所谓黄金台，即附会此事。' },
  { year: -307, kind: '变', title: '赵武灵王胡服骑射', at: [114.49, 36.6], text: '去长裾而习骑射，排众议而行之。其后北破林胡、楼烦，辟地千里，置云中、雁门、代郡，赵遂以骑兵称雄。' },
  { year: -306, kind: '并', title: '楚灭越', at: [120.6, 30.0], text: '越内乱，楚乘之，尽取故吴地至浙江（一说事在前334楚威王时）。越以此散，诸族子争立，滨于江南海上，服朝于楚。' },
  { year: -299, kind: '纵', title: '楚怀王入秦', at: [110.6, 33.5], text: '不听屈原之谏而赴武关之会，遂被扣于咸阳，三年而客死。诸侯由是不直秦——然亦无人能伐。' },
  { year: -296, kind: '并', title: '赵灭中山', at: [114.2, 38.32], text: '迁其王于肤施。白狄之国，五世而终。赵地南北始连成一片。' },
  { year: -295, kind: '变', title: '沙丘之变', at: [115.0, 37.4], text: '武灵王欲分赵而王公子章于代，未决。章作乱，公子成、李兑攻之；主父困于沙丘宫三月余，探爵鷇而食，遂饿死。' },
  { year: -288, kind: '纵', title: '秦称西帝·齐称东帝', at: [118.31, 36.87], text: '秦昭王约齐湣王并称帝。苏代（一说苏秦）说齐去帝号以孤秦，齐从之，秦亦不能独帝——然天下已知只余两极。' },
  { year: -287, kind: '纵', title: '苏秦约五国攻秦', at: [113.25, 34.85], text: '苏秦为燕昭王入齐，阳为齐谋而阴图之。是年约齐、赵、魏、韩、燕攻秦，兵至成皋而止；秦为之废帝请服，归魏赵之地以和。《史记》置苏秦于张仪之前、佩六国相印云云，据马王堆帛书《战国纵横家书》知其多误。' },
  { year: -286, kind: '并', title: '齐灭宋', at: [115.65, 34.41], text: '取膏腴之地而结怨于天下。宋康王偃射天笞地，号「桀宋」，然其地富，诸侯皆欲之。' },
  { year: -283, kind: '纵', title: '完璧归赵', at: [108.72, 34.35], text: '蔺相如奉璧入秦，倚柱怒发，秦不予城而璧完归。小国之尊严，有时只在一人之胆。' },
  { year: -279, kind: '纵', title: '渑池之会', at: [111.76, 34.77], text: '秦王令赵王鼓瑟，相如请秦王击缶，以颈血溅之相胁。归而位在廉颇之上，遂有负荆之请。' },
  { year: -278, kind: '学', title: '屈原沉江', at: [113.07, 28.8], text: '郢既破，相传是年屈原怀石自沉于汨罗。「亦余心之所善兮，虽九死其犹未悔。」' },
  { year: -276, kind: '纵', title: '信陵君封', at: [114.35, 34.79], text: '魏公子无忌仁而下士，食客三千。诸侯以公子贤，十余年不敢加兵谋魏。' },
  { year: -270, kind: '变', title: '范雎入秦', at: [108.72, 34.35], text: '折胁摺齿而逃于秦，说昭王曰：「闻秦之有太后、穰侯、华阳、高陵、泾阳，不闻其有王也。」' },
  { year: -268, kind: '纵', title: '远交近攻', at: [113.25, 35.05], text: '「得寸则王之寸也，得尺亦王之尺也。」秦用其策，先伐魏取怀——秦之战略自此由掠地转为夺国，所并者不复归还。' },
  { year: -266, kind: '变', title: '范雎为相，废穰侯', at: [108.72, 34.35], text: '收魏冉之权，逐泾阳、高陵于关外，太后废。秦王之权自此一统于上。' },
  { year: -262, kind: '纵', title: '上党献赵', at: [112.9, 36.3], text: '韩以上党予秦，守冯亭不肯，转献于赵。平原君曰「发百万之军而攻，逾岁未得一城，今坐受城市邑十七，此大利也」——赵遂受之。' },
  { year: -259, kind: '纵', title: '秦王政生于邯郸', at: [114.49, 36.6], text: '子楚为质于赵，吕不韦以为「奇货可居」。是岁正月生政，三十八年后海内一统。' },
  { year: -257, kind: '纵', title: '毛遂自荐', at: [114.88, 33.73], text: '平原君之楚请救，门下毛遂请行，按剑历阶而说楚王，一言而定纵约。「三寸之舌，强于百万之师。」' },
  { year: -256, kind: '并', title: '秦灭西周·楚灭鲁', at: [112.45, 34.68], text: '秦攻西周，周赧王卒，九鼎入秦，周天子之统至此而绝。同年楚伐鲁，迁鲁顷公于下邑为家人——旧秩序的两个象征同岁而尽。' },
  { year: -256, approx: true, kind: '工', title: '李冰守蜀·都江堰', at: [103.62, 31.0], text: '凿离堆，分内外江，旱则引水浸润，雨则杜塞水门。「水旱从人，不知饥馑」，蜀遂为天府。' },
  { year: -251, kind: '战', title: '鄗代之战', at: [114.5, 37.5], text: '燕乘赵长平之后壮者皆死，以栗腹、卿秦将兵伐赵（《战国策》称共六十万）。廉颇破燕于鄗，杀栗腹；乐乘破卿秦于代，遂围燕。燕割五城以请和。' },
  { year: -249, kind: '变', title: '吕不韦为相', at: [108.72, 34.35], text: '庄襄王元年，以吕不韦为丞相，封文信侯，食河南洛阳十万户。招致士人，著《吕氏春秋》，悬于咸阳市门。' },
  { year: -249, kind: '并', title: '秦灭东周', at: [112.98, 34.75], text: '东周君与诸侯谋秦，秦使吕不韦诛之，尽入其国。秦不绝其祀，以阳人之地奉周祭祀——然周之为国，至此而终。' },
  { year: -246, kind: '工', title: '始凿郑国渠', at: [108.9, 34.6], text: '韩以疲秦之计使水工郑国凿渠。事觉，郑国曰「臣为韩延数岁之命，而为秦建万世之功」——渠成而关中为沃野，秦反以富强。' },
  { year: -243, kind: '纵', title: '信陵君死', at: [114.35, 34.79], text: '秦行反间，魏王使人代将。公子谢病不朝，与宾客为长夜之饮，四岁而卒。魏之亡，自此可期。' },
  { year: -241, kind: '都', title: '楚徙都寿春', at: [116.78, 32.0], text: '五国伐秦不成，楚畏秦而东迁，去钜阳就淮南。中原之国，至此皆背秦而走。' },
  { year: -238, kind: '变', title: '秦王政亲政', at: [107.4, 34.52], text: '加冠于雍，平嫪毐之乱，车裂以徇，灭其宗；明年免吕不韦，后迁蜀，饮鸩而死。宗室外戚之权尽收。' },
  { year: -237, kind: '变', title: '李斯《谏逐客书》', at: [108.72, 34.35], text: '「太山不让土壤，故能成其大；河海不择细流，故能就其深。」逐客令遂废，客卿复用。' },
  { year: -237, kind: '变', title: '尉缭之策', at: [108.72, 34.35], text: '「愿大王毋爱财物，赂其豪臣以乱其谋，不过亡三十万金，则诸侯可尽。」谋臣先行，而后甲兵。' },
  { year: -233, kind: '学', title: '韩非入秦', at: [108.72, 34.35], text: '秦王见《孤愤》《五蠹》曰「嗟乎，寡人得见此人与之游，死不恨矣」。既至，李斯毁之，下狱死于云阳——其书行于秦，其人不容于秦。' },
  { year: -229, kind: '纵', title: '秦行反间杀李牧', at: [114.49, 36.6], text: '王翦攻赵，秦多与赵王宠臣郭开金，言牧欲反。赵王使赵葱代之，牧不受命，遂捕而斩之——后三月，王翦大破赵军。' },
  { year: -227, kind: '纵', title: '荆轲刺秦王', at: [108.72, 34.35], text: '易水送别，风萧萧兮。图穷而匕首见，秦王环柱而走，卒不中。秦王大怒，益发兵诣赵，王翦遂北向燕。' },
  { year: -225, kind: '战', title: '李信伐楚败绩', at: [115.9, 33.6], text: '李信言二十万可取楚，王翦曰非六十万不可。信果为项燕所破，亡七都尉。秦王驰入频阳谢王翦——「将军虽病，独忍弃寡人乎」。' },
  { year: -222, kind: '并', title: '灭代·定江南', at: [114.57, 39.84], text: '王贲攻辽东，虏燕王喜；还攻代，虏代王嘉。王翦定荆江南地，降越君，置会稽郡。六国之中，唯余齐。' },
  { year: -221, kind: '并', title: '海内为郡县', at: [108.72, 34.35], text: '初并天下，号皇帝。分三十六郡，一法度衡石丈尺，车同轨，书同文字。「自上古以来未尝有，五帝所不及。」' },
  { year: -221, kind: '工', title: '铸十二金人', at: [108.72, 34.35], text: '收天下兵聚之咸阳，销以为钟鐻、金人十二，各重千石，置廷宫中。徙天下豪富于咸阳十二万户。' },
];

export const EVENTS = [
  ...BATTLES.map((b) => ({ year: b.year, approx: b.approx, kind: '战', title: b.name, text: b.result, battle: b.id, at: b.at })),
  ...OTHER_EVENTS,
].sort((a, b) => a.year - b.year || (a.kind === '战' ? -1 : 1));

// 印记的全称：左栏只刻一字，案上与读屏用全称
export const KIND_NAME = { 战: '战事', 变: '变局', 纵: '纵横', 并: '兼并', 都: '迁都', 学: '学术', 工: '百工' };

// 六幕：把二百五十四年切成有主题的段落，读者才知道该看什么
export const ACTS = [
  { no: '一', roman: 'I', en: 'THE FALL OF JIN', from: -475, to: -404, title: '晋亡而战国立',
    thesis: '春秋的霸主秩序散了。三家分晋、田氏专齐，卿大夫取代诸侯成为主角；越灭吴而北会诸侯，中原一时无主。' },
  { no: '二', roman: 'II', en: 'THE HEGEMONY OF WEI', from: -403, to: -341, title: '魏之霸',
    thesis: '李悝尽地力、吴起练武卒，魏先行一步而独强数十年。但大梁居四战之地，经不起两线——桂陵、马陵之后，霸业一战而尽。' },
  { no: '三', roman: 'III', en: 'ALLIANCES AND BETRAYALS', from: -340, to: -297, title: '三极与纵横',
    thesis: '秦并巴蜀、齐几灭燕、楚地最广，天下成三极之势。公孙衍、张仪往来其间：合纵者说以存亡，连横者诱以土地，各国比的已不是德，是算。' },
  { no: '四', roman: 'IV', en: 'THE AGE OF BAI QI', from: -296, to: -261, title: '白起的时代',
    thesis: '伊阙二十四万、鄢郢烧夷陵、华阳十三万。秦以斩首计功，山东诸国的野战兵力被逐次抹去；五国破齐，又去其一极。' },
  { no: '五', roman: 'V', en: 'AFTER CHANGPING', from: -260, to: -242, title: '长平之后',
    thesis: '四十余万赵卒尽没，山东再无一国能独当秦军。邯郸之战与信陵君两度合纵稍挫秦锋，然已是回光。' },
  { no: '六', roman: 'VI', en: 'TEN YEARS TO EMPIRE', from: -241, to: -221, title: '十年而并天下',
    thesis: '尉缭请以三十万金离间诸侯豪臣，李斯请先取韩以恐他国。自韩始，十年之内六王毕、四海一。' },
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

const DIGITS = '〇一二三四五六七八九';

// 汉字数目：纪年、幕次、朗读共用一处，不各写一份
export function cnNumber(n) {
  if (n < 10) return DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? DIGITS[n % 10] : '');
  if (n < 100) return DIGITS[(n / 10) | 0] + '十' + (n % 10 ? DIGITS[n % 10] : '');
  const h = (n / 100) | 0;
  const r = n % 100;
  if (n < 1000) {
    if (!r) return DIGITS[h] + '百';
    if (r < 10) return `${DIGITS[h]}百零${DIGITS[r]}`;
    return DIGITS[h] + '百' + cnNumber(r);
  }
  return String(n);
}

export function formatYear(y) {
  return y < 0 ? `前${-y}` : `${y}`;
}

// 年代不能确指者冠以「约」
export function dateOf(x) {
  return `${x.approx ? '约' : ''}${formatYear(x.year)}`;
}

// 纪年：周亡之前用周王，其后用秦王。first 是该王元年——秦昭襄王在周亡时已是第五十二年
const REIGNS = [
  [-519, -476, '周敬王'], [-475, -469, '周元王'], [-468, -441, '周贞定王'],
  [-440, -426, '周考王'], [-425, -402, '周威烈王'], [-401, -376, '周安王'],
  [-375, -369, '周烈王'], [-368, -321, '周显王'], [-320, -315, '周慎靓王'],
  [-314, -256, '周赧王'], [-255, -251, '秦昭襄王', -306], [-250, -250, '秦孝文王'],
  [-249, -247, '秦庄襄王'], [-246, -221, '秦王政'],
];

export function eraOf(y) {
  const r = REIGNS.find(([a, b]) => y >= a && y <= b);
  if (!r) return '';
  const n = y - (r[3] ?? r[0]) + 1;
  return `${r[2]}${n === 1 ? '元' : cnNumber(n)}年`;
}
