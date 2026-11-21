import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import VoiceMapper from "./VoiceMapper";
import "./RecordingStudio.css";
import "./VoiceMapper.css";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAX_VOICES = 6;
const SHARED_PIANO_KEY = "kevin-studio-shared-piano-roll";

const ROOT_KEYS = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5,
  t: 6, g: 7, y: 8, h: 9, u: 10, j: 11
};

const NUMPAD_SOUND_KEYS = {
  Numpad1: "organ",
  Numpad2: "pad",
  Numpad3: "saw",
  Numpad4: "epiano",
  Numpad5: "flute",
  Numpad6: "bass",
  Numpad7: "sine",
  Numpad8: "strings",
  Numpad9: "bell"
};

const NUMPAD_DISPLAY = [
  { code: "Numpad7", num: "7", preset: "sine" },
  { code: "Numpad8", num: "8", preset: "strings" },
  { code: "Numpad9", num: "9", preset: "bell" },
  { code: "Numpad4", num: "4", preset: "epiano" },
  { code: "Numpad5", num: "5", preset: "flute" },
  { code: "Numpad6", num: "6", preset: "bass" },
  { code: "Numpad1", num: "1", preset: "organ" },
  { code: "Numpad2", num: "2", preset: "pad" },
  { code: "Numpad3", num: "3", preset: "saw" }
];

const CHORD_MAP = {
  "1": { label: "maj", suffix: "", intervals: [0, 4, 7], group: "triad" },
  "2": { label: "min", suffix: "m", intervals: [0, 3, 7], group: "triad" },
  "3": { label: "5", suffix: "5", intervals: [0, 7, 12], group: "triad" },
  "4": { label: "sus2", suffix: "sus2", intervals: [0, 2, 7], group: "triad" },
  "5": { label: "sus4", suffix: "sus4", intervals: [0, 5, 7], group: "triad" },
  "6": { label: "7sus4", suffix: "7sus4", intervals: [0, 5, 7, 10], group: "triad" },
  "7": { label: "dim", suffix: "dim", intervals: [0, 3, 6], group: "triad" },
  "8": { label: "dim7", suffix: "dim7", intervals: [0, 3, 6, 9], group: "triad" },
  "9": { label: "aug", suffix: "aug", intervals: [0, 4, 8], group: "triad" },
  "0": { label: "6", suffix: "6", intervals: [0, 4, 7, 9], group: "triad" },
  "-": { label: "m6", suffix: "m6", intervals: [0, 3, 7, 9], group: "triad" },
  "=": { label: "6/9", suffix: "6/9", intervals: [0, 4, 7, 9, 14], group: "triad" },
  q: { label: "maj7", suffix: "maj7", intervals: [0, 4, 7, 11], group: "seventh" },
  r: { label: "m7", suffix: "m7", intervals: [0, 3, 7, 10], group: "seventh" },
  i: { label: "7", suffix: "7", intervals: [0, 4, 7, 10], group: "seventh" },
  o: { label: "mMaj7", suffix: "m(maj7)", intervals: [0, 3, 7, 11], group: "seventh" },
  p: { label: "m7b5", suffix: "m7b5", intervals: [0, 3, 6, 10], group: "seventh" },
  "[": { label: "maj7#5", suffix: "maj7(#5)", intervals: [0, 4, 8, 11], group: "seventh" },
  "]": { label: "7#5", suffix: "7(#5)", intervals: [0, 4, 8, 10], group: "seventh" },
  k: { label: "maj9", suffix: "maj9", intervals: [0, 4, 7, 11, 14], group: "ninth" },
  l: { label: "m9", suffix: "m9", intervals: [0, 3, 7, 10, 14], group: "ninth" },
  ";": { label: "9", suffix: "9", intervals: [0, 4, 7, 10, 14], group: "ninth" },
  "'": { label: "mMaj9", suffix: "m(maj9)", intervals: [0, 3, 7, 11, 14], group: "ninth" },
  z: { label: "add9", suffix: "add9", intervals: [0, 4, 7, 14], group: "ext" },
  x: { label: "madd9", suffix: "m(add9)", intervals: [0, 3, 7, 14], group: "ext" },
  c: { label: "11", suffix: "11", intervals: [0, 4, 7, 10, 14, 17], group: "ext" },
  v: { label: "m11", suffix: "m11", intervals: [0, 3, 7, 10, 14, 17], group: "ext" },
  b: { label: "maj7#11", suffix: "maj7(#11)", intervals: [0, 4, 7, 11, 18], group: "ext" },
  n: { label: "13", suffix: "13", intervals: [0, 4, 7, 10, 14, 21], group: "ext" },
  m: { label: "m13", suffix: "m13", intervals: [0, 3, 7, 10, 14, 21], group: "ext" },
  ",": { label: "7b9", suffix: "7(b9)", intervals: [0, 4, 7, 10, 13], group: "ext" },
  ".": { label: "7#9", suffix: "7(#9)", intervals: [0, 4, 7, 10, 15], group: "ext" },
  "/": { label: "7alt", suffix: "7alt", intervals: [0, 4, 6, 10, 13, 15], group: "ext" }
};

const KEYBOARD_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"]
];

const EXAMPLE_PROGRESSION = [
  { root: 2, chordKey: "l" },
  { root: 7, chordKey: "n" },
  { root: 0, chordKey: "k" },
  { root: 9, chordKey: "." }
];

const SYNTH_PRESETS = {
  organ: { label: "Organ", harmonics: [0.6, 1.0, 0.75, 0.45, 0.25], ratios: [0.5, 1, 2, 3, 4], type: "sine", filterFreq: 3400 },
  pad: { label: "Pad", harmonics: [1.0, 0.5, 0.3], ratios: [1, 1.004, 2], type: "sawtooth", filterFreq: 1200 },
  saw: { label: "Saw", harmonics: [1.0, 0.6], ratios: [1, 0.996], type: "sawtooth", filterFreq: 4200 },
  epiano: { label: "E-Piano", harmonics: [1.0, 0.4, 0.2], ratios: [1, 2, 3], type: "triangle", filterFreq: 2600 },
  flute: { label: "Flute", harmonics: [1.0, 0.2], ratios: [1, 2], type: "sine", filterFreq: 2200 },
  bass: { label: "Bass", harmonics: [1.0, 0.7], ratios: [0.5, 1], type: "triangle", filterFreq: 900 },
  sine: { label: "Sine", harmonics: [1.0], ratios: [1], type: "sine", filterFreq: 5000 },
  strings: { label: "Strings", harmonics: [0.9, 0.7, 0.4], ratios: [0.997, 1.003, 2], type: "sawtooth", filterFreq: 2400 },
  bell: { label: "Bell", harmonics: [1.0, 0.45, 0.25], ratios: [1, 2, 3.01], type: "sine", filterFreq: 4800 },
  choir_slot: { label: "Choir Bank (Ready)", harmonics: [0.85, 0.65, 0.35], ratios: [0.998, 1.002, 2], type: "triangle", filterFreq: 1650 },
  omnisphere: { label: "Omnisphere Ahhs", harmonics: [1.0, 0.8, 0.6, 0.4], ratios: [0.995, 1, 1.005, 2], type: "sawtooth", filterFreq: 900 },
  eastwest: { label: "EastWest Hollywood", harmonics: [1.0, 0.9, 0.8, 0.7, 0.5, 0.3], ratios: [0.992, 0.996, 1, 1.004, 1.008, 2], type: "sawtooth", filterFreq: 2500 },
  kontakt_olympus: { label: "Olympus Epic Choir", harmonics: [1.0, 0.9, 0.8, 0.7, 0.6, 0.4], ratios: [0.99, 0.995, 1, 1.005, 1.01, 2], type: "sawtooth", filterFreq: 1800 },
  kontakt_omnia: { label: "Modern Omnia Choir", harmonics: [0.9, 0.8, 0.6, 0.4], ratios: [0.998, 1, 1.002, 2], type: "sawtooth", filterFreq: 3000 },
  zenology_gothic: { label: "Gothic Vintage Choir", harmonics: [1.0, 0.7, 0.5], ratios: [0.98, 1, 1.02], type: "sawtooth", filterFreq: 700 }
};

