import "./VoiceMapper.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LOW = 36;
const HIGH = 83;
const BASE_ROW = 18;
const BASE_BEAT = 42;
const VEL_PANEL_HEIGHT = 96;
const VEL_BAR_MAX = VEL_PANEL_HEIGHT - 10;
const SNAP_OPTIONS = [
  { id: "off", label: "Off", step: 0 },
  { id: "bar", label: "Bar", step: 4 },
  { id: "beat", label: "1/1 Beat", step: 1 },
  { id: "1/2", label: "1/2 Beat", step: 0.5 },
  { id: "1/4", label: "1/4 Beat", step: 0.25 },
  { id: "1/8", label: "1/8 Beat", step: 0.125 },
  { id: "1/16", label: "1/16 Beat", step: 0.0625 },
  { id: "1/3", label: "1/3 Beat", step: 1 / 3 },
  { id: "1/6", label: "1/6 Beat", step: 1 / 6 },
];
const KEYBOARD_WIDTH = 65;
const NOTE_COLORS = ["#61cfc3", "#80aee8", "#c29ae9", "#e6b76c"];

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = midi => noteNames[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function snapTo(value, step) {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}
function snapFloor(value, step) {
  if (!step || step <= 0) return value;
  return Math.floor(value / step + 1e-9) * step;
}

function snapNote(note, step, beatsPerChord) {
  if (!step || step <= 0) return note;
  const abs = note.chordIndex * beatsPerChord + note.beat;
  const snappedAbs = Math.max(0, snapTo(abs, step));
  const snappedDur = Math.max(step, snapTo(note.duration, step));
  const chordIndex = Math.floor(snappedAbs / beatsPerChord + 1e-9);
  const beat = Math.max(0, snappedAbs - chordIndex * beatsPerChord);
  return { ...note, chordIndex, beat, duration: snappedDur };
}

function noteDotColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${(hash * 137) % 360} 88% 66%)`;
}

function cubicBezierEase(ax, ay, bx, by, p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let t = p;
  for (let i = 0; i < 24; i++) {
    const x = 3 * (1 - t) * (1 - t) * t * ax + 3 * (1 - t) * t * t * bx + t * t * t;
    if (x < p) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return 3 * (1 - t) * (1 - t) * t * ay + 3 * (1 - t) * t * t * by + t * t * t;
}

function hermiteD(knots, u) {
  let i = 0;
  while (i < knots.length - 2 && u > knots[i + 1].p) i++;
  const k0 = knots[i];
  const k1 = knots[i + 1];
  const h = Math.max(1e-6, k1.p - k0.p);
  const t = clamp((u - k0.p) / h, 0, 1);
  const slope = index => {
    if (index <= 0 || index >= knots.length - 1) return 0;
    const a = knots[index - 1];
    const b = knots[index + 1];
    return (b.d - a.d) / Math.max(1e-6, b.p - a.p);
  };
  const m0 = slope(i);
  const m1 = slope(i + 1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * k0.d + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * k1.d + (t3 - t2) * h * m1;
}

const SOLFEGE = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
const GUITAR_STRINGS = [40, 45, 50, 55, 59, 64];

function findGuitarShape(midis) {
  if (!midis.length) return null;
  const pcs = [...new Set(midis.map(m => ((m % 12) + 12) % 12))];
  const bassPc = ((midis[0] % 12) + 12) % 12;
  const required = Math.min(3, pcs.length);
  let best = null;

  for (let lo = 1; lo <= 12; lo++) {
    const hi = lo + 3;
    const allowOpen = lo === 1;
    const options = GUITAR_STRINGS.map(open => {
      const list = [null];
      if (allowOpen && pcs.includes(open % 12)) list.push(0);
      for (let fret = lo; fret <= hi; fret++) {
        if (pcs.includes((open + fret) % 12)) list.push(fret);
      }
      return list;
    });

    const choice = new Array(6).fill(null);
    const visit = index => {
      if (index === 6) {
        const played = [];
        choice.forEach((fret, i) => { if (fret !== null) played.push(i); });
        if (played.length < required) return;
        const covered = new Set(played.map(i => (GUITAR_STRINGS[i] + choice[i]) % 12));
        const first = played[0];
        const last = played[played.length - 1];
        let mutedInside = 0;
        for (let i = first; i <= last; i++) if (choice[i] === null) mutedInside++;
        const fretted = played.filter(i => choice[i] > 0);
        const frets = fretted.map(i => choice[i]);
        const minFret = frets.length ? Math.min(...frets) : 0;
        const maxFret = frets.length ? Math.max(...frets) : 0;
        const atMin = frets.filter(f => f === minFret).length;
        const fingers = frets.length - atMin + (atMin >= 2 ? 1 : atMin);
        let score = covered.size * 100 + played.length * 6 - mutedInside * 12 - (maxFret - minFret) * 2 - lo * 2.5 - Math.max(0, fingers - 4) * 40;
        if ((GUITAR_STRINGS[first] + choice[first]) % 12 === bassPc) score += 30;
        if (!best || score > best.score) best = { score, frets: [...choice] };
        return;
      }
      for (const option of options[index]) {
        choice[index] = option;
        visit(index + 1);
      }
      choice[index] = null;
    };
    visit(0);
  }

  if (!best) return null;
  const fretted = best.frets.filter(f => f !== null && f > 0);
  const hasOpen = best.frets.some(f => f === 0);
  const lo = hasOpen || !fretted.length ? 1 : Math.min(...fretted);
  const missing = pcs.filter(pc => !best.frets.some((f, i) => f !== null && (GUITAR_STRINGS[i] + f) % 12 === pc));
  return { frets: best.frets, lo, missing };
}

function GuitarChord({ shape, nameOf }) {
  if (!shape) return <p className="vm-guitar-empty">Select notes or press play to see a guitar shape.</p>;
  const left = 30;
  const top = 26;
  const gap = 20;
  const rows = 4;
  const x = i => left + i * gap;
  const rowY = r => top + r * gap;
  const width = left + gap * 5 + 14;
  const height = top + rows * gap + 26;
  return (
    <div className="vm-guitar-diagram">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Guitar chord shape">
        {Array.from({ length: rows + 1 }, (_, r) => (
          <line key={`f${r}`} x1={x(0)} x2={x(5)} y1={rowY(r)} y2={rowY(r)} className={r === 0 && shape.lo === 1 ? "vm-g-nut" : "vm-g-fret"} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`s${i}`} x1={x(i)} x2={x(i)} y1={top} y2={rowY(rows)} className="vm-g-string" />
        ))}
        {shape.lo > 1 && <text x="3" y={top + gap * 0.68} className="vm-g-fretnum">{shape.lo}fr</text>}
        {shape.frets.map((fret, i) => {
          if (fret === null) return <text key={`m${i}`} x={x(i)} y={top - 8} textAnchor="middle" className="vm-g-mute">×</text>;
          if (fret === 0) return <circle key={`o${i}`} cx={x(i)} cy={top - 11} r="4" className="vm-g-open" />;
          return <circle key={`d${i}`} cx={x(i)} cy={rowY(fret - shape.lo) + gap / 2} r="7" className="vm-g-dot" />;
        })}
        {shape.frets.map((fret, i) => fret === null ? null : (
          <text key={`n${i}`} x={x(i)} y={rowY(rows) + 17} textAnchor="middle" className="vm-g-name">{nameOf(GUITAR_STRINGS[i] + fret, false)}</text>
        ))}
      </svg>
      {shape.missing.length > 0 && (
        <small className="vm-guitar-note">Can't fit: {shape.missing.map(pc => nameOf(60 + pc, false)).join(", ")}</small>
      )}
    </div>
  );
}

function makeInitialNotes(progression) {
  return progression.flatMap((chord, chordIndex) => {
    const notes = (chord.notes || []).map((midi, noteIndex) => ({
      id: `${chord.id}-note-${noteIndex}`,
      chordIndex,
      midi,
      beat: 0,
      duration: Number.isFinite(chord.durationBeats) && chord.durationBeats > 0
        ? chord.durationBeats
        : 2.2,
      velocity: 100,
      glideSec: Number.isFinite(chord.glideSec) ? chord.glideSec : null,
      ease: Array.isArray(chord.ease) && chord.ease.length === 4 ? chord.ease : null,
    }));
    
    // Shorten the notes so the glide line happens in the empty space before the next chord.
    const nextChord = progression[chordIndex + 1];
    if (nextChord && Number.isFinite(chord.glideSec) && chord.glideSec > 0) {
      const bpm = chord.bpm || 120;
      const beatSeconds = 60 / Math.max(1, bpm);
      const glideBeats = chord.glideSec / beatSeconds;
      
      notes.forEach(n => {
        n.duration = Math.max(0.1, n.duration - glideBeats);
      });
    }
    return notes;
  });
}

function makeAutomaticConnections(notes, chordCount) {
  const result = [];
  for (let chordIndex = 0; chordIndex < chordCount - 1; chordIndex++) {
    const current = notes.filter(note => note.chordIndex === chordIndex);
    const available = notes.filter(note => note.chordIndex === chordIndex + 1);
    current.forEach(source => {
      if (!available.length) return;
      let closest = 0;
      let distance = Infinity;
      available.forEach((target, index) => {
        const d = Math.abs(source.midi - target.midi);
        if (d < distance) { distance = d; closest = index; }
      });
      const target = available.splice(closest, 1)[0];
      result.push({ id: `${source.id}__${target.id}`, from: source.id, to: target.id });
    });
  }
  return result;
}

function buildVoices(notes, connections, startOf) {
  const byId = new Map(notes.map(note => [note.id, note]));
  const outgoing = new Map();
  const hasIncoming = new Set();
  connections.forEach(edge => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || startOf(to) <= startOf(from) + 0.001) return;
    if (!outgoing.has(from.id)) outgoing.set(from.id, []);
    outgoing.get(from.id).push(to);
    hasIncoming.add(to.id);
  });
  outgoing.forEach(list => list.sort((a, b) => startOf(a) - startOf(b) || a.midi - b.midi));

  const claimed = new Set();
  const voices = [];
  const follow = (voice, note) => {
    voice.stops.push({ note, body: true });
    claimed.add(note.id);
    (outgoing.get(note.id) || []).forEach((target, k) => {
      let carrier = voice;
      if (k > 0) {
        carrier = { stops: [], spawnFrom: note };
        voices.push(carrier);
      }
      if (!claimed.has(target.id)) follow(carrier, target);
      else carrier.stops.push({ note: target, body: false });
    });
  };

  notes
    .filter(note => !hasIncoming.has(note.id))
    .sort((a, b) => startOf(a) - startOf(b) || a.midi - b.midi)
    .forEach(note => {
      if (claimed.has(note.id)) return;
      const voice = { stops: [], spawnFrom: null };
      voices.push(voice);
      follow(voice, note);
    });
  notes.forEach(note => {
    if (claimed.has(note.id)) return;
    const voice = { stops: [], spawnFrom: null };
    voices.push(voice);
    follow(voice, note);
  });
  voices.forEach((voice, index) => {
    voice.index = index;
    voice.seed = voice.spawnFrom ? `#${index}` : "";
  });
  return voices;
}

function segmentAt(voice, t) {
  for (let i = voice.segments.length - 1; i >= 0; i--) {
    if (t >= voice.segments[i].t0) return voice.segments[i];
  }
  return voice.segments[0];
}

function voicePitchAt(voice, t) {
  const segment = segmentAt(voice, t);
  return segment.kind === "hold" ? segment.note.midi : segment.g.pitchAtTime(t);
}

