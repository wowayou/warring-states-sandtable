// One transport owns audio, captions, routes and navigation. No timer guesses
// while audio is playing; the media clock is also sampled by the canvas.
export class PlaybackController {
  constructor({ scenes, recordings, audioFactory = () => new Audio(), now = () => performance.now(),
    onChange = () => {}, onPart = () => {}, onComplete = () => {}, onSceneEnd = () => {}, bufferTimeout = 15000 }) {
    this.scenes = new Map(scenes.map((s) => [s.id, s]));
    this.recordings = recordings;
    this.audio = audioFactory();
    this.audio.preload = 'metadata';
    this.audio.preservesPitch = true;
    this.audioFactory = audioFactory;
    this.now = now;
    this.onChange = onChange;
    this.onPart = onPart;
    this.onComplete = onComplete;
    this.onSceneEnd = onSceneEnd;
    this.bufferTimeout = bufferTimeout;
    this.state = 'idle';
    this.voice = true;
    this.rate = 1;
    this.queue = [];
    this.index = 0;
    this.partIndex = 0;
    this.offset = 0;
    this.anchor = now();
    this.generation = 0;
    this.playAttempt = 0;
    this.listeners = [];
    this.mode = 'tour';
    this.error = '';
  }

  get scene() { return this.scenes.get(this.queue[this.index]); }
  get part() { return this.scene?.parts[this.partIndex]; }
  get recording() {
    if (this.part?.silent) return this.part;
    const r = this.recordings[this.part?.id];
    return r?.text === this.part?.text ? r : null;
  }
  get duration() { return this.recording?.duration || 0; }
  get useAudio() { return this.voice && !this.part?.silent; }
  get active() { return ['playing', 'loading', 'buffering'].includes(this.state); }
  get position() {
    if (this.state !== 'playing') return this.offset;
    const value = this.useAudio ? this.audio.currentTime : this.offset + (this.now() - this.anchor) * this.rate / 1000;
    return Math.max(0, Math.min(this.duration, Number.isFinite(value) ? value : this.offset));
  }

  notify() { this.onChange(this); }

  clearMedia() {
    this.generation++;
    clearTimeout(this.timer);
    for (const [name, fn] of this.listeners) this.audio.removeEventListener(name, fn);
    this.listeners = [];
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.clearPreload();
  }

  clearPreload() {
    if (!this.preload) return;
    this.preload.removeAttribute('src');
    this.preload.load();
    this.preload = null;
  }

  load(queue, { index = 0, part = 0, position = 0, autoplay = true, mode = 'tour' } = {}) {
    if (!queue.length || queue.some((id) => !this.scenes.has(id))) throw new Error('Invalid playback queue');
    if (index < 0 || index >= queue.length) throw new Error('Invalid scene index');
    this.queue = [...queue];
    this.index = index;
    this.mode = mode;
    this.selectPart(part, position, autoplay);
  }

  selectPart(part, position = 0, autoplay = true) {
    if (!Number.isInteger(part) || !this.scene?.parts[part]) throw new Error('Invalid part');
    this.clearMedia();
    this.partIndex = part;
    this.offset = Math.max(0, Math.min(this.duration, position));
    this.anchor = this.now();
    this.state = 'paused';
    this.error = '';
    this.onPart(this);
    this.notify();
    if (autoplay) this.resume();
  }

  fail(message) {
    this.offset = this.position;
    this.clearMedia();
    this.state = 'error';
    this.error = message;
    this.notify();
  }

  watchBuffer() {
    clearTimeout(this.timer);
    const run = this.generation;
    this.timer = setTimeout(() => {
      if (run === this.generation && this.active) this.fail('音频加载超时，请重试或无声继续。');
    }, this.bufferTimeout);
  }

  resume() {
    if (!this.scene || this.active) return;
    if (!this.recording || !(this.duration > 0)) {
      this.fail('此段配音或时间信息缺失，请检查完整资源包。');
      return;
    }
    if (this.state === 'ended') this.offset = 0;
    else if (this.offset >= this.duration) { this.advance(); return; }
    this.error = '';
    if (!this.useAudio) {
      this.state = 'playing'; this.anchor = this.now(); this.notify(); return;
    }
    if (!this.audio.getAttribute('src')) this.attachAudio();
    this.state = 'loading';
    this.watchBuffer();
    this.audio.playbackRate = this.rate;
    if (this.audio.readyState >= 1) this.audio.currentTime = this.offset;
    const run = this.generation;
    const attempt = ++this.playAttempt;
    // play() is called inside the user's gesture, including on iOS.
    Promise.resolve(this.audio.play()).catch((error) => {
      if (run !== this.generation || attempt !== this.playAttempt || !this.active) return;
      this.fail(error.name === 'NotAllowedError' ? '浏览器需要你再次点击重试以允许声音。' : '音频无法播放，请重试或无声继续。');
    });
    this.notify();
  }

