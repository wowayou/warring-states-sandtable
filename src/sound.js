// 声：解说朗读用浏览器自带的语音合成，战事落定敲一记编钟。
// 语音是否可用、可用哪一把嗓子，各系统不同，故此处只做检测与降级，不作承诺。

const ZH = /^(zh|cmn)/i;

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

  say(text, onEnd) {
    if (!this.enabled || !this.ready || !text) { onEnd?.(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.voice;
      u.lang = this.voice?.lang || 'zh-CN';
      u.rate = 0.95;
      u.pitch = 0.95;
      u.onend = () => onEnd?.();
      u.onerror = () => onEnd?.();
      speechSynthesis.speak(u);
    } catch {
      onEnd?.();
    }
  },

  hush() {
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
