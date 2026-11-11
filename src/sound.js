// 编钟一击：基频加几个不谐分音，快起慢落
let ac = null;
const ringing = new Set();

export function stopChime() {
  for (const oscillator of ringing) {
    try { oscillator.stop(); } catch { /* already ended */ }
  }
  ringing.clear();
}

export function chime(kind = 'war') {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const t = ac.currentTime;
    const base = kind === 'war' ? 196 : 262;
    const out = ac.createGain();
    out.gain.value = kind === 'war' ? 0.16 : 0.1;
    out.connect(ac.destination);
    // 分音比取自编钟的近似：正鼓与侧鼓之外，尚有若干不谐的余响
    [[1, 1], [2.01, 0.5], [2.76, 0.28], [5.4, 0.12], [8.9, 0.06]].forEach(([ratio, amp], i) => {
      const o = ac.createOscillator();
      ringing.add(o);
      o.onended = () => { ringing.delete(o); o.disconnect(); };
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