export default function VoiceMapper({ progression = [], bpm = 120, onClose }) {
  const [notes, setNotes] = useState(() => makeInitialNotes(progression));
  const [connections, setConnections] = useState(() => {
    const initial = makeInitialNotes(progression);
    return makeAutomaticConnections(initial, progression.length);
  });
  const [selectedNote, setSelectedNote] = useState(null);
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [connectionSource, setConnectionSource] = useState(null);
  const [tool, setTool] = useState("select");
  const [glideMode, setGlideMode] = useState("auto");
  const [selectedGlide, setSelectedGlide] = useState(null);
  const [freehandPath, setFreehandPath] = useState([]);
  const [snapStep, setSnapStep] = useState(0.25);
  const snapEnabled = snapStep > 0;
  const snapStepRef = useRef(snapStep);
  snapStepRef.current = snapStep;

  const [rememberedDuration, setRememberedDuration] = useState(1);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [connectorCursor, setConnectorCursor] = useState(null);
  const [continuousScroll, setContinuousScroll] = useState(true);

  const markerDragRef = useRef(null);
  const [seekNonce, setSeekNonce] = useState(0);
  const [openFlyout, setOpenFlyout] = useState(null);
  const [revealedChords, setRevealedChords] = useState(() => new Set());
  const revealedChordsRef = useRef(revealedChords);
  revealedChordsRef.current = revealedChords;
  const [playbackTime, setPlaybackTime] = useState(0);
  const [glideAmount, setGlideAmount] = useState(50);
  const [glideSpeed, setGlideSpeed] = useState(15);
  const [beatsPerChord, setBeatsPerChord] = useState(4);
  const [volume, setVolume] = useState(65);
  const [waveform, setWaveform] = useState("triangle");
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [zoomX, setZoomX] = useState(1);
  const [zoomY, setZoomY] = useState(1);
  const [labelMode, setLabelMode] = useState("piano");
  const [dockOpen, setDockOpen] = useState(true);
  const [pressedKey, setPressedKey] = useState(null);

  const [marquee, setMarquee] = useState(null);
  const [marqueeSelected, setMarqueeSelected] = useState(() => new Set());
  const marqueeRef = useRef(null);

  const flyoutTimerRef = useRef(null);
  const openFlyoutWithHover = useCallback((id) => {
    if (flyoutTimerRef.current) {
      clearTimeout(flyoutTimerRef.current);
      flyoutTimerRef.current = null;
    }
    setOpenFlyout(id);
  }, []);
  const scheduleCloseFlyout = useCallback(() => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
    flyoutTimerRef.current = setTimeout(() => {
      setOpenFlyout(null);
      flyoutTimerRef.current = null;
    }, 220);
  }, []);
  const flyoutBind = useCallback((id) => ({
    onMouseEnter: () => openFlyoutWithHover(id),
    onMouseLeave: scheduleCloseFlyout,
  }), [openFlyoutWithHover, scheduleCloseFlyout]);

  const gridRef = useRef(null);
  const outerRef = useRef(null);
  const rulerRef = useRef(null);
  const velScrollRef = useRef(null);
  const velLaneRef = useRef(null);
  const dragRef = useRef(null);
  const velDragRef = useRef(null);
  const glideDragRef = useRef(null);
  const freehandRef = useRef(null);
  const lastDragMovedRef = useRef(false);
  const audioRef = useRef(null);
  const previewCtxRef = useRef(null);
  const previewVoicesRef = useRef(new Map());
  const previewDownRef = useRef(new Set());
  const nodesRef = useRef([]);
  const anchorRef = useRef({ audioTime: 0, songTime: 0 });
  const playbackRafRef = useRef(null);
  const playbackTimeRef = useRef(0);
  const clipboardRef = useRef([]);
  const rightDragDeletedRef = useRef(new Set());
  const zoomRef = useRef({ x: 1, y: 1 });
  const anchorZoomRef = useRef(null);
  const [rulerZooming, setRulerZooming] = useState(false);
  const rulerZoomTimerRef = useRef(null);

  const BEAT = BASE_BEAT * zoomX;
  const ROW = Math.round(BASE_ROW * zoomY);
  zoomRef.current = { x: zoomX, y: zoomY };

  const globalEase = (() => {
    const amount = clamp(glideAmount, 0, 100) / 100;
    const sharp = clamp(glideSpeed, 0, 100) / 100;
    const a = amount * (0.1 + 0.4 * sharp);
    return [a, 0, amount - a, 1];
  })();

  const safeBpm = Math.max(1, Number(bpm) || 120);
  const beatSeconds = 60 / safeBpm;
  const chordWidth = beatsPerChord * BEAT;
  
  const maxNoteBeat = notes.length > 0 ? Math.max(...notes.map(n => n.chordIndex * beatsPerChord + n.beat + n.duration)) : 0;
  const columnCount = Math.max(15, progression.length, Math.ceil(maxNoteBeat / beatsPerChord) + 2);
  
  const gridWidth = columnCount * chordWidth;
  const gridBeats = columnCount * beatsPerChord;
  const gridHeight = (HIGH - LOW + 1) * ROW;
  const connectorMode = tool === "connect" && glideMode === "auto";

  const noteMap = useMemo(() => new Map(notes.map(note => [note.id, note])), [notes]);
  const connMap = useMemo(() => new Map(connections.map(edge => [edge.id, edge])), [connections]);

  const absBeat = note => note.chordIndex * beatsPerChord + note.beat;
  const startSec = note => absBeat(note) * beatSeconds;
  const endSec = note => startSec(note) + note.duration * beatSeconds;
  const noteX = note => absBeat(note) * BEAT;
  const noteY = note => (HIGH - note.midi) * ROW;
  const xOfTime = t => (t / beatSeconds) * BEAT;
  const yOfPitch = midi => (HIGH - midi) * ROW + ROW / 2;

  const gridStyle = useMemo(() => {
    const stepBeats = snapStep > 0 ? snapStep : 0.25;
    const minorPx = Math.max(4, stepBeats * BEAT);
    const barPx = Math.max(8, 4 * BEAT);
    return {
      backgroundImage: [
        `repeating-linear-gradient(to right, transparent 0, transparent ${minorPx - 1}px, rgba(120,145,170,0.10) ${minorPx - 1}px, rgba(120,145,170,0.10) ${minorPx}px)`,
        `repeating-linear-gradient(to right, transparent 0, transparent ${barPx - 1}px, rgba(120,145,170,0.32) ${barPx - 1}px, rgba(120,145,170,0.32) ${barPx}px)`,
      ].join(", "),
      backgroundSize: `${gridWidth}px 100%, ${gridWidth}px 100%`,
      backgroundPosition: "0 0, 0 0",
      backgroundRepeat: "repeat-x, repeat-x",
    };
  }, [snapStep, BEAT, gridWidth]);

  const velocityStyle = useMemo(() => {
    const stepBeats = snapStep > 0 ? snapStep : 0.25;
    const minorPx = Math.max(4, stepBeats * BEAT);
    const barPx = Math.max(8, 4 * BEAT);
    return {
      backgroundImage: [
        `repeating-linear-gradient(to right, transparent 0, transparent ${minorPx - 1}px, rgba(120,145,170,0.10) ${minorPx - 1}px, rgba(120,145,170,0.10) ${minorPx}px)`,
        `repeating-linear-gradient(to right, transparent 0, transparent ${barPx - 1}px, rgba(120,145,170,0.28) ${barPx - 1}px, rgba(120,145,170,0.28) ${barPx}px)`,
        `repeating-linear-gradient(to top, transparent 0, transparent 23px, rgba(120,145,170,0.1) 23px, rgba(120,145,170,0.1) 24px)`,
      ].join(", "),
      backgroundSize: `${gridWidth}px 100%, ${gridWidth}px 100%, 100% ${VEL_PANEL_HEIGHT}px`,
      backgroundRepeat: "repeat-x, repeat-x, repeat-y",
    };
  }, [snapStep, BEAT, gridWidth]);

  const voiceDependencyKey = useMemo(
    () => notes.map(n => `${n.id}:${n.glideSec || ""}:${(n.ease || []).join(",")}`).join("|"),
    [notes]
  );

  function getGlide(from, to, conn) {
    const fromStart = startSec(from);
    const toStart = startSec(to);
    const rear = endSec(from);
    const step = snapStepRef.current;
    const defaultStart = clamp(Math.min(rear, toStart - 0.02), fromStart, toStart);

    const capturedGlide = Number.isFinite(from.glideSec) && from.glideSec > 0 ? from.glideSec : null;
    const capturedEase = Array.isArray(from.ease) && from.ease.length === 4 ? from.ease : null;

    let gapStart = clamp(defaultStart + (conn?.startShift || 0) * beatSeconds, fromStart, Math.max(fromStart, toStart - 0.04));
    let arrive = clamp(toStart + (conn?.endShift || 0) * beatSeconds, gapStart + 0.02, Math.max(gapStart + 0.02, toStart));

    if (capturedGlide != null) {
      gapStart = rear;
      arrive = rear + capturedGlide;
    } else if (step > 0) {
      const snapGap = snapTo(gapStart / beatSeconds, step) * beatSeconds;
      const snapArr = snapTo(arrive / beatSeconds, step) * beatSeconds;
      gapStart = clamp(snapGap, fromStart, Math.max(fromStart, toStart - 0.04));
      arrive = clamp(snapArr, gapStart + 0.02, Math.max(gapStart + 0.02, toStart));
    }

    const delta = to.midi - from.midi;
    let shapeD;
    if (Array.isArray(conn?.pts)) {
      const knots = [{ p: 0, d: 0 }, ...conn.pts, { p: 1, d: delta }];
      shapeD = u => hermiteD(knots, u);
    } else {
      const e = capturedEase || conn?.ease || globalEase;
      shapeD = u => delta * cubicBezierEase(e[0], e[1], e[2], e[3], u);
    }
    const span = Math.max(0.001, arrive - gapStart);
    return {
      fromStart, toStart, rear, defaultStart, gapStart, arrive,
      m1: from.midi,
      m2: to.midi,
      pitchAtTime: t => from.midi + shapeD(clamp((t - gapStart) / span, 0, 1))
    };
  }

  const glideFor = (from, to) => getGlide(from, to, connMap.get(`${from.id}__${to.id}`));

  function virtualKnots(g) {
    return [0.25, 0.5, 0.75].map(u => ({
      p: u,
      d: g.pitchAtTime(g.gapStart + u * (g.arrive - g.gapStart)) - g.m1
    }));
  }

  function snapAllNotes(step) {
    if (!step || step <= 0) return;
    setNotes(prev => prev.map(n => snapNote(n, step, beatsPerChord)));
  }

  const voices = useMemo(() => {
    const list = buildVoices(notes, connections, startSec);
    const vel = note => clamp(note.velocity ?? 100, 1, 127) / 100;
    list.forEach(voice => {
      const segments = [];
      const stops = voice.stops;
      if (!stops.length) {
        voice.segments = segments;
        voice.start = 0;
        voice.end = 0;
        return;
      }
      if (voice.spawnFrom) {
        const target = stops[0].note;
        const g = glideFor(voice.spawnFrom, target);
        segments.push({
          kind: "glide", from: voice.spawnFrom, to: target, g,
          t0: g.gapStart, t1: g.toStart,
          levelA: vel(voice.spawnFrom), levelB: stops[0].body ? vel(target) : 0
        });
      }
      stops.forEach((stop, i) => {
        if (!stop.body) return;
        const next = stops[i + 1];
        const g = next ? glideFor(stop.note, next.note) : null;
        const t0 = startSec(stop.note);
        segments.push({
          kind: "hold", note: stop.note,
          t0, t1: g ? Math.max(t0, g.gapStart) : endSec(stop.note),
          levelA: vel(stop.note), levelB: vel(stop.note)
        });
        if (g) {
          segments.push({
            kind: "glide", from: stop.note, to: next.note, g,
            t0: g.gapStart, t1: g.toStart,
            levelA: vel(stop.note), levelB: next.body ? vel(next.note) : 0
          });
        }
      });
      voice.segments = segments;
      voice.start = segments[0].t0;
      voice.end = segments[segments.length - 1].t1;
    });
    return list;
  }, [notes, connections, glideAmount, glideSpeed, beatsPerChord, bpm, snapStep, voiceDependencyKey]);

  const connectionPaths = useMemo(() => {
    const samples = 56;
    return connections.map(connection => {
      const from = noteMap.get(connection.from);
      const to = noteMap.get(connection.to);
      if (!from || !to) return { id: connection.id, d: "" };
      const g = getGlide(from, to, connection);
      const points = [];
      if (g.gapStart > g.rear) {
        points.push([xOfTime(g.rear), yOfPitch(g.m1)]);
      }
      for (let i = 0; i <= samples; i++) {
        const t = g.gapStart + ((g.toStart - g.gapStart) * i) / samples;
        points.push([xOfTime(t), yOfPitch(g.pitchAtTime(t))]);
      }
      return { id: connection.id, d: points.map((pt, i) => `${i ? "L" : "M"} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(" ") };
    });
  }, [connections, noteMap, glideAmount, glideSpeed, beatsPerChord, bpm, zoomX, zoomY, snapStep, voiceDependencyKey]);

  const trailPaths = useMemo(() => {
    const out = [];
    voices.forEach((voice, index) => {
      voice.segments.forEach((segment, si) => {
        if (segment.kind === "hold") {
          if (segment.t1 - segment.t0 < 0.001) return;
          const y = yOfPitch(segment.note.midi);
          out.push({ key: `${index}-${si}`, d: `M ${xOfTime(segment.t0).toFixed(1)} ${y} L ${xOfTime(segment.t1).toFixed(1)} ${y}`, color: noteDotColor(segment.note.id + voice.seed) });
          return;
        }
        const half = 14;
        [0, 1].forEach(part => {
          let d = "";
          for (let i = 0; i <= half; i++) {
            const u = (part * 0.5) + (0.5 * i) / half;
            const t = segment.t0 + (segment.t1 - segment.t0) * u;
            d += `${i ? "L" : "M"} ${xOfTime(t).toFixed(1)} ${yOfPitch(segment.g.pitchAtTime(t)).toFixed(1)} `;
          }
          out.push({ key: `${index}-${si}-${part}`, d, color: noteDotColor((part === 0 ? segment.from : segment.to).id + voice.seed) });
        });
      });
    });
    return out;
  }, [voices, zoomX, zoomY, voiceDependencyKey]);

  const playheadX = (playbackTime / beatSeconds) * BEAT;
  const markerX = playheadX;
  const totalBeats = Math.max(1, Math.ceil(gridWidth / BEAT));

  const playbackDots = useMemo(() => {
    if (!playing) return [];
    const t = playbackTime;
    const dots = [];
    voices.forEach((voice, index) => {
      if (!voice.segments.length || t < voice.start || t > voice.end) return;
      const segment = segmentAt(voice, t);
      let pitch;
      let colorNote;
      if (segment.kind === "hold") {
        pitch = segment.note.midi;
        colorNote = segment.note;
      } else {
        pitch = segment.g.pitchAtTime(t);
        const u = clamp((t - segment.t0) / Math.max(0.001, segment.t1 - segment.t0), 0, 1);
        colorNote = u < 0.5 ? segment.from : segment.to;
      }
      const rounded = Math.round(pitch);
      dots.push({
        id: `voice-${index}`,
        x: xOfTime(t),
        y: yOfPitch(pitch),
        midi: rounded,
        noteMidi: colorNote.midi,
        label: noteName(rounded),
        color: noteDotColor(colorNote.id + voice.seed)
      });
    });
    return dots;
  }, [playing, voices, playbackTime, zoomX, zoomY]);

  const activeKeys = useMemo(() => {
    const map = new Map();
    playbackDots.forEach(dot => map.set(dot.midi, dot.color));
    return map;
  }, [playbackDots]);

  function getSongTime() {
    const audio = audioRef.current;
    if (!audio) return playbackTimeRef.current;
    const anchor = anchorRef.current;
    return Math.max(0, anchor.songTime + Math.max(0, audio.currentTime - anchor.audioTime));
  }

  function seekToBeat(beat) {
    const b = Math.max(0, Math.min(totalBeats, beat));
    const t = b * (60 / Math.max(40, bpm));
    playbackTimeRef.current = t;
    setPlaybackTime(t);
    const chordIdx = Math.floor(b / beatsPerChord);
    if (chordIdx >= 0 && !revealedChordsRef.current.has(chordIdx)) {
      const next = new Set(revealedChordsRef.current);
      for (let i = 0; i <= chordIdx; i++) next.add(i);
      revealedChordsRef.current = next;
      setRevealedChords(next);
    }
    if (playing && !paused && audioRef.current) {
      anchorRef.current = { audioTime: audioRef.current.currentTime, songTime: t };
      nodesRef.current.forEach(node => { try { node.stop(); } catch {} });
      nodesRef.current = [];
      setSeekNonce(n => n + 1);
    }
  }

  function beatFromRulerEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const step = snapStepRef.current;
    let beat = localX / BEAT;
    if (step > 0) beat = snapTo(beat, step);
    return Math.max(0, Math.min(totalBeats, beat));
  }

  function stopPlayback(updateState = true) {
    nodesRef.current.forEach(node => { try { node.stop(); } catch {} });
    nodesRef.current = [];
    if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
    playbackRafRef.current = null;
    if (updateState) {
      playbackTimeRef.current = 0;
      setPlaybackTime(0);
      setPlaying(false);
      setPaused(false);
    }
  }

  async function playProgression() {
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) { alert("Your browser does not support Web Audio."); return; }
      if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioClass();

      if (playing && paused) {
        await audioRef.current.resume();
        setPaused(false);
        return;
      }
      if (playing) return;

      if (audioRef.current.state === "suspended") await audioRef.current.resume();
      const startTime = Math.max(0, playbackTimeRef.current || 0);
      anchorRef.current = { audioTime: audioRef.current.currentTime, songTime: startTime };
      setPlaybackTime(startTime);
      setPaused(false);
      setPlaying(true);
    } catch (error) {
      console.error("Piano Roll playback error:", error);
      stopPlayback();
    }
  }

  async function pausePlayback() {
    if (!playing || paused) return;
    playbackTimeRef.current = getSongTime();
    setPlaybackTime(playbackTimeRef.current);
    if (audioRef.current?.state === "running") {
      await audioRef.current.suspend();
      setPaused(true);
    }
  }

  function resetMapper() {
    stopPlayback();
    setRevealedChords(new Set());
    revealedChordsRef.current = new Set();
    const fresh = makeInitialNotes(progression);
    setNotes(fresh);
    setConnections(makeAutomaticConnections(fresh, progression.length));
    setSelectedNote(null);
    setSelectedNotes([]);
    setSelectedGlide(null);
    setConnectionSource(null);
    setConnectorCursor(null);
    setMarqueeSelected(new Set());
    setMarquee(null);
  }

  function saveHistory() {
    setUndoStack(stack => [...stack.slice(-39), { notes, connections }]);
    setRedoStack([]);
  }

  function clearGlideWork() {
    setConnectionSource(null);
    setConnectorCursor(null);
    freehandRef.current = null;
    glideDragRef.current = null;
    setFreehandPath([]);
  }

  function chooseTool(nextTool) {
    setTool(nextTool);
    clearGlideWork();
    if (nextTool !== "connect") setSelectedGlide(null);
    dragRef.current = null;
    setMarqueeSelected(new Set());
    setMarquee(null);
  }

  function chooseGlideMode(mode) {
    setGlideMode(mode);
    clearGlideWork();
    if (mode !== "advanced") setSelectedGlide(null);
  }

  function addNoteAtPointer(event) {
    if (!gridRef.current) return;
    const step = snapStepRef.current;
    const rect = gridRef.current.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, gridWidth - 1);
    const y = clamp(event.clientY - rect.top, 0, gridHeight - 1);

    let abs = x / BEAT;
    if (step > 0) abs = snapFloor(abs, step);
    abs = Math.max(0, Math.min(gridBeats - (step > 0 ? step : 0.0001), abs));

    const chordIndex = Math.floor(abs / beatsPerChord + 1e-9);
    const beat = Math.max(0, abs - chordIndex * beatsPerChord);
    const midi = clamp(HIGH - Math.floor(y / ROW), LOW, HIGH);
    const id = `drawn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    saveHistory();
    setNotes(previous => [...previous, { id, chordIndex, midi, beat, duration: rememberedDuration, velocity: 100 }]);
    setSelectedNote(id);
    setSelectedNotes([id]);
  }

  function eraseNote(id) {
    saveHistory();
    setNotes(previous => previous.filter(note => note.id !== id));
    setConnections(previous => previous.filter(edge => edge.from !== id && edge.to !== id));
    if (selectedNote === id) setSelectedNote(null);
    setSelectedNotes(previous => previous.filter(noteId => noteId !== id));
  }

  function sliceNote(event, note) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = clamp((event.clientX - rect.left) / rect.width, 0.2, 0.8);
    const firstDuration = note.duration * fraction;
    const secondDuration = note.duration - firstDuration;
    saveHistory();
    setNotes(previous => previous.flatMap(item => item.id !== note.id ? [item] : [
      { ...item, duration: firstDuration },
      { ...item, id: `${item.id}-slice-${Date.now()}`, beat: item.beat + firstDuration, duration: secondDuration }
    ]));
  }

  function undoEdit() {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(stack => [...stack, { notes, connections }]);
    setNotes(previous.notes);
    setConnections(previous.connections);
    setUndoStack(stack => stack.slice(0, -1));
  }

  function redoEdit() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(stack => [...stack, { notes, connections }]);
    setNotes(next.notes);
    setConnections(next.connections);
    setRedoStack(stack => stack.slice(0, -1));
  }

  function getSelectedNoteIds() {
    return selectedNotes.length ? selectedNotes : (selectedNote ? [selectedNote] : []);
  }

  function duplicateSelected() {
    const ids = new Set(getSelectedNoteIds());
    const chosen = notes.filter(note => ids.has(note.id));
    if (!chosen.length) return;
    saveHistory();
    const shift = Math.max(...chosen.map(n => absBeat(n) + n.duration)) - Math.min(...chosen.map(n => absBeat(n)));
    const copies = chosen.map((note, index) => {
      const abs = absBeat(note) + shift;
      const chordIndex = Math.floor(abs / beatsPerChord);
      return { ...note, id: `copy-${Date.now()}-${index}`, chordIndex, beat: abs - chordIndex * beatsPerChord };
    });
    setNotes(previous => [...previous, ...copies]);
    setSelectedNotes(copies.map(note => note.id));
    setSelectedNote(copies[0].id);
  }

  function copySelected() {
    const ids = new Set(getSelectedNoteIds());
    clipboardRef.current = notes.filter(note => ids.has(note.id)).map(note => ({ ...note }));
  }

  function pasteNotes() {
    if (!clipboardRef.current.length) return;
    saveHistory();
    const copies = clipboardRef.current.map((note, index) => ({
      ...note,
      id: `paste-${Date.now()}-${index}`,
      beat: note.beat + 0.25
    }));
    setNotes(previous => [...previous, ...copies]);
    setSelectedNotes(copies.map(note => note.id));
    setSelectedNote(copies[0].id);
  }

  function deleteSelected() {
    const ids = new Set(getSelectedNoteIds());
    if (!ids.size) return;
    saveHistory();
    setNotes(previous => previous.filter(note => !ids.has(note.id)));
    setConnections(previous => previous.filter(edge => !ids.has(edge.from) && !ids.has(edge.to)));
    setSelectedNotes([]);
    setSelectedNote(null);
  }

  function createConnection(sourceId, targetId, extra = {}) {
    const source = noteMap.get(sourceId);
    const target = noteMap.get(targetId);
    if (!source || !target || source.id === target.id || absBeat(target) <= absBeat(source)) {
      setConnectionSource(null);
      setConnectorCursor(null);
      return;
    }
    const id = `${source.id}__${target.id}`;
    saveHistory();
    setConnections(previous => [...previous.filter(edge => edge.id !== id), { id, from: source.id, to: target.id, ...extra }]);
    setConnectionSource(null);
    setConnectorCursor(null);
  }

  function handleConnectionDot(id) {
    if (!connectionSource) { setConnectionSource(id); setSelectedNote(id); }
    else if (connectionSource === id) setConnectionSource(null);
    else createConnection(connectionSource, id);
  }

  function startConnectorDrag(event, id) {
    event.preventDefault();
    event.stopPropagation();
    setConnectionSource(id);
    setSelectedNote(id);
    setConnectorCursor(null);
  }

  function finishConnectorDrag(event, id) {
    if (!connectorMode || !connectionSource) return;
    event.stopPropagation();
    if (id !== connectionSource) createConnection(connectionSource, id);
  }

  function removeConnection(id) {
    saveHistory();
    setConnections(previous => previous.filter(edge => edge.id !== id));
    if (selectedGlide === id) setSelectedGlide(null);
  }

  function autoConnectAll() {
    saveHistory();
    setConnections(makeAutomaticConnections(notes, progression.length));
    setSelectedGlide(null);
  }

  function resetSelectedGlide() {
    if (!selectedGlide) return;
    saveHistory();
    setConnections(previous => previous.map(item => {
      if (item.id !== selectedGlide) return item;
      return { id: item.id, from: item.from, to: item.to };
    }));
  }

  function startFreehand(event, note) {
    if (event.button !== 0 || !gridRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = gridRef.current.getBoundingClientRect();
    const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    freehandRef.current = { sourceId: note.id, points: [start] };
    setFreehandPath([start]);
    setSelectedNote(note.id);
    gridRef.current.setPointerCapture(event.pointerId);
  }

  function freehandToKnots(points, from, to) {
    const g = getGlide(from, to);
    const x0 = xOfTime(g.gapStart);
    const width = Math.max(1, xOfTime(g.toStart) - x0);
    let furthest = 0;
    const samples = points.map(pt => {
      furthest = Math.max(furthest, clamp((pt.x - x0) / width, 0, 1));
      return { p: furthest, d: HIGH - (pt.y - ROW / 2) / ROW - from.midi };
    });
    const total = 24;
    const knots = [];
    for (let i = 1; i < total; i++) {
      const target = i / total;
      let j = 0;
      while (j < samples.length - 1 && samples[j + 1].p < target) j++;
      const a = samples[j];
      const b = samples[Math.min(j + 1, samples.length - 1)];
      const span = b.p - a.p;
      const f = span > 1e-6 ? clamp((target - a.p) / span, 0, 1) : 0;
      knots.push({ p: target, d: a.d + (b.d - a.d) * f });
    }
    return knots;
  }

  function finishFreehand(event) {
    const work = freehandRef.current;
    freehandRef.current = null;
    setFreehandPath([]);
    if (!work) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".vm-note");
    const targetId = hit?.dataset?.noteId;
    const source = noteMap.get(work.sourceId);
    const target = targetId ? noteMap.get(targetId) : null;
    if (!source || !target || target.id === source.id || absBeat(target) <= absBeat(source)) return;
    if (work.points.length < 3) return;
    createConnection(source.id, target.id, { pts: freehandToKnots(work.points, source, target) });
  }

  function startGlideDrag(event, connection, kind, index = -1) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    glideDragRef.current = { id: connection.id, kind, index, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveGlideDrag(event) {
    const drag = glideDragRef.current;
    if (!drag || !gridRef.current) return;
    const connection = connMap.get(drag.id);
    const from = connection ? noteMap.get(connection.from) : null;
    const to = connection ? noteMap.get(connection.to) : null;
    if (!connection || !from || !to) return;
    const g = getGlide(from, to, connection);
    const rect = gridRef.current.getBoundingClientRect();
    const pointerTime = ((event.clientX - rect.left) / BEAT) * beatSeconds;
    const pointerPitch = HIGH - (event.clientY - rect.top - ROW / 2) / ROW;
    if (!drag.moved) {
      drag.moved = true;
      saveHistory();
    }
    setConnections(previous => previous.map(item => {
      if (item.id !== drag.id) return item;
      if (drag.kind === "start") {
        const t = clamp(pointerTime, g.fromStart, g.arrive - 0.02);
        return { ...item, startShift: (t - g.defaultStart) / beatSeconds };
      }
      if (drag.kind === "end") {
        const t = clamp(pointerTime, g.gapStart + 0.02, g.toStart);
        return { ...item, endShift: (t - g.toStart) / beatSeconds };
      }
      const base = Array.isArray(item.pts) ? item.pts.map(knot => ({ ...knot })) : virtualKnots(g);
      const i = drag.index;
      if (!base[i]) return item;
      const lo = i > 0 ? base[i - 1].p + 0.01 : 0.01;
      const hi = i < base.length - 1 ? base[i + 1].p - 0.01 : 0.99;
      const u = clamp((pointerTime - g.gapStart) / Math.max(0.001, g.arrive - g.gapStart), lo, Math.max(lo, hi));
      base[i] = { p: u, d: clamp(pointerPitch, LOW - 12, HIGH + 12) - g.m1 };
      return { ...item, pts: base };
    }));
  }

  function endGlideDrag() {
    glideDragRef.current = null;
  }

  function addGlidePoint(event, id) {
    const connection = connMap.get(id);
    const from = connection ? noteMap.get(connection.from) : null;
    const to = connection ? noteMap.get(connection.to) : null;
    if (!connection || !from || !to || !gridRef.current) return;
    const g = getGlide(from, to, connection);
    const rect = gridRef.current.getBoundingClientRect();
    const pointerTime = ((event.clientX - rect.left) / BEAT) * beatSeconds;
    const u = clamp((pointerTime - g.gapStart) / Math.max(0.001, g.arrive - g.gapStart), 0.03, 0.97);
    const base = Array.isArray(connection.pts) ? connection.pts : virtualKnots(g);
    if (base.some(knot => Math.abs(knot.p - u) < 0.03)) return;
    const knot = { p: u, d: g.pitchAtTime(g.gapStart + u * (g.arrive - g.gapStart)) - g.m1 };
    saveHistory();
    setConnections(previous => previous.map(item => item.id !== id ? item : {
      ...item,
      pts: [...base, knot].sort((a, b) => a.p - b.p)
    }));
  }

  function removeGlidePoint(connection, index) {
    const from = noteMap.get(connection.from);
    const to = noteMap.get(connection.to);
    if (!from || !to) return;
    const base = Array.isArray(connection.pts) ? connection.pts : virtualKnots(getGlide(from, to, connection));
    saveHistory();
    setConnections(previous => previous.map(item => item.id !== connection.id ? item : {
      ...item,
      pts: base.filter((_, i) => i !== index)
    }));
  }

  function startNoteDrag(event, note, mode = "move") {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();

    if (mode === "move" && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      const ids = getSelectedNoteIds();
      setSelectedNotes(ids.includes(note.id) ? ids.filter(id => id !== note.id) : [...ids, note.id]);
      setSelectedNote(note.id);
      return;
    }

    const selectedIds = new Set(getSelectedNoteIds());
    let group;
    if (selectedIds.has(note.id)) {
      group = notes.filter(item => selectedIds.has(item.id));
    } else {
      group = [note];
      setSelectedNotes([note.id]);
    }
    setSelectedNote(note.id);

    lastDragMovedRef.current = false;
    dragRef.current = {
      id: note.id,
      mode,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      items: group.map(item => ({
        id: item.id,
        abs: absBeat(item),
        midi: item.midi,
        duration: item.duration
      }))
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function gridPoint(event) {
    const el = gridRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function marqueeHitTest(box) {
    const left = Math.min(box.x0, box.x1);
    const right = Math.max(box.x0, box.x1);
    const top = Math.min(box.y0, box.y1);
    const bottom = Math.max(box.y0, box.y1);
    const hit = new Set();
    notes.forEach(note => {
      const x = noteX(note);
      const y = noteY(note);
      const w = Math.max(32, note.duration * BEAT);
      const h = ROW - 3;
      if (x < right && x + w > left && y < bottom && y + h > top) hit.add(note.id);
    });
    return hit;
  }

  function startMarquee(event) {
    const p = gridPoint(event);
    marqueeRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, moved: false };
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    setMarqueeSelected(new Set());
    gridRef.current?.setPointerCapture?.(event.pointerId);
  }

  function moveMarquee(event) {
    const m = marqueeRef.current;
    if (!m) return;
    const p = gridPoint(event);
    m.x1 = p.x;
    m.y1 = p.y;
    if (Math.abs(m.x1 - m.x0) > 2 || Math.abs(m.y1 - m.y0) > 2) m.moved = true;
    setMarquee({ x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 });
    setMarqueeSelected(marqueeHitTest(m));
  }

  function endMarquee() {
    const m = marqueeRef.current;
    marqueeRef.current = null;
    if (!m) return;
    if (!m.moved) {
      setMarqueeSelected(new Set());
      setMarquee(null);
      return;
    }
    const hit = marqueeHitTest(m);
    setMarqueeSelected(hit);
    setMarquee(null);
    if (hit.size) {
      setSelectedNotes([...hit]);
      setSelectedNote([...hit][0]);
    }
  }

  function handleGridPointerMove(event) {
    const drag = dragRef.current;
    if (drag?.mode === "pan") {
      if (outerRef.current) {
        outerRef.current.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
        outerRef.current.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
      }
      return;
    }
    if (freehandRef.current && gridRef.current) {
      const rect = gridRef.current.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const points = freehandRef.current.points;
      const last = points[points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) >= 2) {
        points.push(point);
        setFreehandPath([...points]);
      }
      return;
    }
    if (!drag) {
      if (connectorMode && connectionSource && gridRef.current) {
        const rect = gridRef.current.getBoundingClientRect();
        setConnectorCursor({ x: clamp(event.clientX - rect.left, 0, gridWidth), y: clamp(event.clientY - rect.top, 0, gridHeight) });
      }
      return;
    }

    const step = snapStepRef.current;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      drag.moved = true;
      lastDragMovedRef.current = true;
      saveHistory();
    }

    let deltaBeats = dx / BEAT;
    if (step > 0) deltaBeats = snapTo(deltaBeats, step);
    const byId = new Map(drag.items.map(item => [item.id, item]));

    if (drag.mode === "resize") {
      const anchor = byId.get(drag.id);
      const rawEnd = anchor.abs + anchor.duration + dx / BEAT;
      const snappedEnd = step > 0 ? snapTo(rawEnd, step) : rawEnd;
      const newDuration = Math.max(step > 0 ? step : 0.0625, snappedEnd - anchor.abs);
      setRememberedDuration(newDuration);
      setNotes(previous => previous.map(note => byId.has(note.id)
        ? { ...note, duration: newDuration }
        : note));
      return;
    }

    let deltaMidi = -Math.round(dy / ROW);
    const minAbs = Math.min(...drag.items.map(item => item.abs));
    const maxAbs = Math.max(...drag.items.map(item => item.abs));
    const minMidi = Math.min(...drag.items.map(item => item.midi));
    const maxMidi = Math.max(...drag.items.map(item => item.midi));
    const minStep = step > 0 ? step : 0.0001;
    deltaBeats = clamp(deltaBeats, -minAbs, gridBeats - minStep - maxAbs);
    deltaMidi = clamp(deltaMidi, LOW - minMidi, HIGH - maxMidi);

    setNotes(previous => previous.map(note => {
      const original = byId.get(note.id);
      if (!original) return note;
      const rawAbs = Math.max(0, original.abs + deltaBeats);
      const snappedAbs = step > 0 ? snapTo(rawAbs, step) : rawAbs;
      const abs = clamp(snappedAbs, 0, gridBeats - (step > 0 ? step : 0.0001));
      const chordIndex = Math.floor(abs / beatsPerChord + 1e-9);
      return { ...note, chordIndex, beat: abs - chordIndex * beatsPerChord, midi: original.midi + deltaMidi };
    }));
  }

  function finishNoteDrag() {
    dragRef.current = null;
  }

  function applyVelocityFromPointer(event) {
    const drag = velDragRef.current;
    if (!drag || !velLaneRef.current) return;
    const rect = velLaneRef.current.getBoundingClientRect();
    const target = clamp(Math.round(((rect.bottom - event.clientY) / VEL_BAR_MAX) * 127), 1, 127);
    const delta = target - drag.startVelocity;
    const byId = new Map(drag.items.map(item => [item.id, item.velocity]));
    setNotes(previous => previous.map(note => byId.has(note.id)
      ? { ...note, velocity: clamp(byId.get(note.id) + delta, 1, 127) }
      : note));
  }

  function startVelocityDrag(event, note) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const selectedIds = new Set(getSelectedNoteIds());
    let group;
    if (selectedIds.has(note.id)) {
      group = notes.filter(item => selectedIds.has(item.id));
    } else {
      group = [note];
      setSelectedNotes([note.id]);
      setSelectedNote(note.id);
    }
    saveHistory();
    velDragRef.current = {
      id: note.id,
      startVelocity: note.velocity ?? 100,
      items: group.map(item => ({ id: item.id, velocity: item.velocity ?? 100 }))
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    applyVelocityFromPointer(event);
  }

  async function startKeyPreview(midi, pointerId) {
    previewDownRef.current.add(pointerId);
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) return;
      if (!previewCtxRef.current || previewCtxRef.current.state === "closed") previewCtxRef.current = new AudioClass();
      const ctx = previewCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      if (!previewDownRef.current.has(pointerId)) return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = frequency(midi);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime((volume / 100) * 0.2, ctx.currentTime + 0.015);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      previewVoicesRef.current.set(pointerId, { oscillator, gain, midi });
      setPressedKey(midi);
    } catch (error) {
      console.error("Key preview error:", error);
    }
  }

  function stopKeyPreview(pointerId, keepDown = false) {
    if (!keepDown) previewDownRef.current.delete(pointerId);
    const voice = previewVoicesRef.current.get(pointerId);
    if (!voice) return;
    previewVoicesRef.current.delete(pointerId);
    const ctx = previewCtxRef.current;
    if (ctx) {
      const now = ctx.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.03);
      try { voice.oscillator.stop(now + 0.18); } catch {}
    }
    setPressedKey(null);
  }

  function handleKeyboardPointerDown(event) {
    const key = event.target.closest?.("[data-midi]");
    if (!key || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startKeyPreview(Number(key.dataset.midi), event.pointerId);
  }

  function handleKeyboardPointerMove(event) {
    if (!previewDownRef.current.has(event.pointerId)) return;
    const key = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-midi]");
    if (!key) return;
    const midi = Number(key.dataset.midi);
    const current = previewVoicesRef.current.get(event.pointerId);
    if (current && current.midi === midi) return;
    stopKeyPreview(event.pointerId, true);
    startKeyPreview(midi, event.pointerId);
  }

  function handleKeyboardPointerUp(event) {
    stopKeyPreview(event.pointerId);
  }

  useEffect(() => {
    if (!playing || paused) return undefined;
    let frame;
    const tick = () => {
      const elapsed = getSongTime();
      playbackTimeRef.current = elapsed;
      setPlaybackTime(elapsed);
      const beatSec = 60 / Math.max(40, bpm);
      const chordIdx = Math.floor(elapsed / (beatSec * beatsPerChord));
      if (chordIdx >= 0 && !revealedChordsRef.current.has(chordIdx)) {
        const next = new Set(revealedChordsRef.current);
        next.add(chordIdx);
        revealedChordsRef.current = next;
        setRevealedChords(next);
      }
      const end = notes.reduce((latest, note) => Math.max(latest, endSec(note)), 0);
      if (end > 0 && elapsed >= end) {
        setPlaying(false);
        setPaused(false);
        setPlaybackTime(0);
        playbackTimeRef.current = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
      playbackRafRef.current = frame;
    };
    frame = requestAnimationFrame(tick);
    playbackRafRef.current = frame;
    return () => {
      cancelAnimationFrame(frame);
      if (playbackRafRef.current === frame) playbackRafRef.current = null;
    };
  }, [playing, paused, notes, bpm, beatsPerChord]);

  useEffect(() => {
    if (!playing || paused || !audioRef.current || audioRef.current.state !== "running") return undefined;
    const audio = audioRef.current;
    const offset = playbackTimeRef.current;
    const scheduleAt = audio.currentTime + 0.04;
    anchorRef.current = { audioTime: scheduleAt, songTime: offset };

    const base = (volume / 100) * 0.15;
    const toAudio = seconds => scheduleAt + Math.max(0, seconds - offset);
    const scheduled = [];

    voices.forEach(voice => {
      if (!voice.segments.length || voice.end <= offset) return;
      const remaining = voice.segments.filter(segment => segment.t1 > offset);
      if (!remaining.length) return;

      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = waveform;

      const startTime = Math.max(voice.start, offset);
      oscillator.frequency.value = frequency(voicePitchAt(voice, startTime));
      const audioStart = toAudio(startTime);

      const points = [];
      remaining.forEach(segment => {
        const t0 = Math.max(segment.t0, offset);
        const progress = clamp((t0 - segment.t0) / Math.max(0.001, segment.t1 - segment.t0), 0, 1);
        points.push({ t: t0, v: segment.levelA + (segment.levelB - segment.levelA) * progress });
        points.push({ t: segment.t1, v: segment.levelB });
      });
      const tail = points[points.length - 1];
      if (tail.v > 0.001) points.push({ t: tail.t + 0.05, v: 0 });

      gain.gain.setValueAtTime(0, audioStart);
      gain.gain.linearRampToValueAtTime(points[0].v * base, audioStart + 0.02);
      let lastAt = audioStart + 0.02;
      points.slice(1).forEach(point => {
        const at = Math.max(toAudio(point.t), lastAt + 0.001);
        gain.gain.linearRampToValueAtTime(point.v * base, at);
        lastAt = at;
      });

      remaining.forEach(segment => {
        if (segment.kind !== "glide") return;
        const segmentStart = Math.max(offset, segment.t0);
        const duration = Math.max(0.01, segment.t1 - segmentStart);
        const samples = 128;
        const curve = new Float32Array(samples);
        for (let j = 0; j < samples; j++) {
          curve[j] = frequency(segment.g.pitchAtTime(segmentStart + (duration * j) / (samples - 1)));
        }
        try { oscillator.frequency.setValueCurveAtTime(curve, toAudio(segmentStart), duration); } catch {}
      });

      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(audioStart);
      oscillator.stop(lastAt + 0.05);
      scheduled.push(oscillator);
    });

    nodesRef.current = scheduled;
    return () => {
      scheduled.forEach(node => { try { node.stop(); } catch {} });
      if (nodesRef.current === scheduled) nodesRef.current = [];
    };
  }, [playing, paused, voices, volume, waveform, seekNonce]);

  useEffect(() => {
    function handleKeys(event) {
      const target = event.target;
      const tag = target?.tagName;
      const type = target?.type;
      const typing =
        target?.isContentEditable ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (tag === "INPUT" && !["range", "checkbox", "button"].includes(type));
      if (typing) return;
      if (tag === "BUTTON" || tag === "INPUT") target.blur();

      if (event.code === "Space" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        if (!playing) playProgression();
        else if (paused) playProgression();
        else pausePlayback();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedGlide && tool === "connect" && glideMode === "advanced") {
          event.preventDefault();
          removeConnection(selectedGlide);
          return;
        }
        if (!getSelectedNoteIds().length) return;
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (event.key === "Escape") {
        setSelectedNotes([]);
        setSelectedNote(null);
        setSelectedGlide(null);
        setConnectionSource(null);
        setConnectorCursor(null);
        setMarqueeSelected(new Set());
        setMarquee(null);
        return;
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (!["a", "b", "c", "d", "v", "x", "z", "y"].includes(key)) return;
      event.preventDefault();
      event.stopPropagation();

      if (key === "a") {
        setSelectedNotes(notes.map(note => note.id));
        setSelectedNote(notes[0]?.id ?? null);
      } else if (key === "b" || key === "d") {
        duplicateSelected();
      } else if (key === "c") {
        copySelected();
      } else if (key === "v") {
        pasteNotes();
      } else if (key === "x") {
        copySelected();
        deleteSelected();
      } else if (key === "z" && event.shiftKey) {
        redoEdit();
      } else if (key === "z") {
        undoEdit();
      } else if (key === "y") {
        redoEdit();
      }
    }

    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [playing, paused, notes, selectedNotes, selectedNote, selectedGlide, tool, glideMode, undoStack, redoStack, connections, beatsPerChord]);

  useEffect(() => {
    if (!playing || !continuousScroll || !outerRef.current) return;
    const viewport = outerRef.current;
    if (playheadX > viewport.scrollLeft + viewport.clientWidth * 0.72) {
      viewport.scrollTo({ left: Math.max(0, playheadX - viewport.clientWidth * 0.72), behavior: "auto" });
    }
  }, [playheadX, playing, continuousScroll]);

  useEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler) return undefined;
    function onWheel(event) {
      event.preventDefault();
      event.stopPropagation();
      const dir = event.deltaY < 0 ? 1 : -1;
      const factor = 1 + 0.12 * dir;
      const rect = ruler.getBoundingClientRect();
      const outer = outerRef.current;
      if (outer) {
        const beat = (outer.scrollLeft + event.clientX - rect.left) / (BASE_BEAT * zoomRef.current.x);
        anchorZoomRef.current = { beat, screenX: event.clientX - rect.left + KEYBOARD_WIDTH };
      }
      setZoomX(z => clamp(z * factor, 0.05, 4));
      setRulerZooming(true);
      if (rulerZoomTimerRef.current) clearTimeout(rulerZoomTimerRef.current);
      rulerZoomTimerRef.current = setTimeout(() => {
        setRulerZooming(false);
        rulerZoomTimerRef.current = null;
      }, 400);
    }
    ruler.addEventListener("wheel", onWheel, { passive: false });
    return () => ruler.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => () => {
    stopPlayback(false);
    if (audioRef.current && audioRef.current.state !== "closed") audioRef.current.close();
    previewVoicesRef.current.forEach(voice => { try { voice.oscillator.stop(); } catch {} });
    if (previewCtxRef.current && previewCtxRef.current.state !== "closed") previewCtxRef.current.close();
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
    if (rulerZoomTimerRef.current) clearTimeout(rulerZoomTimerRef.current);
  }, []);

  function zoomHorizontal(nextZoom, screenX) {
    const outer = outerRef.current;
    if (outer) {
      const beat = (outer.scrollLeft + screenX - KEYBOARD_WIDTH) / (BASE_BEAT * zoomRef.current.x);
      anchorZoomRef.current = { beat, screenX };
    }
    setZoomX(clamp(nextZoom, 0.05, 4));
  }

  function zoomAnchorScreenX() {
    const outer = outerRef.current;
    if (!outer) return 300;
    if (playing) {
      const screenX = KEYBOARD_WIDTH + playheadX - outer.scrollLeft;
      if (screenX > KEYBOARD_WIDTH && screenX < outer.clientWidth) return screenX;
    }
    return outer.clientWidth / 2;
  }

  function fitZoom() {
    const outer = outerRef.current;
    if (!outer) return;
    const available = outer.clientWidth - KEYBOARD_WIDTH - 24;
    anchorZoomRef.current = { beat: 0, screenX: KEYBOARD_WIDTH };
    setZoomX(clamp(available / (gridBeats * BASE_BEAT), 0.05, 4));
  }

  useEffect(() => {
    const element = outerRef.current;
    if (!element) return undefined;
    function onWheel(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY || event.deltaX;
      const factor = delta < 0 ? 1.12 : 1 / 1.12;
      if (event.shiftKey) {
        setZoomY(value => clamp(value * factor, 0.75, 2.5));
      } else {
        const rect = element.getBoundingClientRect();
        zoomHorizontal(zoomRef.current.x * factor, event.clientX - rect.left);
      }
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const anchor = anchorZoomRef.current;
    if (!anchor || !outerRef.current) return;
    outerRef.current.scrollLeft = Math.max(0, KEYBOARD_WIDTH + anchor.beat * BEAT - anchor.screenX);
    anchorZoomRef.current = null;
  }, [zoomX]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || !notes.length) return;
    const average = notes.reduce((sum, note) => sum + note.midi, 0) / notes.length;
    outer.scrollTop = Math.max(0, (HIGH - average) * BASE_ROW + 49 - outer.clientHeight / 2);
  }, []);

  useEffect(() => {
    if (snapStep <= 0) return;
    snapAllNotes(snapStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapStep]);

  const progressionKey = useMemo(
    () => progression.map(c => `${c.id}:${(c.notes || []).join(",")}:${c.durationBeats || ""}:${c.glideSec || ""}`).join("|"),
    [progression]
  );

  useEffect(() => {
    if (!progression.length) return;
    const fresh = makeInitialNotes(progression);
    setNotes(fresh);
    setConnections(makeAutomaticConnections(fresh, progression.length));
    playbackTimeRef.current = 0;
    setPlaybackTime(0);
    setRevealedChords(new Set());
    revealedChordsRef.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressionKey]);

  const velocityOffsets = useMemo(() => {
    const seen = new Map();
    const offsets = new Map();
    notes.forEach(note => {
      const key = absBeat(note).toFixed(3);
      const count = seen.get(key) || 0;
      offsets.set(note.id, count * 11);
      seen.set(key, count + 1);
    });
    return offsets;
  }, [notes, beatsPerChord]);

  const selectedSet = new Set(getSelectedNoteIds());

  const nameOf = (midi, withOctave = true) => {
    const pc = ((midi % 12) + 12) % 12;
    const base = labelMode === "solfege" ? SOLFEGE[pc] : noteNames[pc];
    return withOctave ? base + (Math.floor(midi / 12) - 1) : base;
  };

  const miniKeys = useMemo(() => {
    let whites = 0;
    return Array.from({ length: HIGH - LOW + 1 }, (_, i) => {
      const midi = LOW + i;
      const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
      const item = { midi, isBlack, whiteIndex: whites };
      if (!isBlack) whites++;
      return item;
    });
  }, []);
  const miniWhiteCount = miniKeys.filter(key => !key.isBlack).length;

  const miniKeyMap = new Map();
  if (playing) {
    activeKeys.forEach((color, midi) => miniKeyMap.set(midi, color));
  } else {
    notes.forEach((note, index) => {
      if (selectedSet.has(note.id)) miniKeyMap.set(note.midi, NOTE_COLORS[index % NOTE_COLORS.length]);
    });
  }

  const chordMidis = playing
    ? playbackDots.map(dot => dot.noteMidi)
    : notes.filter(note => selectedSet.has(note.id)).map(note => note.midi);
  const chordKey = [...new Set(chordMidis)].sort((a, b) => a - b).join(",");
  const chordList = chordKey ? chordKey.split(",").map(Number) : [];
  const guitarShape = useMemo(() => findGuitarShape(chordKey ? chordKey.split(",").map(Number) : []), [chordKey]);
  const chipColor = midi => (playing
    ? playbackDots.find(dot => dot.noteMidi === midi)?.color
    : miniKeyMap.get(midi)) || "#9fb3c8";

  const advancedGlide = tool === "connect" && glideMode === "advanced" && selectedGlide ? connMap.get(selectedGlide) : null;

  const hintText =
    tool === "draw" ? "DRAW: click an empty piano-roll cell to create a note. New notes use the last length you set and snap to the chosen grid." :
    tool === "erase" ? "DELETE: click a note to remove it and its glide links." :
    tool === "slice" ? "SLICE: click a note where you want to split it into two notes." :
    tool === "connect" && glideMode === "auto" ? "AUTOMATIC GLIDE: drag from a note's dot to a later note. One note can glide into many notes. Click a glide line to delete it." :
    tool === "connect" && glideMode === "freehand" ? "FREEHAND GLIDE: press on a note, draw your own curve, and release on a later note. Draw again to redo it. Click a glide line to delete it." :
    tool === "connect" ? "ADVANCED GLIDE: click a glide to select it. Drag its round points, double-click the line to add a point, double-click a point to remove it. Drag the square ends to change when it starts and arrives." :
    tool === "remove" ? "DELETE GLIDE: click a glide curve or a note to remove its connections." :
    tool === "pan" ? "PAN: drag the piano roll to move around the arrangement." :
    "SELECT: Ctrl+DRAG a red box to select notes · click empty space to add a note · drag to move (snaps) · drag the right edge to resize (snaps) · Ctrl+click picks notes one by one · Ctrl+A selects all · right-click deletes.";

  const snapLabel = SNAP_OPTIONS.find(o => o.step === snapStep)?.label || "Custom";

  return (
    <div className="vm-shell">
      <header className="vm-header vm-header-compact">
        <div className="vm-header-left">
          <span className="vm-eyebrow">KEVIN STUDIO</span>
          <h1>Piano Roll</h1>
        </div>
        <button className="vm-close" onClick={() => { stopPlayback(); onClose?.(); }} title="Close">✕</button>
      </header>

      <div className="vm-toolbar vm-toolbar-compact">
        <div className="vm-transport">
          {!playing ? (
            <button className="vm-icon-btn vm-icon-play" onClick={playProgression} data-tip="Play" title="Play">
              <span className="vm-ico">▶</span>
            </button>
          ) : (
            <>
              <button className="vm-icon-btn vm-icon-play" onClick={pausePlayback} disabled={paused} title={paused ? "Paused" : "Pause"}>
                <span className="vm-ico">{paused ? "❚❚" : "Ⅱ"}</span>
              </button>
              {paused && (
                <button className="vm-icon-btn vm-icon-play" onClick={playProgression} title="Resume">
                  <span className="vm-ico">▶</span>
                </button>
              )}
            </>
          )}
          <button className="vm-icon-btn vm-icon-stop" onClick={() => stopPlayback()} data-tip="Stop" title="Stop">
            <span className="vm-ico">■</span>
          </button>
        </div>

        <span className="vm-tool-separator" />

        <div className="vm-edit-tools" role="toolbar" aria-label="Piano roll tools">
          {[
            ["select", "↖", "Select / Resize"],
            ["draw", "✎", "Draw notes"],
            ["erase", "⌫", "Delete notes"],
            ["slice", "✂", "Slice notes"],
            ["connect", "⌁", "Glide editor"],
            ["remove", "⊘", "Delete glide"],
            ["pan", "✋", "Pan view"]
          ].map(([id, glyph, label]) => (
            <button
              key={id}
              className={`vm-icon-btn ${tool === id ? "active" : ""} vm-tool-${id}`}
              onClick={() => chooseTool(id)}
              data-tip={label}
              title={label}
              aria-label={label}
            >
              <span className="vm-ico">{glyph}</span>
            </button>
          ))}
          <span className="vm-tool-separator" />
          <button className="vm-icon-btn" onClick={undoEdit} disabled={!undoStack.length} data-tip="Undo" title="Undo">↶</button>
          <button className="vm-icon-btn" onClick={redoEdit} disabled={!redoStack.length} data-tip="Redo" title="Redo">↷</button>
          <button className="vm-icon-btn" onClick={duplicateSelected} disabled={!selectedSet.size} data-tip="Duplicate notes" title="Duplicate">⧉</button>

          <div className={`vm-flyout-wrap ${openFlyout === "snap" ? "open" : ""}`} {...flyoutBind("snap")}>
            <button
              className={`vm-icon-btn ${snapEnabled ? "active" : ""}`}
              data-tip={`Snap: ${snapLabel}`}
              title={`Snap resolution — currently ${snapLabel}`}
              onClick={() => openFlyoutWithHover("snap")}
            >
              <span className="vm-ico">#</span>
            </button>
            <div className="vm-flyout vm-flyout-snap" {...flyoutBind("snap")}>
              <div className="vm-flyout-title">Snap (like FL Studio)</div>
              <div className="vm-snap-grid">
                {SNAP_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    className={`vm-snap-option ${snapStep === opt.step ? "active" : ""}`}
                    onClick={() => {
                      setSnapStep(opt.step);
                      snapStepRef.current = opt.step;
                      setOpenFlyout(null);
                      if (flyoutTimerRef.current) {
                        clearTimeout(flyoutTimerRef.current);
                        flyoutTimerRef.current = null;
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <span className="vm-tool-separator" />

        <button
          className={`vm-icon-btn ${continuousScroll ? "active" : ""}`}
          onClick={() => setContinuousScroll(v => !v)}
          data-tip="Continuous scroll"
          title="Continuous scroll"
        >
          <span className="vm-ico">⇔</span>
        </button>
        <button
          className={`vm-icon-btn ${dockOpen ? "active" : ""}`}
          onClick={() => setDockOpen(v => !v)}
          data-tip="Now Playing panel"
          title="Now Playing panel"
        >
          <span className="vm-ico">🎹</span>
        </button>

        <div className={`vm-flyout-wrap ${openFlyout === "glide" ? "open" : ""}`} {...flyoutBind("glide")}>
          <button className={`vm-icon-btn vm-icon-glide ${openFlyout === "glide" ? "active" : ""}`} data-tip="Glide settings" title="Glide settings">
            <span className="vm-ico">∿</span>
          </button>
          <div className="vm-flyout" {...flyoutBind("glide")}>
            <div className="vm-flyout-title">Glide</div>
            <label className="vm-flyout-row">
              <span>Amount</span>
              <input type="range" min="0" max="100" step="1" value={glideAmount} onChange={e => setGlideAmount(Number(e.target.value))} />
              <em>{glideAmount}%</em>
            </label>
            <label className="vm-flyout-row">
              <span>Speed</span>
              <input type="range" min="0" max="100" step="1" value={glideSpeed} onChange={e => setGlideSpeed(Number(e.target.value))} />
              <em>{glideSpeed}%</em>
            </label>
          </div>
        </div>

        <div className={`vm-flyout-wrap ${openFlyout === "sound" ? "open" : ""}`} {...flyoutBind("sound")}>
          <button className={`vm-icon-btn ${openFlyout === "sound" ? "active" : ""}`} data-tip="Sound & length" title="Sound & length">
            <span className="vm-ico">🎚</span>
          </button>
          <div className="vm-flyout" {...flyoutBind("sound")}>
            <div className="vm-flyout-title">Sound</div>
            <label className="vm-flyout-row">
              <span>Length</span>
              <select value={beatsPerChord} onChange={e => setBeatsPerChord(Number(e.target.value))}>
                {[2, 3, 4, 6, 8].map(value => <option key={value} value={value}>{value} beats</option>)}
              </select>
            </label>
            <label className="vm-flyout-row">
              <span>Wave</span>
              <select value={waveform} onChange={e => setWaveform(e.target.value)}>
                <option value="sine">Sine</option>
                <option value="triangle">Triangle</option>
                <option value="sawtooth">Sawtooth</option>
                <option value="square">Square</option>
              </select>
            </label>
            <label className="vm-flyout-row">
              <span>Volume</span>
              <input type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))} />
              <em>{volume}%</em>
            </label>
          </div>
        </div>

        <div className={`vm-flyout-wrap ${openFlyout === "zoom" ? "open" : ""}`} {...flyoutBind("zoom")}>
          <button className={`vm-icon-btn ${openFlyout === "zoom" ? "active" : ""}`} data-tip="Zoom" title="Zoom">
            <span className="vm-ico">🔍</span>
          </button>
          <div className="vm-flyout" {...flyoutBind("zoom")}>
            <div className="vm-flyout-title">Zoom</div>
            <div className="vm-flyout-row" style={{ gridTemplateColumns: "1fr", fontSize: 10, color: "#8fa1b5" }}>
              Scroll wheel on the bar ruler (1 · 2 · 3) to zoom
            </div>
            <label className="vm-flyout-row">
              <span>Width</span>
              <input type="range" min="0.05" max="4" step="0.01" value={zoomX}
                onChange={e => zoomHorizontal(Number(e.target.value), zoomAnchorScreenX())} />
              <em>{Math.round(zoomX * 100)}%</em>
            </label>
            <label className="vm-flyout-row">
              <span>Height</span>
              <input type="range" min="0.75" max="2.5" step="0.05" value={zoomY} onChange={e => setZoomY(Number(e.target.value))} />
              <em>{Math.round(zoomY * 100)}%</em>
            </label>
            <div className="vm-flyout-actions">
              <button className="vm-mini-action" onClick={fitZoom}>FIT</button>
            </div>
          </div>
        </div>

        <button className="vm-icon-btn vm-icon-reset" onClick={resetMapper} data-tip="Reset arrangement" title="Reset">↺</button>
      </div>

      <div className={`vm-glide-panel ${tool === "connect" ? "open" : ""}`} aria-hidden={tool !== "connect"}>
        <div className="vm-glide-modes">
          {[
            ["auto", "AUTOMATIC", "Default. Uses Glide Amount and Glide Speed."],
            ["freehand", "FREEHAND", "Draw your own curve from one note to another."],
            ["advanced", "ADVANCED", "Select a glide and move its points."]
          ].map(([id, title, text]) => (
            <button key={id} className={`vm-glide-mode ${glideMode === id ? "active" : ""}`} onClick={() => chooseGlideMode(id)}>
              <strong>{title}</strong>
              <small>{text}</small>
            </button>
          ))}
        </div>
        <div className="vm-glide-actions">
          <button className="vm-mini-action" onClick={autoConnectAll}>AUTO-CONNECT ALL</button>
          <button className="vm-mini-action" onClick={resetSelectedGlide} disabled={!selectedGlide}>RESET SELECTED TO AUTOMATIC</button>
          <button className="vm-mini-action" onClick={() => selectedGlide && removeConnection(selectedGlide)} disabled={!selectedGlide}>DELETE SELECTED GLIDE</button>
        </div>
      </div>

      <div className="vm-hint">{hintText}</div>

      <div className="vm-body">
      <div className="vm-main-col">
      <div className="vm-roll-outer" ref={outerRef}
        onScroll={event => { if (velScrollRef.current) velScrollRef.current.scrollLeft = event.currentTarget.scrollLeft; }}>
        <div className="vm-roll">
          <div className="vm-keyboard"
            onPointerDown={handleKeyboardPointerDown}
            onPointerMove={handleKeyboardPointerMove}
            onPointerUp={handleKeyboardPointerUp}
            onPointerCancel={handleKeyboardPointerUp}>
            {Array.from({ length: HIGH - LOW + 1 }, (_, index) => {
              const midi = HIGH - index;
              const black = [1, 3, 6, 8, 10].includes(midi % 12);
              const glow = activeKeys.get(midi) || (pressedKey === midi ? "#62d8cb" : null);
              return (
                <div key={midi} data-midi={midi}
                  className={`vm-key ${black ? "black" : "white"} ${glow ? "active" : ""}`}
                  style={{ height: ROW, ...(glow ? { background: glow, boxShadow: `0 0 12px ${glow}, inset 0 0 0 1px #ffffffaa` } : {}) }}>
                  <span style={glow ? { color: "#0d1520" } : undefined}>{noteName(midi)}</span>
                </div>
              );
            })}
          </div>

          <div className="vm-grid-wrap">
            <div
              ref={rulerRef}
              className={`vm-bar-ruler${rulerZooming ? " zooming" : ""}`}
              style={{ width: gridWidth }}
              onPointerDown={event => {
                if (event.button !== 0) return;
                seekToBeat(beatFromRulerEvent(event));
                markerDragRef.current = { dragging: true };
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={event => {
                if (!markerDragRef.current?.dragging) return;
                seekToBeat(beatFromRulerEvent(event));
              }}
              onPointerUp={() => { markerDragRef.current = null; }}
              onPointerCancel={() => { markerDragRef.current = null; }}
              title="Click or drag to move the play position · Scroll to zoom · Then press Play to start from there"
            >
              {Array.from({ length: Math.ceil(totalBeats / 4) + 1 }, (_, bar) => (
                <div key={bar} className="vm-bar-cell" style={{ left: bar * 4 * BEAT, width: 4 * BEAT }}>
                  <span className="vm-bar-num">{bar + 1}</span>
                  <span className="vm-bar-ticks">
                    {[0, 1, 2, 3].map(b => (
                      <i key={b} className={b === 0 ? "major" : ""} style={{ left: b * BEAT }} />
                    ))}
                  </span>
                </div>
              ))}
              <div
                className="vm-start-marker"
                style={{ left: markerX }}
                onPointerDown={event => {
                  event.stopPropagation();
                  markerDragRef.current = { dragging: true };
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={event => {
                  if (!markerDragRef.current?.dragging) return;
                  const ruler = event.currentTarget.parentElement;
                  if (!ruler) return;
                  const rect = ruler.getBoundingClientRect();
                  const localX = event.clientX - rect.left;
                  const step = snapStepRef.current;
                  let beat = localX / BEAT;
                  if (step > 0) beat = snapTo(beat, step);
                  seekToBeat(beat);
                }}
                onPointerUp={() => { markerDragRef.current = null; }}
              >
                <div className="vm-marker-flag" />
                <div className="vm-marker-line" />
              </div>
            </div>

            <div className="vm-chord-heads">
              {progression.map((chord, index) => {
                const shown = revealedChords.has(index);
                return (
                  <div className={`vm-chord-head ${shown ? "revealed" : "hidden-chord"}`} key={chord.id} style={{ width: chordWidth }}>
                    {shown ? (
                      <>
                        <strong>{noteNames[chord.root]} {chord.type}</strong>
                        <span>CHORD {String(index + 1).padStart(2, "0")}</span>
                      </>
                    ) : (
                      <span className="vm-chord-placeholder">· · ·</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              ref={gridRef}
              className="vm-grid"
              style={{ width: gridWidth, height: gridHeight, ...gridStyle }}
              onPointerDown={event => {
                if (event.button === 2) {
                  event.preventDefault();
                  rightDragDeletedRef.current.clear();
                  const noteElement = event.target.closest?.(".vm-note");
                  const noteId = noteElement?.dataset?.noteId;
                  if (noteId) {
                    rightDragDeletedRef.current.add(noteId);
                    eraseNote(noteId);
                  }
                  return;
                }
                if (event.button !== 0) return;
                if ((event.ctrlKey || event.metaKey) && !event.target.closest?.(".vm-note")) {
                  event.preventDefault();
                  startMarquee(event);
                  return;
                }
                if (tool === "pan" && outerRef.current) {
                  dragRef.current = { mode: "pan", startX: event.clientX, startY: event.clientY, scrollLeft: outerRef.current.scrollLeft, scrollTop: outerRef.current.scrollTop };
                  event.currentTarget.setPointerCapture(event.pointerId);
                } else if (tool === "select" && !event.target.closest?.(".vm-note") && !event.target.closest?.(".vm-connection-hit")) {
                  addNoteAtPointer(event);
                }
              }}
              onPointerMove={event => {
                if (marqueeRef.current) {
                  event.preventDefault();
                  moveMarquee(event);
                  return;
                }
                handleGridPointerMove(event);
                if (event.buttons & 2) {
                  const noteElement = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".vm-note");
                  const noteId = noteElement?.dataset?.noteId;
                  if (noteId && !rightDragDeletedRef.current.has(noteId)) {
                    rightDragDeletedRef.current.add(noteId);
                    eraseNote(noteId);
                  }
                }
              }}
              onPointerUp={event => {
                if (marqueeRef.current) {
                  event.preventDefault();
                  endMarquee();
                  return;
                }
                if (freehandRef.current) finishFreehand(event);
                finishNoteDrag();
                if (event.button === 2) rightDragDeletedRef.current.clear();
              }}
              onPointerCancel={() => { freehandRef.current = null; setFreehandPath([]); finishNoteDrag(); rightDragDeletedRef.current.clear(); endMarquee(); }}
              onContextMenu={event => event.preventDefault()}
              onClick={event => { if (tool === "draw") addNoteAtPointer(event); }}>
              {Array.from({ length: HIGH - LOW + 1 }, (_, index) => {
                const midi = HIGH - index;
                const black = [1, 3, 6, 8, 10].includes(midi % 12);
                return <div key={midi} className={`vm-grid-row ${black ? "vm-black-row" : ""}`} style={{ height: ROW }} />;
              })}

              {Array.from({ length: columnCount }, (_, index) => (
                <div key={`divider-${index}`} className="vm-chord-divider" style={{ left: index * chordWidth, height: gridHeight }} />
              ))}

              <div className="vm-marker-gridline" style={{ left: markerX, height: gridHeight }} title="Song position" />

              {playing && (
                <div className="vm-unlit" style={{ left: Math.max(0, playheadX), width: Math.max(0, gridWidth - playheadX), height: gridHeight }} />
              )}

              <svg className="vm-connections" width={gridWidth} height={gridHeight} viewBox={`0 0 ${gridWidth} ${gridHeight}`}>
                {connectionPaths.map(path => <g key={path.id}>
                  <path d={path.d} className={`vm-connection-line ${selectedGlide === path.id && glideMode === "advanced" && tool === "connect" ? "selected" : ""}`} />
                  <path d={path.d} className="vm-connection-hit"
                    onClick={event => {
                      event.stopPropagation();
                      if (tool === "connect" && glideMode === "advanced") setSelectedGlide(path.id);
                      else removeConnection(path.id);
                    }}
                    onDoubleClick={event => {
                      event.stopPropagation();
                      if (tool === "connect" && glideMode === "advanced" && selectedGlide === path.id) addGlidePoint(event, path.id);
                    }} />
                </g>)}

                {advancedGlide && (() => {
                  const from = noteMap.get(advancedGlide.from);
                  const to = noteMap.get(advancedGlide.to);
                  if (!from || !to) return null;
                  const g = getGlide(from, to, advancedGlide);
                  const knots = Array.isArray(advancedGlide.pts) ? advancedGlide.pts : virtualKnots(g);
                  return (
                    <g>
                      <rect className="vm-glide-end" x={xOfTime(g.gapStart) - 6} y={yOfPitch(g.m1) - 6} width="12" height="12" rx="3"
                        onPointerDown={event => startGlideDrag(event, advancedGlide, "start")}
                        onPointerMove={moveGlideDrag} onPointerUp={endGlideDrag} onPointerCancel={endGlideDrag} />
                      <rect className="vm-glide-end arrive" x={xOfTime(g.arrive) - 6} y={yOfPitch(g.m2) - 6} width="12" height="12" rx="3"
                        transform={`rotate(45 ${xOfTime(g.arrive)} ${yOfPitch(g.m2)})`}
                        onPointerDown={event => startGlideDrag(event, advancedGlide, "end")}
                        onPointerMove={moveGlideDrag} onPointerUp={endGlideDrag} onPointerCancel={endGlideDrag} />
                      {knots.map((knot, i) => (
                        <circle key={i} className={`vm-shape-handle ${Array.isArray(advancedGlide.pts) ? "custom" : ""}`} r="6"
                          cx={xOfTime(g.gapStart + knot.p * (g.arrive - g.gapStart))} cy={yOfPitch(g.m1 + knot.d)}
                          onPointerDown={event => startGlideDrag(event, advancedGlide, "point", i)}
                          onPointerMove={moveGlideDrag} onPointerUp={endGlideDrag} onPointerCancel={endGlideDrag}
                          onDoubleClick={event => { event.stopPropagation(); removeGlidePoint(advancedGlide, i); }} />
                      ))}
                    </g>
                  );
                })()}

                {connectorMode && connectionSource && connectorCursor && (() => {
                  const source = noteMap.get(connectionSource);
                  if (!source) return null;
                  const x1 = noteX(source) + source.duration * BEAT;
                  const y1 = noteY(source) + ROW / 2;
                  const curve = Math.max(30, Math.abs(connectorCursor.x - x1) * 0.4);
                  return <path d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${connectorCursor.x - curve} ${connectorCursor.y}, ${connectorCursor.x} ${connectorCursor.y}`} className="vm-connection-preview" />;
                })()}

                {freehandPath.length > 1 && (
                  <polyline className="vm-connection-preview" points={freehandPath.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")} />
                )}

                {playing && (
                  <>
                    <defs>
                      <clipPath id="vm-travelled">
                        <rect x="0" y="0" width={Math.max(0, playheadX)} height={gridHeight} />
                      </clipPath>
                    </defs>
                    <g clipPath="url(#vm-travelled)">
                      <g className="vm-trail-glow">
                        {trailPaths.map(path => <path key={`g${path.key}`} d={path.d} stroke={path.color} />)}
                      </g>
                      <g className="vm-trail-core">
                        {trailPaths.map(path => <path key={`c${path.key}`} d={path.d} stroke={path.color} />)}
                      </g>
                    </g>
                  </>
                )}
                <g className="vm-playhead" transform={`translate(${playheadX} 0)`}>
                  <line className="vm-playhead-glow" x1="0" y1="0" x2="0" y2={gridHeight} />
                  <line className="vm-playhead-line" x1="0" y1="0" x2="0" y2={gridHeight} />
                </g>

                {playbackDots.map(dot => <g key={dot.id} className="vm-playback-dot" transform={`translate(${dot.x} ${dot.y})`}>
                  <circle className="vm-dot-halo" cx="0" cy="0" r="13" style={{ fill: dot.color }} />
                  <circle className="vm-dot-core" cx="0" cy="0" r="6" style={{ fill: dot.color, filter: `drop-shadow(0 0 7px ${dot.color})` }} />
                  <text x="0" y="-15" textAnchor="middle" style={{ fill: dot.color }}>{dot.label}</text>
                </g>)}
              </svg>

              {marquee && (
                <div
                  className="vm-marquee"
                  style={{
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0)
                  }}
                />
              )}

              {notes.map((note, index) => {
                const isSelected = selectedSet.has(note.id);
                const isMarquee = marqueeSelected.has(note.id);
                return <div key={note.id}
                  data-note-id={note.id}
                  className={`vm-note ${isSelected ? "selected" : ""} ${isMarquee ? "marquee-selected" : ""} ${connectionSource === note.id ? "connecting" : ""}`}
                  style={{
                    left: noteX(note),
                    top: noteY(note),
                    width: Math.max(32, note.duration * BEAT),
                    height: ROW - 3,
                    background: NOTE_COLORS[index % NOTE_COLORS.length],
                    borderRadius: 0,
                  }}
                  onContextMenu={event => event.preventDefault()}
                  onPointerDown={event => {
                    if (event.button === 2) {
                      event.preventDefault();
                      event.stopPropagation();
                      rightDragDeletedRef.current.add(note.id);
                      eraseNote(note.id);
                    } else if (tool === "connect") {
                      if (glideMode === "freehand") startFreehand(event, note);
                      else if (glideMode === "auto") startConnectorDrag(event, note.id);
                      else event.stopPropagation();
                    } else if (tool === "select" || tool === "draw") startNoteDrag(event, note);
                    else event.stopPropagation();
                  }}
                  onPointerUp={event => finishConnectorDrag(event, note.id)}
                  onClick={event => {
                    event.stopPropagation();
                    if (tool === "erase") eraseNote(note.id);
                    if (tool === "slice") sliceNote(event, note);
                    if (tool === "remove") { saveHistory(); setConnections(previous => previous.filter(edge => edge.from !== note.id && edge.to !== note.id)); }
                    if (tool === "select" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !lastDragMovedRef.current) {
                      setSelectedNote(note.id);
                      setSelectedNotes([note.id]);
                      setMarqueeSelected(new Set());
                    }
                  }}>
                  <button className={`vm-note-dot ${connectorMode ? "connector-ready" : ""}`} title="Drag from here to another note to create a glide"
                    onPointerDown={event => {
                      if (event.button === 2) return;
                      if (tool === "connect" && glideMode === "auto") startConnectorDrag(event, note.id);
                      else if (tool === "connect" && glideMode === "freehand") startFreehand(event, note);
                      else event.stopPropagation();
                    }}
                    onClick={event => { event.stopPropagation(); if (connectorMode) handleConnectionDot(note.id); }} />
                  <span>{noteName(note.midi)}</span>
                  <button className="vm-resize" title="Drag to change note length"
                    onPointerDown={event => { if (tool === "select") startNoteDrag(event, note, "resize"); }} />
                </div>;
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="vm-velocity">
        <div className="vm-velocity-label">
          <strong>VELOCITY</strong>
          <span>drag a bar</span>
        </div>
        <div className="vm-velocity-scroll" ref={velScrollRef}>
          <div className="vm-velocity-lane" ref={velLaneRef} style={{ width: gridWidth, height: VEL_PANEL_HEIGHT, ...velocityStyle }}>
            {notes.map((note, index) => {
              const velocity = note.velocity ?? 100;
              return (
                <div key={note.id}
                  className={`vm-vel-bar ${selectedSet.has(note.id) ? "selected" : ""}`}
                  style={{ left: noteX(note) + (velocityOffsets.get(note.id) || 0) }}
                  title={`${noteName(note.midi)} · velocity ${velocity}`}
                  onPointerDown={event => startVelocityDrag(event, note)}
                  onPointerMove={event => { if (velDragRef.current?.id === note.id) applyVelocityFromPointer(event); }}
                  onPointerUp={() => { velDragRef.current = null; }}
                  onPointerCancel={() => { velDragRef.current = null; }}>
                  <span style={{ height: Math.max(4, (velocity / 127) * VEL_BAR_MAX), background: NOTE_COLORS[index % NOTE_COLORS.length] }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {dockOpen && (
        <aside className="vm-dock">
          <div className="vm-dock-head">
            <strong>NOW PLAYING</strong>
            <div className="vm-dock-modes">
              <button className={labelMode === "piano" ? "active" : ""} onClick={() => setLabelMode("piano")}>PIANO</button>
              <button className={labelMode === "solfege" ? "active" : ""} onClick={() => setLabelMode("solfege")}>SOLFÈGE</button>
            </div>
          </div>

          {labelMode === "piano" ? (
            <div className="vm-mini-piano" style={{ "--white-count": miniWhiteCount }}>
              {miniKeys.map(({ midi, isBlack, whiteIndex }) => {
                const color = miniKeyMap.get(midi);
                return (
                  <div key={midi}
                    className={`vm-mini-key ${isBlack ? "black" : "white"} ${color ? "active" : ""}`}
                    style={{ "--white-index": whiteIndex, ...(color ? { background: color, boxShadow: `0 0 10px ${color}` } : {}) }}>
                    {midi % 12 === 0 && <span>{nameOf(midi)}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="vm-solfege-board">
              {SOLFEGE.map((syllable, pc) => {
                const hits = [...miniKeyMap.entries()].filter(([midi]) => ((midi % 12) + 12) % 12 === pc);
                const color = hits.length ? hits[0][1] : null;
                return (
                  <div key={syllable}
                    className={`vm-solfege-pad ${[1, 3, 6, 8, 10].includes(pc) ? "sharp" : ""} ${color ? "active" : ""}`}
                    style={color ? { background: color, boxShadow: `0 0 14px ${color}` } : undefined}>
                    <strong>{syllable}</strong>
                    {hits.length > 0 && <small>{hits.map(([midi]) => Math.floor(midi / 12) - 1).join(" ")}</small>}
                  </div>
                );
              })}
            </div>
          )}

          <div className="vm-chips">
            {chordList.length === 0
              ? <span className="vm-chips-empty">Press play, or select notes, to see them here.</span>
              : chordList.map(midi => (
                <span key={midi} className="vm-chip" style={{ borderColor: chipColor(midi), color: chipColor(midi) }}>{nameOf(midi)}</span>
              ))}
          </div>

          <div className="vm-guitar">
            <span className="vm-dock-sub">GUITAR SHAPE</span>
            <GuitarChord shape={guitarShape} nameOf={nameOf} />
          </div>
        </aside>
      )}
      </div>

      <footer className="vm-footer">
        <span><strong>{notes.length}</strong> NOTES</span>
        <span><strong>{selectedSet.size}</strong> SELECTED</span>
        <span><strong>{connections.length}</strong> GLIDE CONNECTIONS</span>
        <span><strong>{progression.length}</strong> CHORDS</span>
        <span><strong>{rememberedDuration.toFixed(2)}</strong> BEATS NEW-NOTE LENGTH</span>
        <span><strong>{snapEnabled ? snapLabel : "OFF"}</strong> SNAP</span>
        <span className="vm-scroll-status">FOLLOW PLAYBACK: {continuousScroll ? "ON" : "OFF"}</span>
      </footer>
    </div>
  );
}