const EXTRA_SOUND_BANK = [
  { id: "strings", label: "Warm Strings (Numpad 8)" },
  { id: "bell", label: "Glass Bell (Numpad 9)" },
  { id: "choir_slot", label: "Choir Bank — Ready for Choir Presets" },
  { id: "omnisphere", label: "Omnisphere Ahhs" },
  { id: "eastwest", label: "EastWest Hollywood" },
  { id: "kontakt_olympus", label: "Olympus Epic Choir" },
  { id: "kontakt_omnia", label: "Modern Omnia Choir" },
  { id: "zenology_gothic", label: "Gothic Vintage Choir" }
];

const midiToFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);
const midiToName = midi => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

// Shared glide shape — used by the audio AND the piano roll.
const GLIDE_EASE = [0.42, 0, 0.58, 1];
function cubicBezierEase(ax, ay, bx, by, p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0, hi = 1, t = p;
  for (let i = 0; i < 24; i++) {
    const x = 3 * (1 - t) * (1 - t) * t * ax + 3 * (1 - t) * t * t * bx + t * t * t;
    if (x < p) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return 3 * (1 - t) * (1 - t) * t * ay + 3 * (1 - t) * t * t * by + t * t * t;
}

function loadSharedPianoSettings() {
  try {
    const raw = localStorage.getItem(SHARED_PIANO_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSharedPianoSettings(settings) {
  try {
    localStorage.setItem(SHARED_PIANO_KEY, JSON.stringify({
      ...settings,
      updatedAt: Date.now()
    }));
    window.dispatchEvent(new CustomEvent("kevin-studio-piano-sync", { detail: settings }));
  } catch {}
}

function solveVoiceLeading(prevMidis, rootPc, intervals, baseOctave, smooth) {
  const baseMidi = (baseOctave + 1) * 12 + rootPc;
  const rawTargets = intervals.map(iv => baseMidi + iv);

  if (!smooth || !prevMidis || prevMidis.length === 0) {
    return rawTargets.slice(0, MAX_VOICES).sort((a, b) => a - b);
  }

  const prevSorted = [...prevMidis].sort((a, b) => a - b);
  const targetPcs = rawTargets.map(m => ((m % 12) + 12) % 12);
  const result = [];

  for (let i = 0; i < targetPcs.length && i < MAX_VOICES; i++) {
    const pc = targetPcs[i];
    const ref = prevSorted[Math.min(i, prevSorted.length - 1)];
    const refOct = Math.floor(ref / 12);
    let best = refOct * 12 + pc;

    if (best - ref > 6) best -= 12;
    if (best - ref < -6) best += 12;
    best = Math.max(36, Math.min(96, best));
    result.push(best);
  }

  return result.sort((a, b) => a - b);
}

function createImpulseResponse(ctx, duration = 1.8, decay = 2.4) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function writeWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function TempoControls({ bpm, setBpm, metronomeOn, onToggleMetronome }) {
  return (
    <div className="rs-tempo-panel">
      <div className="rs-tempo-readout">
        <span className="rs-lbl">TEMPO</span>
        <div className="rs-tempo-stepper">
          <button type="button" onClick={() => setBpm(v => Math.max(40, v - 1))}>−</button>
          <input
            aria-label="Tempo in beats per minute"
            type="number"
            min="40"
            max="240"
            value={bpm}
            onChange={e => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) setBpm(Math.max(40, Math.min(240, next || 40)));
            }}
          />
          <button type="button" onClick={() => setBpm(v => Math.min(240, v + 1))}>+</button>
          <strong>BPM</strong>
        </div>
      </div>
      <input
        className="rs-tempo-slider"
        aria-label="Adjust tempo"
        type="range"
        min="40"
        max="240"
        step="1"
        value={bpm}
        onChange={e => setBpm(Number(e.target.value))}
      />
      <button
        type="button"
        className={`rs-metronome-button ${metronomeOn ? "active" : ""}`}
        onClick={onToggleMetronome}
        aria-pressed={metronomeOn}
      >
        <span className="rs-metronome-icon">♩</span>
        {metronomeOn ? "METRONOME ON" : "METRONOME OFF"}
      </button>
    </div>
  );
}

export default function RecordingStudio({ sharedBpm, onBpmChange }) {
  const [selectedRoot, setSelectedRoot] = useState(2);
  const [activeChordKey, setActiveChordKey] = useState("l");
  const [currentMidis, setCurrentMidis] = useState([]);
  const [recentChords, setRecentChords] = useState([]);
  const [activeSlot, setActiveSlot] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const [soundBankOpen, setSoundBankOpen] = useState(false);

  const [soundPreset, setSoundPreset] = useState("organ");
  const [glideMs, setGlideMs] = useState(400);
  const [strumMs, setStrumMs] = useState(0);
  const [volumeDb, setVolumeDb] = useState(-6);
  const [reverbPct, setReverbPct] = useState(30);
  const [octave, setOctave] = useState(3);

  const [playOwnSound, setPlayOwnSound] = useState(true);
  const [smoothVoiceLeading, setSmoothVoiceLeading] = useState(true);
  const [ringUntilNext, setRingUntilNext] = useState(true);
  const [letterReplaysLast, setLetterReplaysLast] = useState(false);

  const [bpm, setBpmLocal] = useState(sharedBpm || 120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const metronomeNextBeatRef = useRef(0);
  const metronomeBeatRef = useRef(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kevin-studio-projects") || "[]");
    } catch {
      return [];
    }
  });
  const [exportStatus, setExportStatus] = useState("");
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const destNodeRef = useRef(null);

  const [takeProgression, setTakeProgression] = useState([]);
  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;
  const chordStartedAtRef = useRef(0);
  const openTakeChordIndexRef = useRef(-1);

  const [pianoRollOpen, setPianoRollOpen] = useState(false);

  const audioCtxRef = useRef(null);
  const voicesRef = useRef([]);
  const masterGainRef = useRef(null);
  const dryGainRef = useRef(null);
  const wetGainRef = useRef(null);
  const filterRef = useRef(null);

  const currentMidisRef = useRef([]);
  const selectedRootRef = useRef(selectedRoot);
  const activeChordKeyRef = useRef(activeChordKey);
  const canvasRef = useRef(null);
  const exampleTimerRef = useRef([]);

  const timelineEventsRef = useRef([]);
  const pausedRef = useRef(false);
  const pausedAtRef = useRef(0);
  const totalPausedOffsetRef = useRef(0);

  selectedRootRef.current = selectedRoot;
  activeChordKeyRef.current = activeChordKey;
  pausedRef.current = isPaused;

  const setBpm = useCallback(value => {
    const next = typeof value === "function" ? value(bpm) : value;
    setBpmLocal(next);
    if (typeof onBpmChange === "function") onBpmChange(next);
  }, [bpm, onBpmChange]);

  const isPlaying = !isPaused && currentMidis.length > 0;

  const msToBeats = useCallback(
    (ms) => (ms / 1000) * (Math.max(40, bpm) / 60),
    [bpm]
  );

  function closeOpenTakeChord(endMs = performance.now()) {
    const idx = openTakeChordIndexRef.current;
    if (idx < 0) return;
    const elapsedMs = Math.max(0, endMs - chordStartedAtRef.current);
    const beats = Math.max(0.0625, msToBeats(elapsedMs));
    setTakeProgression(prev => {
      if (!prev[idx]) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], durationBeats: beats };
      return next;
    });
    openTakeChordIndexRef.current = -1;
  }

  function getTimelineNow() {
    const raw = performance.now() / 1000;
    if (pausedRef.current) {
      return pausedAtRef.current - totalPausedOffsetRef.current;
    }
    return raw - totalPausedOffsetRef.current;
  }

  function buildVoiceOscillators(ctx, voice, presetKey) {
    voice.oscs.forEach(o => { try { o.osc.stop(); o.osc.disconnect(); o.g.disconnect(); } catch {} });
    voice.oscs = [];

    const preset = SYNTH_PRESETS[presetKey] || SYNTH_PRESETS.organ;
    preset.ratios.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = preset.type;
      osc.frequency.value = voice.baseFreq * ratio;
      g.gain.value = preset.harmonics[i];
      osc.connect(g);
      g.connect(voice.vGain);
      osc.start();
      voice.oscs.push({ osc, g, ratio });
    });
  }

  function ensureAudioEngine() {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended" && !pausedRef.current) {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = (SYNTH_PRESETS[soundPreset] || SYNTH_PRESETS.organ).filterFreq;

    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = createImpulseResponse(ctx);

    const masterGain = ctx.createGain();
    masterGain.gain.value = playOwnSound ? Math.pow(10, volumeDb / 20) * 0.22 : 0;

    const dest = ctx.createMediaStreamDestination();
    destNodeRef.current = dest;

    filter.connect(dryGain);
    filter.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    masterGain.connect(dest);

    const voices = [];
    for (let i = 0; i < MAX_VOICES; i++) {
      const vGain = ctx.createGain();
      vGain.gain.value = 0;
      vGain.connect(filter);
      const voice = { vGain, oscs: [], baseFreq: 261.63, active: false };
      buildVoiceOscillators(ctx, voice, soundPreset);
      voices.push(voice);
    }

    audioCtxRef.current = ctx;
    voicesRef.current = voices;
    masterGainRef.current = masterGain;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;
    filterRef.current = filter;

    updateMixParams();
    return ctx;
  }

  function updateMixParams() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    const linearVol = playOwnSound ? Math.pow(10, volumeDb / 20) * 0.22 : 0;
    masterGainRef.current?.gain.setTargetAtTime(linearVol, now, 0.02);

    const wet = reverbPct / 100;
    dryGainRef.current?.gain.setTargetAtTime(1 - wet * 0.45, now, 0.02);
    wetGainRef.current?.gain.setTargetAtTime(wet * 0.85, now, 0.02);

    const preset = SYNTH_PRESETS[soundPreset] || SYNTH_PRESETS.organ;
    if (filterRef.current) {
      filterRef.current.frequency.setTargetAtTime(preset.filterFreq, now, 0.03);
    }
  }

  useEffect(() => {
    updateMixParams();
  }, [volumeDb, reverbPct, playOwnSound]);

  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    updateMixParams();
    voicesRef.current.forEach(v => buildVoiceOscillators(ctx, v, soundPreset));
  }, [soundPreset]);

  async function toggleMetronome() {
    if (metronomeOn) {
      setMetronomeOn(false);
      return;
    }
    try {
      const audio = ensureAudioEngine();
      if (audio.state === "suspended") await audio.resume();
      metronomeNextBeatRef.current = audio.currentTime + 0.06;
      metronomeBeatRef.current = 0;
      setMetronomeOn(true);
    } catch (err) {
      console.error("Metronome error:", err);
    }
  }

  useEffect(() => {
    if (!metronomeOn) return undefined;

    const scheduleClick = (audio, time, accented) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(accented ? 1320 : 880, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.18, time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.06);
    };

    const timer = window.setInterval(() => {
      const audio = audioCtxRef.current;
      if (!audio || audio.state !== "running") return;
      while (metronomeNextBeatRef.current < audio.currentTime + 0.12) {
        const beat = metronomeBeatRef.current % 4;
        scheduleClick(audio, metronomeNextBeatRef.current, beat === 0);
        metronomeNextBeatRef.current += 60 / bpm;
        metronomeBeatRef.current += 1;
      }
    }, 25);

    return () => window.clearInterval(timer);
  }, [metronomeOn, bpm]);

  function togglePause() {
    const rawNow = performance.now() / 1000;
    if (!isPaused) {
      pausedAtRef.current = rawNow;
      pausedRef.current = true;
      setIsPaused(true);
      if (audioCtxRef.current && audioCtxRef.current.state === "running") {
        audioCtxRef.current.suspend();
      }
      exampleTimerRef.current.forEach(clearTimeout);
      exampleTimerRef.current = [];
    } else {
      totalPausedOffsetRef.current += rawNow - pausedAtRef.current;
      pausedRef.current = false;
      setIsPaused(false);
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
    }
  }

  function stopAllSound() {
    if (openTakeChordIndexRef.current >= 0) closeOpenTakeChord(performance.now());

    if (pausedRef.current) {
      totalPausedOffsetRef.current += performance.now() / 1000 - pausedAtRef.current;
      pausedRef.current = false;
      setIsPaused(false);
    }
    const ctx = audioCtxRef.current;
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      voicesRef.current.forEach(v => {
        v.vGain.gain.cancelScheduledValues(now);
        v.vGain.gain.setTargetAtTime(0, now, 0.03);
        v.active = false;
      });
    }
    exampleTimerRef.current.forEach(clearTimeout);
    exampleTimerRef.current = [];
    setActiveSlot(-1);
    setCurrentMidis([]);
    currentMidisRef.current = [];
  }

  function toggleSpacePlayStop() {
    if (currentMidisRef.current.length > 0 || pausedRef.current) {
      stopAllSound();
    } else {
      triggerChord(selectedRootRef.current, activeChordKeyRef.current);
    }
  }

  function triggerChord(rootPc, chordKey, slotIdx = -1) {
    const chordSpec = CHORD_MAP[chordKey];
    if (!chordSpec) return;

    if (pausedRef.current) {
      totalPausedOffsetRef.current += performance.now() / 1000 - pausedAtRef.current;
      pausedRef.current = false;
      setIsPaused(false);
    }

    const ctx = ensureAudioEngine();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const prevMidis = currentMidisRef.current;
    const nextMidis = solveVoiceLeading(
      prevMidis,
      rootPc,
      chordSpec.intervals,
      octave,
      smoothVoiceLeading
    );

    const glideSec = Math.max(0.005, glideMs / 1000);
    const strumSec = strumMs / 1000;

    voicesRef.current.forEach((voice, idx) => {
      const targetMidi = nextMidis[idx];
      const startAt = now + idx * strumSec;

      voice.vGain.gain.cancelScheduledValues(now);

      if (targetMidi !== undefined) {
        const targetFreq = midiToFreq(targetMidi);
        voice.oscs.forEach(({ osc, ratio }) => {
          osc.frequency.cancelScheduledValues(now);
          if (voice.active && prevMidis.length > 0) {
            const fromFreq = osc.frequency.value;
            const toFreq = targetFreq * ratio;
            const samples = 64;
            const curve = new Float32Array(samples);
            for (let i = 0; i < samples; i++) {
              const u = i / (samples - 1);
              const e = cubicBezierEase(GLIDE_EASE[0], GLIDE_EASE[1], GLIDE_EASE[2], GLIDE_EASE[3], u);
              curve[i] = fromFreq + (toFreq - fromFreq) * e;
            }
            try {
              osc.frequency.setValueCurveAtTime(curve, startAt, glideSec);
            } catch {
              osc.frequency.setValueAtTime(toFreq, startAt + glideSec);
            }
          } else {
            osc.frequency.setValueAtTime(targetFreq * ratio, startAt);
          }
        });
        voice.baseFreq = targetFreq;
        voice.vGain.gain.setTargetAtTime(1 / Math.sqrt(nextMidis.length), startAt, 0.018);
        voice.active = true;
      } else {
        voice.vGain.gain.setTargetAtTime(0, now, 0.035);
        voice.active = false;
      }
    });

    const chordLabel = `${NOTE_NAMES[rootPc]}${chordSpec.suffix}`;
    setSelectedRoot(rootPc);
    setActiveChordKey(chordKey);
    setCurrentMidis(nextMidis);
    currentMidisRef.current = nextMidis;
    setActiveSlot(slotIdx);

    if (isRecordingRef.current) {
      const nowMs = performance.now();
      closeOpenTakeChord(nowMs);

      setTakeProgression(prev => {
        const next = [...prev, {
          id: `take-${Date.now()}-${prev.length}`,
          root: rootPc,
          type: chordSpec.label,
          inversion: 0,
          octave,
          notes: nextMidis,
          fromMidis: prevMidis.length ? [...prevMidis] : [...nextMidis],
          glideSec,
          ease: [...GLIDE_EASE],
          chordKey,
          label: chordLabel,
          bpm,
          capturedAt: nowMs,
          durationBeats: msToBeats(300)
        }];
        openTakeChordIndexRef.current = next.length - 1;
        chordStartedAtRef.current = nowMs;
        return next;
      });
    }

    timelineEventsRef.current.push({
      time: getTimelineNow(),
      fromMidis: prevMidis.length ? prevMidis : nextMidis,
      toMidis: nextMidis,
      glideSec,
      label: chordLabel
    });
    if (timelineEventsRef.current.length > 48) {
      timelineEventsRef.current.shift();
    }

    setRecentChords(prev => [...prev, chordLabel].slice(-8));
  }

  function handleKeyRelease() {
    if (ringUntilNext || pausedRef.current) return;
    if (openTakeChordIndexRef.current >= 0) closeOpenTakeChord(performance.now());

    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    voicesRef.current.forEach(v => {
      v.vGain.gain.cancelScheduledValues(now);
      v.vGain.gain.setTargetAtTime(0, now, 0.04);
      v.active = false;
    });
    setCurrentMidis([]);
    currentMidisRef.current = [];
  }

  function playExample() {
    stopAllSound();
    const stepMs = (60 / bpm) * 1000 * 2;
    EXAMPLE_PROGRESSION.forEach((step, idx) => {
      const timer = setTimeout(() => {
        triggerChord(step.root, step.chordKey, idx);
      }, idx * stepMs);
      exampleTimerRef.current.push(timer);
    });
  }

  function copyChords() {
    const text = recentChords.length
      ? recentChords.join(" - ")
      : EXAMPLE_PROGRESSION.map(s => `${NOTE_NAMES[s.root]}${CHORD_MAP[s.chordKey].suffix}`).join(" - ");
    navigator.clipboard?.writeText(text);
  }

  async function startRecording() {
    try {
      const ctx = ensureAudioEngine();
      if (ctx.state === "suspended") await ctx.resume();
      if (!destNodeRef.current) return;

      recordedChunksRef.current = [];
      const stream = destNodeRef.current.stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const id = `rec-${Date.now()}`;
        const name = `Take ${recordings.length + 1} · ${new Date().toLocaleTimeString()}`;
        const entry = {
          id,
          name,
          createdAt: Date.now(),
          bpm,
          chords: [...recentChords],
          mime,
          blobUrl: URL.createObjectURL(blob),
          size: blob.size
        };
        setRecordings(prev => {
          const next = [entry, ...prev].slice(0, 40);
          try {
            localStorage.setItem(
              "kevin-studio-projects",
              JSON.stringify(next.map(({ blobUrl, ...meta }) => meta))
            );
          } catch {}
          return next;
        });
        setExportStatus(`Saved “${name}” to Projects`);
        setTimeout(() => setExportStatus(""), 3200);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setTakeProgression([]);
      openTakeChordIndexRef.current = -1;
      chordStartedAtRef.current = 0;
      setIsRecording(true);
      setExportStatus("● Recording…");
    } catch (err) {
      console.error("Record start failed:", err);
      setExportStatus("Recording failed — check mic/audio permissions");
    }
  }

  function stopRecording() {
    if (openTakeChordIndexRef.current >= 0) closeOpenTakeChord(performance.now());
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  function toggleRecord() {
    if (isRecording) stopRecording();
    else startRecording();
  }

  async function exportCurrentAsWav() {
    if (!currentMidisRef.current.length && !timelineEventsRef.current.length) {
      setExportStatus("Nothing to export — play a chord first");
      return;
    }
    setExportStatus("Rendering WAV…");
    try {
      const duration = Math.max(2.5, (glideMs / 1000) + 1.8);
      const sampleRate = 44100;
      const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
      const midis = currentMidisRef.current.length
        ? currentMidisRef.current
        : timelineEventsRef.current[timelineEventsRef.current.length - 1]?.toMidis || [];

      const preset = SYNTH_PRESETS[soundPreset] || SYNTH_PRESETS.organ;
      const master = offline.createGain();
      master.gain.value = Math.pow(10, volumeDb / 20) * 0.28;
      master.connect(offline.destination);

      midis.forEach((midi, idx) => {
        const start = idx * (strumMs / 1000);
        preset.ratios.forEach((ratio, hi) => {
          const osc = offline.createOscillator();
          const g = offline.createGain();
          osc.type = preset.type;
          osc.frequency.value = midiToFreq(midi) * ratio;
          g.gain.setValueAtTime(0, start);
          g.gain.linearRampToValueAtTime(preset.harmonics[hi] / Math.sqrt(midis.length), start + 0.02);
          g.gain.setValueAtTime(preset.harmonics[hi] / Math.sqrt(midis.length), duration - 0.35);
          g.gain.linearRampToValueAtTime(0, duration - 0.02);
          osc.connect(g);
          g.connect(master);
          osc.start(start);
          osc.stop(duration);
        });
      });

      const rendered = await offline.startRendering();
      const blob = writeWav(rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kevin-studio-${NOTE_NAMES[selectedRoot]}${CHORD_MAP[activeChordKey]?.suffix || ""}-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus("WAV exported");
      setTimeout(() => setExportStatus(""), 2500);
    } catch (err) {
      console.error(err);
      setExportStatus("Export failed");
    }
  }

  function exportRecording(entry) {
    if (!entry?.blobUrl) {
      setExportStatus("Recording data not available in this session");
      return;
    }
    const a = document.createElement("a");
    a.href = entry.blobUrl;
    a.download = `${entry.name.replace(/[^\w.-]+/g, "_")}.webm`;
    a.click();
    setExportStatus(`Downloaded “${entry.name}”`);
    setTimeout(() => setExportStatus(""), 2200);
  }

  useEffect(() => {
    const onKeyDown = e => {
      if (e.repeat) return;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (pianoRollOpen) return;

      if (e.code in NUMPAD_SOUND_KEYS) {
        e.preventDefault();
        setSoundPreset(NUMPAD_SOUND_KEYS[e.code]);
        setSoundBankOpen(false);
        return;
      }
      if (e.code === "Numpad0") {
        e.preventDefault();
        setSoundBankOpen(prev => !prev);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        toggleSpacePlayStop();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (soundBankOpen) setSoundBankOpen(false);
        else if (isRecording) stopRecording();
        else stopAllSound();
        return;
      }
      if (e.key.toLowerCase() === "r" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleRecord();
        return;
      }

      const key = e.key.toLowerCase();
      if (key in ROOT_KEYS) {
        e.preventDefault();
        let rootPc = ROOT_KEYS[key];
        if (e.shiftKey) rootPc = (rootPc + 1) % 12;
        setSelectedRoot(rootPc);
        selectedRootRef.current = rootPc;
        if (letterReplaysLast) triggerChord(rootPc, activeChordKeyRef.current);
        return;
      }
      if (key in CHORD_MAP) {
        e.preventDefault();
        triggerChord(selectedRootRef.current, key);
      }
    };

    const onKeyUp = e => {
      const key = e.key.toLowerCase();
      if (key in CHORD_MAP) handleKeyRelease();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [octave, glideMs, strumMs, smoothVoiceLeading, letterReplaysLast, ringUntilNext, pianoRollOpen, isRecording, bpm]);

  useEffect(() => {
    return () => {
      exampleTimerRef.current.forEach(clearTimeout);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    let rafId;
    const colors = ["#f0c879", "#55d9c7", "#80aee8", "#c29ae9", "#ed6868", "#a6cb65"];
    const pxPerSec = 150;
    const windowSec = 9;

    const smoothstep = (t) => {
      const x = Math.min(1, Math.max(0, t));
      return x * x * (3 - 2 * x);
    };

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(300, Math.round(rect.width || 760));
      const h = Math.max(150, Math.round(rect.height || 180));

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "middle";

      const nowSec = getTimelineNow();
      const playheadX = w - 72;

      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = "#182230";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 5; i++) {
        const y = (h / 6) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(playheadX, y);
        ctx.stroke();
      }

      const beatSec = 60 / Math.max(40, bpm);
      const firstGrid = Math.floor((nowSec - windowSec) / beatSec) * beatSec;
      for (let t = firstGrid; t <= nowSec + 0.02; t += beatSec) {
        const gx = playheadX - (nowSec - t) * pxPerSec;
        if (gx < 0 || gx > playheadX) continue;
        ctx.strokeStyle = Math.round(t / beatSec) % 4 === 0 ? "#2a3d52" : "#1a2533";
        ctx.beginPath();
        ctx.moveTo(gx, 18);
        ctx.lineTo(gx, h - 4);
        ctx.stroke();
      }

      ctx.strokeStyle = "#3d5368";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, 16);
      ctx.lineTo(playheadX, h - 4);
      ctx.stroke();

      const events = timelineEventsRef.current;
      if (!events.length) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const minMidi = 42;
      const maxMidi = 84;
      const toY = (m) => h - 18 - ((m - minMidi) / (maxMidi - minMidi)) * (h - 44);
      const toX = (t) => playheadX - (nowSec - t) * pxPerSec;

      let lastLabelRight = -Infinity;
      events.forEach((ev, idx) => {
        const ex = toX(ev.time);
        if (ex < -30 || ex > playheadX + 4) return;
        const isLatest = idx === events.length - 1;
        ctx.font = "700 12px 'Space Grotesk', system-ui, sans-serif";
        const label = ev.label || "";
        const tw = ctx.measureText(label).width;
        const drawX = Math.max(ex, lastLabelRight + 8);
        if (drawX > playheadX - 4) return;
        ctx.fillStyle = isLatest ? "#ffffff" : "#9db1c7";
        ctx.fillText(label, drawX, 11);
        lastLabelRight = drawX + tw;
      });

      const latest = events[events.length - 1];

      const pitchAt = (v, t) => {
        let ev = events[0];
        for (let i = 0; i < events.length; i++) {
          const start = events[i].time;
          const end = i + 1 < events.length ? events[i + 1].time : nowSec + 1;
          if (t >= start && t < end) {
            ev = events[i];
            break;
          }
          if (i === events.length - 1) ev = events[i];
        }
        const fromArr = ev.fromMidis || [];
        const toArr = ev.toMidis || [];
        const m1 = toArr[Math.min(v, Math.max(0, toArr.length - 1))];
        const m0 = fromArr[Math.min(v, Math.max(0, fromArr.length - 1))];
        if (m1 === undefined && m0 === undefined) return null;
        const a = m0 !== undefined ? m0 : m1;
        const b = m1 !== undefined ? m1 : m0;
        const g = Math.max(0.001, ev.glideSec || 0.01);
        const u = smoothstep((t - ev.time) / g);
        return a + (b - a) * u;
      };

      for (let v = 0; v < MAX_VOICES; v++) {
        let any = false;
        for (const ev of events) {
          if ((ev.toMidis && ev.toMidis[v] !== undefined) || (ev.fromMidis && ev.fromMidis[v] !== undefined)) {
            any = true;
            break;
          }
        }
        if (!any) continue;

        const color = colors[v % colors.length];
        const samples = [];
        const tStart = Math.max(events[0].time, nowSec - windowSec);
        const tEnd = nowSec;
        const steps = Math.max(40, Math.ceil((tEnd - tStart) * 60));

        for (let s = 0; s <= steps; s++) {
          const t = tStart + (s / steps) * (tEnd - tStart);
          const p = pitchAt(v, t);
          if (p == null) continue;
          samples.push({ x: toX(t), y: toY(p) });
        }

        const liveP = pitchAt(v, nowSec);
        if (liveP != null) {
          if (samples.length) {
            samples[samples.length - 1] = { x: playheadX, y: toY(liveP) };
          } else {
            samples.push({ x: playheadX, y: toY(liveP) });
          }
        }

        if (samples.length < 2) continue;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 11;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();

        let moved = false;
        for (let i = 0; i < samples.length; i++) {
          let { x, y } = samples[i];
          if (x < 0) {
            if (i + 1 < samples.length && samples[i + 1].x >= 0) {
              const a = samples[i];
              const b = samples[i + 1];
              const u = (0 - a.x) / (b.x - a.x || 1);
              x = 0;
              y = a.y + (b.y - a.y) * u;
            } else {
              continue;
            }
          }
          if (x > playheadX) {
            x = playheadX;
          }
          if (!moved) {
            ctx.moveTo(x, y);
            moved = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        if (moved && liveP != null) {
          ctx.lineTo(playheadX, toY(liveP));
        }
        if (moved) ctx.stroke();
        ctx.restore();
      }

      const elapsed = nowSec - latest.time;
      const glide = Math.max(0.001, latest.glideSec || 0.01);
      const pulse = 1 + 0.14 * Math.sin(performance.now() * 0.009);

      const dotItems = [];
      const n = Math.max((latest.toMidis || []).length, (latest.fromMidis || []).length);
      for (let v = 0; v < n; v++) {
        const live = pitchAt(v, nowSec);
        if (live == null) continue;
        const m1 = (latest.toMidis || [])[v];
        dotItems.push({
          v,
          live,
          dotY: toY(live),
          labelY: toY(live),
          color: colors[v % colors.length],
          text: midiToName(m1 !== undefined ? m1 : live)
        });
      }

      dotItems.sort((a, b) => b.dotY - a.dotY);
      const minGap = 17;
      for (let i = 1; i < dotItems.length; i++) {
        if (dotItems[i - 1].labelY - dotItems[i].labelY < minGap) {
          dotItems[i].labelY = dotItems[i - 1].labelY - minGap;
        }
      }
      if (dotItems.length && dotItems[dotItems.length - 1].labelY < 24) {
        const shift = 24 - dotItems[dotItems.length - 1].labelY;
        dotItems.forEach((d) => { d.labelY += shift; });
      }

      const showDots =
        currentMidisRef.current.length > 0 ||
        pausedRef.current ||
        elapsed < glide + 0.1;

      if (showDots) {
        dotItems.forEach(({ dotY, labelY, color, text }) => {
          const grad = ctx.createRadialGradient(playheadX, dotY, 1, playheadX, dotY, 18 * pulse);
          grad.addColorStop(0, color);
          grad.addColorStop(0.45, color + "77");
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(playheadX, dotY, 18 * pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(playheadX, dotY, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(playheadX, dotY, 2.4, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = "700 11px 'Space Grotesk', system-ui, sans-serif";
          const textW = ctx.measureText(text).width;
          const pillX = playheadX + 12;
          const pillY = labelY - 8;
          ctx.fillStyle = "rgba(9, 14, 20, 0.9)";
          ctx.strokeStyle = color + "88";
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(pillX, pillY, textW + 10, 16, 4);
          else ctx.rect(pillX, pillY, textW + 10, 16);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.fillText(text, pillX + 5, labelY + 0.5);
        });
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [bpm]);

  const miniPianoKeys = useMemo(() => {
    const keys = [];
    for (let m = 48; m <= 83; m++) {
      keys.push({ midi: m, isBlack: [1, 3, 6, 8, 10].includes(m % 12) });
    }
    return keys;
  }, []);
  const whiteKeys = miniPianoKeys.filter(k => !k.isBlack);
  const currentChordObj = CHORD_MAP[activeChordKey];

  const pianoRollProgression = useMemo(() => {
    if (takeProgression.length >= 1) return takeProgression;
    return EXAMPLE_PROGRESSION.map((step, index) => {
      const spec = CHORD_MAP[step.chordKey];
      const baseMidi = (octave + 1) * 12 + step.root;
      const notes = (spec?.intervals || [0, 4, 7]).map(iv => baseMidi + iv);
      return {
        id: `rs-example-${index}`,
        root: step.root,
        type: spec?.label || "maj",
        inversion: 0,
        octave,
        notes
      };
    });
  }, [takeProgression, octave]);

  return (
    <div className="rs-shell">
      <div className="rs-topbar">
        <div className="rs-title-group">
          <h2>Recording Studio · Live Glide Engine</h2>
          <p>
            Root keys (A–J) + chord keys · Numpad 1–9 sounds · Space play/stop ·{" "}
            <strong>Ctrl/Cmd+R</strong> record · Export WAV
          </p>
        </div>
        <div className="rs-modes">
          <button
            className={pianoRollOpen ? "active" : ""}
            onClick={() => {
              stopAllSound();
              setPianoRollOpen(true);
            }}
            title="Open the Piano Roll with what you've played (while Record was armed)"
          >
            Piano Roll
          </button>
          <button className={isPlaying ? "active" : ""} onClick={toggleSpacePlayStop}>
            {isPlaying ? "■ Stop (Space)" : "▶ Play (Space)"}
          </button>
          <button onClick={playExample}>Play example</button>
          <button className={isPaused ? "paused" : ""} onClick={togglePause}>
            {isPaused ? "▶ Resume" : "Ⅱ Pause"}
          </button>
          <button
            className={`rs-record-btn ${isRecording ? "recording" : ""}`}
            onClick={toggleRecord}
            title="Record to Piano Roll + Projects (Ctrl/Cmd+R)"
          >
            {isRecording ? "■ Stop Rec" : "● Record"}
          </button>
          <button className="rs-export-btn" onClick={exportCurrentAsWav} title="Export current chord as WAV">
            Export WAV
          </button>
        </div>
        <span className="rs-status-pill">
          {isRecording
            ? `● RECORDING · ${takeProgression.length} chord${takeProgression.length === 1 ? "" : "s"} captured`
            : isPaused
              ? "Ⅱ PAUSED"
              : isPlaying
                ? "● PLAYING"
                : pianoRollOpen
                  ? "● PIANO ROLL"
                  : "● QWERTY + NUMPAD READY"}
        </span>
      </div>

      {exportStatus && <div className="rs-toast">{exportStatus}</div>}

      <TempoControls
        bpm={bpm}
        setBpm={setBpm}
        metronomeOn={metronomeOn}
        onToggleMetronome={toggleMetronome}
      />

      <>
        <div className="rs-stage">
          <div className="rs-readout">
            <div>
              <small>PLAYING · {(SYNTH_PRESETS[soundPreset] || SYNTH_PRESETS.organ).label.toUpperCase()}</small>
              <div className="rs-chord-big">
                {NOTE_NAMES[selectedRoot]}
                <span>{currentChordObj?.suffix || ""}</span>
              </div>
              <div className="rs-notes-sub">
                {currentMidis.length ? currentMidis.map(midiToName).join("  ·  ") : "Press Space or any chord key"}
              </div>
            </div>
            <div className="rs-root-badge">
              <strong>{NOTE_NAMES[selectedRoot]}</strong>
              <span>Root · Spacebar toggles Play / Stop</span>
            </div>
          </div>
          <div className="rs-canvas-wrap">
            <canvas ref={canvasRef} className="rs-canvas" />
          </div>
        </div>

        <div className="rs-piano">
          {whiteKeys.map(k => {
            const isLit = currentMidis.includes(k.midi);
            const isRootKey = isLit && (k.midi % 12) === selectedRoot;
            return (
              <div
                key={k.midi}
                className={`rs-pkey-w ${isLit ? (isRootKey ? "lit-root" : "lit") : ""}`}
              />
            );
          })}
          {miniPianoKeys.map((k, idx) => {
            if (!k.isBlack) return null;
            const whitesBefore = miniPianoKeys.slice(0, idx).filter(x => !x.isBlack).length;
            const widthPct = (100 / whiteKeys.length) * 0.62;
            const leftPct = (whitesBefore / whiteKeys.length) * 100 - widthPct / 2;
            const isLit = currentMidis.includes(k.midi);
            const isRootKey = isLit && (k.midi % 12) === selectedRoot;
            return (
              <div
                key={k.midi}
                className={`rs-pkey-b ${isLit ? (isRootKey ? "lit-root" : "lit") : ""}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            );
          })}
        </div>

        <div className="rs-pads-row">
          {EXAMPLE_PROGRESSION.map((slot, idx) => {
            const label = `${NOTE_NAMES[slot.root]}${CHORD_MAP[slot.chordKey].suffix}`;
            return (
              <button
                key={idx}
                className={`rs-pad ${activeSlot === idx ? "active" : ""}`}
                onClick={() => triggerChord(slot.root, slot.chordKey, idx)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="rs-deck-grid" style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "12px", alignItems: "stretch" }}>
          <div className="rs-qwerty">
            {KEYBOARD_ROWS.map((row, rIdx) => (
              <div key={rIdx} className="rs-qrow">
                {row.map(keyChar => {
                  const isRoot = keyChar in ROOT_KEYS;
                  const isChord = keyChar in CHORD_MAP;
                  const rootPc = ROOT_KEYS[keyChar];
                  const isActiveRoot = isRoot && selectedRoot === rootPc;
                  const isActiveChord = isChord && activeChordKey === keyChar && currentMidis.length > 0;
                  let subLabel = "";
                  if (isRoot) subLabel = NOTE_NAMES[rootPc];
                  else if (isChord) subLabel = CHORD_MAP[keyChar].label;
                  return (
                    <button
                      key={keyChar}
                      className={`rs-qkey ${isRoot ? "root" : ""} ${isChord ? "chord" : ""} ${
                        isActiveRoot || isActiveChord ? "active" : ""
                      }`}
                      onMouseDown={() => {
                        if (isRoot) {
                          setSelectedRoot(rootPc);
                          selectedRootRef.current = rootPc;
                          if (letterReplaysLast) triggerChord(rootPc, activeChordKeyRef.current);
                        } else if (isChord) {
                          triggerChord(selectedRootRef.current, keyChar);
                        }
                      }}
                    >
                      <strong>{keyChar.toUpperCase()}</strong>
                      <span>{subLabel}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="rs-qrow">
              <button
                className={`rs-qkey utility ${isPlaying ? "active" : ""}`}
                style={{ maxWidth: "240px", borderColor: isPlaying ? "#ed6868" : "#55d9c7", color: isPlaying ? "#ed6868" : "#55d9c7" }}
                onMouseDown={toggleSpacePlayStop}
              >
                <strong>SPACEBAR</strong>
                <span>{isPlaying ? "Stop sound" : "Play chord"}</span>
              </button>
              <button className={`rs-qkey utility ${isPaused ? "paused" : ""}`} onMouseDown={togglePause}>
                <strong>{isPaused ? "RESUME" : "PAUSE"}</strong>
                <span>{isPaused ? "Continue" : "Freeze glide"}</span>
              </button>
            </div>
          </div>

          <div className="rs-numpad-panel" style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "12px", background: "#090e14", border: "1px solid #202b38", borderRadius: "12px" }}>
            <div style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "1.2px", color: "#77899c", textAlign: "center", marginBottom: "6px" }}>
              NUMPAD SOUNDS (1–9)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
              {NUMPAD_DISPLAY.map(item => {
                const active = soundPreset === item.preset;
                return (
                  <button
                    key={item.code}
                    className={`rs-qkey sound ${active ? "active" : ""}`}
                    style={{ maxWidth: "none", height: "44px" }}
                    onMouseDown={() => {
                      setSoundPreset(item.preset);
                      setSoundBankOpen(false);
                    }}
                  >
                    <strong>{item.num}</strong>
                    <span>{SYNTH_PRESETS[item.preset].label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ position: "relative", marginTop: "6px" }}>
              <button
                className={`rs-qkey sound ${soundBankOpen ? "active" : ""}`}
                style={{ width: "100%", maxWidth: "none", height: "42px", borderColor: "#55d9c7" }}
                onMouseDown={() => setSoundBankOpen(prev => !prev)}
              >
                <strong>NUM 0 · MORE SOUNDS ▾</strong>
                <span>Choirs &amp; Extra Bank</span>
              </button>
              {soundBankOpen && (
                <div style={{
                  position: "absolute", bottom: "48px", right: 0, width: "240px",
                  background: "#101824", border: "1px solid #55d9c7", borderRadius: "9px",
                  padding: "8px", zIndex: 30, boxShadow: "0 10px 28px rgba(0,0,0,0.75)"
                }}>
                  <div style={{ fontSize: "9px", fontWeight: 800, color: "#55d9c7", letterSpacing: "1px", padding: "4px 6px" }}>
                    SOUND &amp; CHOIR BANK (PRESS 0)
                  </div>
                  {EXTRA_SOUND_BANK.map(opt => (
                    <button
                      key={opt.id}
                      onMouseDown={() => { setSoundPreset(opt.id); setSoundBankOpen(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                        marginTop: "4px", borderRadius: "6px", border: "1px solid #263547",
                        background: soundPreset === opt.id ? "#183634" : "#151f2c",
                        color: soundPreset === opt.id ? "#55d9c7" : "#e6edf5",
                        fontSize: "11px", fontWeight: 700
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rs-controls">
          <div className="rs-col">
            <label className="rs-lbl">ACTIVE SOUND (NUMPAD 1–9 / 0)</label>
            <select className="rs-select" value={soundPreset} onChange={e => setSoundPreset(e.target.value)}>
              {Object.entries(SYNTH_PRESETS).map(([id, preset]) => (
                <option key={id} value={id}>{preset.label}</option>
              ))}
            </select>
            <label className="rs-check">
              <input type="checkbox" checked={playOwnSound} onChange={e => setPlayOwnSound(e.target.checked)} />
              Play its own sound
            </label>
            <label className="rs-check">
              <input type="checkbox" checked={smoothVoiceLeading} onChange={e => setSmoothVoiceLeading(e.target.checked)} />
              Smooth voice leading
            </label>
            <label className="rs-check">
              <input type="checkbox" checked={ringUntilNext} onChange={e => setRingUntilNext(e.target.checked)} />
              Ring until the next chord
            </label>
            <label className="rs-check">
              <input type="checkbox" checked={letterReplaysLast} onChange={e => setLetterReplaysLast(e.target.checked)} />
              A letter replays the last chord type
            </label>
          </div>
          <div className="rs-col">
            <label className="rs-lbl">GLIDE BETWEEN CHORDS</label>
            <div className="rs-slider-row">
              <span>Glide time</span>
              <input type="range" min="0" max="800" step="10" value={glideMs} onChange={e => setGlideMs(Number(e.target.value))} />
              <strong>{glideMs} ms</strong>
            </div>
            <div className="rs-slider-row">
              <span>Strum</span>
              <input type="range" min="0" max="120" step="5" value={strumMs} onChange={e => setStrumMs(Number(e.target.value))} />
              <strong>{strumMs} ms</strong>
            </div>
            <div className="rs-slider-row">
              <span>Volume</span>
              <input type="range" min="-30" max="0" step="1" value={volumeDb} onChange={e => setVolumeDb(Number(e.target.value))} />
              <strong>{volumeDb} dB</strong>
            </div>
            <div className="rs-slider-row">
              <span>Reverb</span>
              <input type="range" min="0" max="100" step="1" value={reverbPct} onChange={e => setReverbPct(Number(e.target.value))} />
              <strong>{reverbPct}%</strong>
            </div>
          </div>
          <div className="rs-col">
            <label className="rs-lbl">OCTAVE & ACTIONS</label>
            <div className="rs-oct-row">
              <span style={{ fontSize: 12, color: "#aebecd" }}>Base Octave</span>
              <div className="rs-oct-btns">
                <button onClick={() => setOctave(o => Math.max(2, o - 1))}>−</button>
                <strong>C{octave}</strong>
                <button onClick={() => setOctave(o => Math.min(5, o + 1))}>+</button>
              </div>
            </div>
            <div className="rs-action-btns">
              <button onClick={playExample}>Play the example</button>
              <button onClick={copyChords}>Copy chords</button>
              <button
                onClick={() => {
                  setTakeProgression([]);
                  openTakeChordIndexRef.current = -1;
                  chordStartedAtRef.current = 0;
                }}
                title="Clear what has been captured into the Piano Roll"
              >
                Clear Take
              </button>
            </div>
          </div>
        </div>
      </>

      <div className="rs-projects">
        <div className="rs-projects-head">
          <div>
            <span className="rs-lbl">PROJECTS WORKSPACE</span>
            <h3>Saved Recordings</h3>
          </div>
          <span className="rs-projects-count">{recordings.length} take{recordings.length === 1 ? "" : "s"}</span>
        </div>
        {recordings.length === 0 ? (
          <p className="rs-projects-empty">
            Press <strong>● Record</strong> (or Ctrl/Cmd+R) while playing. Takes are saved here and can be exported.
          </p>
        ) : (
          <ul className="rs-projects-list">
            {recordings.map(rec => (
              <li key={rec.id}>
                <div>
                  <strong>{rec.name}</strong>
                  <small>
                    {rec.bpm} BPM · {(rec.size / 1024).toFixed(1)} KB ·{" "}
                    {rec.chords?.length ? rec.chords.join(" → ") : "—"}
                  </small>
                </div>
                <div className="rs-projects-actions">
                  {rec.blobUrl && (
                    <audio controls src={rec.blobUrl} preload="metadata" />
                  )}
                  <button onClick={() => exportRecording(rec)}>Download</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rs-footer-bar">
        <span>
          RECENT:{" "}
          <strong>
            {recentChords.length ? recentChords.join(" – ") : "Press a letter + chord key"}
          </strong>
        </span>
        <span>
          Record → Piano Roll · Numpad 1–9 = Sounds · Record → Projects · Export WAV · Piano Roll opens with the captured take
        </span>
      </div>

      {pianoRollOpen && (
        <VoiceMapper
          progression={pianoRollProgression}
          bpm={bpm}
          onBpmChange={setBpm}
          onClose={() => setPianoRollOpen(false)}
        />
      )}
    </div>
  );
}