  attachAudio() {
    const run = this.generation;
    const listen = (name, callback) => {
      const fn = () => { if (run === this.generation) callback(); };
      this.audio.addEventListener(name, fn); this.listeners.push([name, fn]);
    };
    listen('loadedmetadata', () => { this.audio.currentTime = this.offset; });
    listen('playing', () => {
      if (!this.active || this.audio.paused || this.audio.readyState < 2 || this.audio.seeking) return;
      clearTimeout(this.timer); this.state = 'playing'; this.notify(); this.preloadNext();
    });
    const waiting = () => {
      if (!this.active) return;
      this.offset = this.position;
      this.state = 'buffering'; this.watchBuffer(); this.notify();
    };
    listen('waiting', waiting);
    listen('seeking', waiting);
    listen('seeked', () => {
      if (this.active && !this.audio.paused && this.audio.readyState >= 2) {
        clearTimeout(this.timer); this.state = 'playing'; this.notify();
      }
    });
    listen('error', () => { if (this.active) this.fail('配音文件加载失败，请重试或无声继续。'); });
    listen('ended', () => {
      if (this.active && !this.audio.seeking && this.audio.currentTime >= this.duration - .12) this.advance();
    });
    this.audio.src = this.recording.file;
    this.audio.load();
  }

  preloadNext() {
    this.clearPreload();
    const next = this.scene.parts[this.partIndex + 1]
      || this.scenes.get(this.queue[this.index + 1])?.parts[0];
    const record = this.recordings[next?.id];
    if (!record || record.text !== next.text || !this.voice) return;
    this.preload = this.audioFactory();
    this.preload.preload = 'auto';
    this.preload.src = record.file;
    this.preload.load();
  }

  pause() {
    if (!this.active) return;
    this.offset = this.position;
    this.playAttempt++;
    this.audio.pause(); clearTimeout(this.timer);
    this.state = 'paused'; this.notify();
  }

  seek(time) {
    if (!this.part || !Number.isFinite(time)) return;
    const active = this.active;
    this.offset = Math.max(0, Math.min(this.duration, time));
    this.anchor = this.now();
    if (this.useAudio && this.audio.readyState >= 1) this.audio.currentTime = this.offset;
    if (this.state === 'ended') this.state = 'paused';
    if (!active) this.audio.pause();
    this.notify();
  }

  setRate(rate) {
    if (![.75, 1, 1.25, 1.5, 2].includes(rate)) throw new Error('Unsupported playback rate');
    this.offset = this.position; this.anchor = this.now();
    this.rate = rate; this.audio.playbackRate = rate; this.notify();
  }

  setVoice(enabled, { autoplay = this.active || this.state === 'error' } = {}) {
    if (this.voice === enabled) return;
    this.offset = this.position;
    this.clearMedia(); this.voice = enabled; this.state = 'paused';
    this.error = ''; this.notify();
    if (autoplay) this.resume();
  }

  retry() { this.selectPart(this.partIndex, this.offset, true); }
  replay() { if (this.part) this.selectPart(this.partIndex, 0, true); }

  advance() {
    if (this.partIndex === this.scene.parts.length - 1) this.onSceneEnd(this.scene);
    if (this.partIndex + 1 < this.scene.parts.length) this.selectPart(this.partIndex + 1);
    else if (this.index + 1 < this.queue.length) { this.index++; this.selectPart(0); }
    else {
      this.offset = this.duration; this.audio.pause(); clearTimeout(this.timer);
      this.state = 'ended'; this.clearPreload(); this.notify(); this.onComplete(this);
    }
  }

  tick() { if (!this.useAudio && this.state === 'playing' && this.position >= this.duration) this.advance(); }

  snapshot() {
    if (!this.scene) return null;
    return { queue: [...this.queue], index: this.index, part: this.partIndex, position: this.position, mode: this.mode };
  }

  restore(snapshot) { this.load(snapshot.queue, { ...snapshot, autoplay: true }); }

  destroy() { this.clearMedia(); this.state = 'idle'; }
}
