// 声：解说朗读用浏览器自带的语音合成，战事落定敲一记编钟。
// 语音是否可用、可用哪一把嗓子，各系统不同，故此处只做检测与降级，不作承诺。

import { cnNumber } from './history.js';

const ZH = /^(zh|cmn)/i;

// 书名号、间隔号、破折号读出来都是杂音；标点则决定停顿
function normalize(text) {
  return String(text)
    .replace(/前(\d{2,3})/g, (_, n) => `公元前${cnNumber(+n)}年`)
    .replace(/(\d{2,4})/g, (m) => (+m > 0 && +m < 1000 ? cnNumber(+m) : m))
    .replace(/[《》「」『』“”"']/g, '')
    .replace(/[·•]/g, '，')
    .replace(/[—–]{1,2}/g, '，')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// 分句而后连念，句读之间留一口气——一口气念完整段，正是「生硬」的由来
function phrases(text) {
  const out = [];
  let buf = '';
  for (const ch of normalize(text)) {
    buf += ch;
    if ('。！？；：'.includes(ch)) { out.push(buf); buf = ''; }
  }
  if (buf.trim()) out.push(buf);
  return out.filter((x) => x.replace(/[，。！？；：]/g, '').length);
}

export const speech = {
  ready: false,
  voice: null,
  enabled: false,

  probe() {
    if (!('speechSynthesis' in window)) return false;
    const pick = () => {
      const voices = speechSynthesis.getVoices() || [];
      const zh = voices.filter((v) => ZH.test(v.lang));
      if (!zh.length) return false;
      // 本地嗓音无需联网，优先；其次挑普通话
      this.voice = zh.find((v) => v.localService && /CN|Hans|cmn/i.test(v.lang))
        || zh.find((v) => v.localService)
        || zh.find((v) => /CN|Hans|cmn/i.test(v.lang))
        || zh[0];
      this.ready = true;
      return true;
    };
    if (pick()) return true;
    speechSynthesis.addEventListener('voiceschanged', pick, { once: true });
    return false;
  },

  rate: 0.9,
  pitch: 0.92,
  seq: 0,

  voices() {
    if (!('speechSynthesis' in window)) return [];
    return (speechSynthesis.getVoices() || []).filter((v) => ZH.test(v.lang));
  },

  use(name) {
    const v = this.voices().find((x) => x.name === name);
    if (v) this.voice = v;
  },

  say(text, onEnd) {
    if (!this.enabled || !this.ready || !text) { onEnd?.(); return; }
    const parts = phrases(text);
    if (!parts.length) { onEnd?.(); return; }
    const run = ++this.seq;
    try { speechSynthesis.cancel(); } catch { /* 忽略 */ }
    const speak = (i) => {
      if (run !== this.seq) return;
      if (i >= parts.length) { onEnd?.(); return; }
      try {
        const u = new SpeechSynthesisUtterance(parts[i]);
        u.voice = this.voice;
        u.lang = this.voice?.lang || 'zh-CN';
        u.rate = this.rate;
        u.pitch = this.pitch;
        // 句间停一口气，长句后停得久些
        const gap = parts[i].length > 18 ? 340 : 220;
        u.onend = () => setTimeout(() => speak(i + 1), gap);
        u.onerror = () => setTimeout(() => speak(i + 1), gap);
        speechSynthesis.speak(u);
      } catch {
        onEnd?.();
      }
    };
    speak(0);
  },

  hush() {
    this.seq++;
    if ('speechSynthesis' in window) {
      try { speechSynthesis.cancel(); } catch { /* 无嗓音时静默 */ }
    }
  },
};

// 编钟一击：基频加几个不谐分音，快起慢落
let ac = null;

export function chime(kind = 'war') {
  if (!speech.enabled) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    const base = kind === 'war' ? 196 : 262;
    const out = ac.createGain();
    out.gain.value = kind === 'war' ? 0.16 : 0.1;
    out.connect(ac.destination);
    // 分音比取自编钟的近似：正鼓与侧鼓之外，尚有若干不谐的余响
    [[1, 1], [2.01, 0.5], [2.76, 0.28], [5.4, 0.12], [8.9, 0.06]].forEach(([ratio, amp], i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = base * ratio;
      const decay = kind === 'war' ? 2.6 - i * 0.35 : 1.6 - i * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.3, decay));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + Math.max(0.4, decay) + 0.05);
    });
  } catch {
    /* 音频不可用时不作声 */
  }
}
