import { useEffect, useMemo, useRef, useState } from "react";

const LOW = 36;
const HIGH = 83;
const ROW = 18;
const BEAT = 42;
const CHORD_WIDTH = 240;

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const noteName = midi =>
  noteNames[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);

const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const getGlideDuration = (transitionDuration, amount, speed) => {
  const amountFactor = clamp(amount, 0, 100) / 100;
  const speedFactor = 1 - (clamp(speed, 0, 100) / 100) * 0.9;
  return transitionDuration * amountFactor * speedFactor;
};


function makeInitialNotes(progression) {
  return progression.flatMap((chord, chordIndex) =>
    chord.notes.map((midi, noteIndex) => ({
      id: `${chord.id}-note-${noteIndex}`,
      chordIndex,
      midi,
      beat: 0,
      duration: 2.2
    }))
  );
}

function makeAutomaticConnections(notes, chordCount) {
  const connections = [];

  for (let chordIndex = 0; chordIndex < chordCount - 1; chordIndex++) {
    const current = notes.filter(note => note.chordIndex === chordIndex);
    const next = notes.filter(note => note.chordIndex === chordIndex + 1);
    const available = [...next];

    current.forEach(source => {
      if (!available.length) return;

      let closestIndex = 0;
      let closestDistance = Infinity;

      available.forEach((target, index) => {
        const distance = Math.abs(source.midi - target.midi);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      const target = available.splice(closestIndex, 1)[0];

      connections.push({
        id: `${source.id}__${target.id}`,
        from: source.id,
        to: target.id
      });
    });
  }

  return connections;
}

export default function VoiceMapper({
  progression = [],
  bpm = 120,
  onBpmChange,
  onClose
}) {
  const [notes, setNotes] = useState(() => makeInitialNotes(progression));

  const [connections, setConnections] = useState(() => {
    const initialNotes = makeInitialNotes(progression);
    return makeAutomaticConnections(initialNotes, progression.length);
  });

  const [selectedNote, setSelectedNote] = useState(null);
  const [selectedNotes, setSelectedNotes] = useState([]);
  const clipboardRef = useRef([]);
  const erasedDuringDragRef = useRef(new Set());

  const [connectionSource, setConnectionSource] = useState(null);
  const [connectorMode, setConnectorMode] = useState(false);
  const [tool, setTool] = useState("select");
  const [snapEnabled, setSnapEnabled] = useState(true);

  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const [connectorCursor, setConnectorCursor] = useState(null);
  const [continuousScroll, setContinuousScroll] = useState(true);

  const [playbackBeat, setPlaybackBeat] = useState(0);
  const playbackBeatRef = useRef(0);

  const playbackAnchorBeatRef = useRef(0);
  const playbackAnchorAudioTimeRef = useRef(0);
  const bpmRef = useRef(bpm);

  const [glideAmount, setGlideAmount] = useState(50);
  const [glideSpeed, setGlideSpeed] = useState(1);
  const [beatsPerChord, setBeatsPerChord] = useState(4);

  const [volume, setVolume] = useState(65);
  const [waveform, setWaveform] = useState("triangle");

  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  const [metronomeOn, setMetronomeOn] = useState(false);
  const metronomeNextBeatRef = useRef(0);
  const metronomeBeatRef = useRef(0);

  const gridRef = useRef(null);
  const outerRef = useRef(null);
  const dragRef = useRef(null);

  const audioRef = useRef(null);
  const nodesRef = useRef([]);
  const playbackGenerationRef = useRef(0);
  const playbackRafRef = useRef(null);

  const gridWidth = Math.max(4, progression.length) * CHORD_WIDTH;
  const gridHeight = (HIGH - LOW + 1) * ROW;

  const beatSeconds = 60 / bpm;
  const chordDuration = beatsPerChord * beatSeconds;

  // Keep the ref synchronized with the latest tempo.
  bpmRef.current = bpm;

  const noteMap = useMemo(
    () => new Map(notes.map(note => [note.id, note])),
    [notes]
  );

  const incoming = useMemo(
    () => new Set(connections.map(connection => connection.to)),
    [connections]
  );

  const playbackChains = useMemo(() => {
    const outgoing = new Map(
      connections.map(connection => [connection.from, connection.to])
    );

    const visited = new Set();
    const chains = [];

    notes.forEach(note => {
      if (incoming.has(note.id) || visited.has(note.id)) return;

      const chain = [];
      let current = note;

      while (current && !visited.has(current.id)) {
        chain.push(current);
        visited.add(current.id);

        const nextId = outgoing.get(current.id);
        current = nextId ? noteMap.get(nextId) : null;
      }

      if (chain.length) chains.push(chain);
    });

    notes.forEach(note => {
      if (!visited.has(note.id)) {
        chains.push([note]);
        visited.add(note.id);
      }
    });

    return chains;
  }, [connections, incoming, noteMap, notes]);

  function getCurrentBeat() {
    const audio = audioRef.current;

    if (!audio || !playing || paused) {
      return playbackBeatRef.current;
    }

    return playbackAnchorBeatRef.current +
      Math.max(
        0,
        audio.currentTime - playbackAnchorAudioTimeRef.current
      ) * bpmRef.current / 60;
  }

  function getNotePosition(note) {
    return {
      x: note.chordIndex * CHORD_WIDTH + note.beat * BEAT,
      y: (HIGH - note.midi) * ROW
    };
  }

  const playbackDots = useMemo(() => {
    if (!playing) return [];

    const dots = [];
    const currentBeat = playbackBeat;

    playbackChains.forEach((chain, chainIndex) => {
      for (let index = 0; index < chain.length; index++) {
        const current = chain[index];
        const next = chain[index + 1];

        const startBeat =
          current.chordIndex * beatsPerChord + current.beat;

        const endBeat = startBeat + current.duration;

        const nextStartBeat = next
          ? next.chordIndex * beatsPerChord + next.beat
          : Infinity;

        const transitionEnd = next
          ? Math.max(nextStartBeat, endBeat)
          : endBeat;

        if (currentBeat < startBeat) continue;
        if (currentBeat > transitionEnd) continue;

        const position = getNotePosition(current);
        const noteEndX = position.x + current.duration * BEAT;
        const noteY = position.y + ROW / 2;

        const glideDuration = getGlideDuration(Math.max(0, transitionEnd - endBeat), glideAmount, glideSpeed);

        const glideStart = next
        ? Math.max(endBeat, transitionEnd - glideDuration)
        : endBeat;

        // Dot stays on the current note until the glide starts.
        if (!next || currentBeat <= glideStart) {
          const progress = clamp(
            (currentBeat - startBeat) /
              Math.max(0.001, endBeat - startBeat),
            0,
            1
          );

          dots.push({
            id: `voice-${chainIndex}`,
            x: position.x + (noteEndX - position.x) * progress,
            y: noteY,
            label: noteName(current.midi)
          });

          break;
        }

        const target = getNotePosition(next);

        const glideProgress = clamp(
          (currentBeat - glideStart) /
            Math.max(0.001, transitionEnd - glideStart),
          0,
          1
        );

        const x1 = noteEndX;
        const y1 = noteY;
        const x2 = target.x;
        const y2 = target.y + ROW / 2;

        const curve = Math.max(30, Math.abs(x2 - x1) * 0.4);
        const inverse = 1 - glideProgress;

        const x =
          inverse ** 3 * x1 +
          3 * inverse ** 2 * glideProgress * (x1 + curve) +
          3 * inverse * glideProgress ** 2 * (x2 - curve) +
          glideProgress ** 3 * x2;

        const y =
          inverse ** 3 * y1 +
          3 * inverse ** 2 * glideProgress * y1 +
          3 * inverse * glideProgress ** 2 * y2 +
          glideProgress ** 3 * y2;

        dots.push({
          id: `voice-${chainIndex}`,
          x,
          y,
          label: noteName(
            glideProgress < 0.5 ? current.midi : next.midi
          )
        });

        break;
      }
    });

    return dots;
  }, [
    playing,
    playbackChains,
    playbackBeat,
    beatsPerChord,
    glideAmount,
    glideSpeed
  ]);

  function stopPlayback(updateState = true) {
    playbackGenerationRef.current += 1;

    nodesRef.current.forEach(node => {
      try {
        node.stop();
      } catch {}
    });

    nodesRef.current = [];

    if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current);
    }

    playbackRafRef.current = null;

    if (updateState) {
      playbackBeatRef.current = 0;
      playbackAnchorBeatRef.current = 0;

      setPlaybackBeat(0);
      setPlaying(false);
      setPaused(false);
    }
  }

  async function playProgression() {
    try {
      const AudioClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioClass) {
        alert("Your browser does not support Web Audio.");
        return;
      }

      if (!audioRef.current || audioRef.current.state === "closed") {
        audioRef.current = new AudioClass();
      }

      const audio = audioRef.current;

      if (audio.state === "suspended") {
        await audio.resume();
      }

      // Resume from the exact beat where playback was paused.
      if (playing && paused) {
        playbackAnchorBeatRef.current = playbackBeatRef.current;
        playbackAnchorAudioTimeRef.current = audio.currentTime;

        setPaused(false);
        return;
      }

      if (playing) return;
      if (!notes.length) return;

      playbackBeatRef.current = 0;
      playbackAnchorBeatRef.current = 0;
      playbackAnchorAudioTimeRef.current = audio.currentTime + 0.08;

      setPlaybackBeat(0);
      setPaused(false);
      setPlaying(true);
    } catch (error) {
      console.error("Voice Mapper playback error:", error);
      stopPlayback();
    }
  }

  function changeBpm(nextBpm) {
    const safeBpm = clamp(Math.round(nextBpm), 40, 240);

    if (safeBpm === bpmRef.current) return;

    // Preserve the current musical position when tempo changes.
    if (playing && !paused) {
      const currentBeat = getCurrentBeat();

      playbackBeatRef.current = currentBeat;
      playbackAnchorBeatRef.current = currentBeat;

      if (audioRef.current) {
        playbackAnchorAudioTimeRef.current =
          audioRef.current.currentTime;
      }

      setPlaybackBeat(currentBeat);
    }

    bpmRef.current = safeBpm;
    onBpmChange?.(safeBpm);
  }

  // Live audio scheduler.
  // Rebuilds the remaining audio whenever notes or playback settings change.
  useEffect(() => {
    if (!playing || paused) return undefined;

    const audio = audioRef.current;

    if (!audio || audio.state !== "running") {
      return undefined;
    }

    const generation = ++playbackGenerationRef.current;

    const activeNodes = [];
    let remaining = 0;

    const currentBeat = getCurrentBeat();
    const secondsPerBeat = 60 / bpm;

    const beatToTime = beat =>
      playbackAnchorAudioTimeRef.current +
      (beat - playbackAnchorBeatRef.current) * secondsPerBeat;

    const noteStart = note =>
      note.chordIndex * beatsPerChord + note.beat;

    const noteEnd = note =>
      noteStart(note) + note.duration;

    const safeStart = audio.currentTime + 0.025;
    const level = (volume / 100) * 0.15;

    playbackChains.forEach(chain => {
      if (!chain.length) return;

      const first = chain[0];
      const chainStartBeat = noteStart(first);

      let finalBeat = Math.max(...chain.map(noteEnd));

      for (let i = 0; i < chain.length - 1; i++) {
        const transitionEnd = Math.max(
          noteStart(chain[i + 1]),
          noteEnd(chain[i])
        );

        finalBeat = Math.max(finalBeat, transitionEnd);
      }

      // Nothing left to play in this chain.
      if (finalBeat <= currentBeat) return;

      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.type = waveform;

      // Find the pitch at the exact current playback position.
      let currentMidi = first.midi;

      for (let i = 0; i < chain.length - 1; i++) {
        const previous = chain[i];
        const target = chain[i + 1];

        const transitionEnd = Math.max(
          noteStart(target),
          noteEnd(previous)
        );

        const glideStart = Math.max(
      noteEnd(previous),
      transitionEnd - getGlideDuration(
        Math.max(0, transitionEnd - noteEnd(previous)),
        glideAmount,
        glideSpeed
      )
    );

        if (currentBeat >= transitionEnd) {
          currentMidi = target.midi;
          continue;
        }

        if (currentBeat > glideStart) {
          const progress = clamp(
            (currentBeat - glideStart) /
              Math.max(0.001, transitionEnd - glideStart),
            0,
            1
          );

          currentMidi =
            previous.midi +
            (target.midi - previous.midi) * progress;
        } else if (currentBeat >= noteStart(previous)) {
          currentMidi = previous.midi;
        }

        break;
      }

      oscillator.frequency.setValueAtTime(
        frequency(currentMidi),
        safeStart
      );

      // Schedule all future glides from the current position.
      for (let i = 0; i < chain.length - 1; i++) {
        const previous = chain[i];
        const target = chain[i + 1];

        const transitionEnd = Math.max(
          noteStart(target),
          noteEnd(previous)
        );

        if (transitionEnd <= currentBeat) continue;

        const glideStart = Math.max(
      noteEnd(previous),
      transitionEnd - getGlideDuration(
        Math.max(0, transitionEnd - noteEnd(previous)),
        glideAmount,
        glideSpeed
      )
    );

        const endTime = Math.max(
          safeStart + 0.005,
          beatToTime(transitionEnd)
        );

        if (glideStart <= currentBeat) {
          const progress = clamp(
            (currentBeat - glideStart) /
              Math.max(0.001, transitionEnd - glideStart),
            0,
            1
          );

          const startMidi =
            previous.midi +
            (target.midi - previous.midi) * progress;

          oscillator.frequency.setValueAtTime(
            frequency(startMidi),
            safeStart
          );

          oscillator.frequency.linearRampToValueAtTime(
            frequency(target.midi),
            endTime
          );
        } else {
          const glideStartTime = Math.max(
            safeStart,
            beatToTime(glideStart)
          );

          oscillator.frequency.setValueAtTime(
            frequency(previous.midi),
            glideStartTime
          );

          oscillator.frequency.linearRampToValueAtTime(
            frequency(target.midi),
            Math.max(glideStartTime + 0.005, endTime)
          );
        }
      }

      const chainEndTime = beatToTime(finalBeat);
      const chainStartTime = beatToTime(chainStartBeat);

      gain.gain.setValueAtTime(0.0001, safeStart);

      if (chainStartBeat <= currentBeat) {
        gain.gain.setValueAtTime(level, safeStart);
      } else {
        const fadeStart = Math.max(safeStart, chainStartTime);

        gain.gain.setValueAtTime(0.0001, fadeStart);
        gain.gain.linearRampToValueAtTime(
          level,
          fadeStart + 0.02
        );
      }

      const fadeOutStart = Math.max(
        safeStart,
        chainEndTime - 0.08
      );

      gain.gain.setValueAtTime(level, fadeOutStart);

      gain.gain.linearRampToValueAtTime(
        0.0001,
        Math.max(chainEndTime, safeStart + 0.1)
      );

      oscillator.connect(gain);
      gain.connect(audio.destination);

      remaining += 1;

      oscillator.onended = () => {
        remaining -= 1;

        if (
          remaining <= 0 &&
          generation === playbackGenerationRef.current
        ) {
          nodesRef.current = [];
          playbackBeatRef.current = 0;
          playbackAnchorBeatRef.current = 0;

          setPlaybackBeat(0);
          setPlaying(false);
          setPaused(false);
        }
      };

      oscillator.start(safeStart);

      oscillator.stop(
        Math.max(chainEndTime + 0.12, safeStart + 0.2)
      );

      activeNodes.push(oscillator);
    });

    nodesRef.current = activeNodes;

    if (!activeNodes.length) {
      setPlaying(false);
    }

    return () => {
      if (generation === playbackGenerationRef.current) {
        playbackGenerationRef.current += 1;
      }

      activeNodes.forEach(node => {
        try {
          node.stop();
        } catch {}
      });

      if (nodesRef.current === activeNodes) {
        nodesRef.current = [];
      }
    };
  }, [
    playing,
    paused,
    playbackChains,
    bpm,
    beatsPerChord,
    glideAmount,
    glideSpeed,
    waveform,
    volume
  ]);

  async function toggleMetronome() {
    if (metronomeOn) {
      setMetronomeOn(false);
      return;
    }

    try {
      const AudioClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioClass) return;

      if (!audioRef.current || audioRef.current.state === "closed") {
        audioRef.current = new AudioClass();
      }

      if (audioRef.current.state === "suspended") {
        await audioRef.current.resume();
      }

      metronomeNextBeatRef.current =
        audioRef.current.currentTime + 0.06;

      metronomeBeatRef.current = 0;
      setMetronomeOn(true);
    } catch (error) {
      console.error("Voice Mapper metronome error:", error);
    }
  }

  useEffect(() => {
    if (!metronomeOn) return undefined;

    const scheduleClick = (audio, time, accented) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.type = "sine";

      oscillator.frequency.setValueAtTime(
        accented ? 1320 : 880,
        time
      );

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.16, time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

      oscillator.connect(gain);
      gain.connect(audio.destination);

      oscillator.start(time);
      oscillator.stop(time + 0.06);
    };

    metronomeNextBeatRef.current =
      (audioRef.current?.currentTime || 0) + 0.04;

    metronomeBeatRef.current = 0;

    const timer = window.setInterval(() => {
      const audio = audioRef.current;

      if (!audio || audio.state !== "running") return;

      while (
        metronomeNextBeatRef.current <
        audio.currentTime + 0.12
      ) {
        scheduleClick(
          audio,
          metronomeNextBeatRef.current,
          metronomeBeatRef.current % 4 === 0
        );

        metronomeNextBeatRef.current += 60 / bpm;
        metronomeBeatRef.current += 1;
      }
    }, 20);

    return () => window.clearInterval(timer);
  }, [metronomeOn, bpm]);

  async function pausePlayback() {
    if (!playing || paused) return;

    const currentBeat = getCurrentBeat();

    playbackBeatRef.current = currentBeat;
    playbackAnchorBeatRef.current = currentBeat;

    setPlaybackBeat(currentBeat);

    if (audioRef.current?.state === "running") {
      await audioRef.current.suspend();
    }

    setPaused(true);
  }

  function resetMapper() {
    stopPlayback();

    const freshNotes = makeInitialNotes(progression);

    setNotes(freshNotes);
    setConnections(
      makeAutomaticConnections(freshNotes, progression.length)
    );

    setSelectedNote(null);
    setSelectedNotes([]);
    setConnectionSource(null);
    setConnectorCursor(null);
  }

  function saveHistory() {
    setUndoStack(stack => [
      ...stack.slice(-39),
      { notes, connections }
    ]);

    setRedoStack([]);
  }

  function chooseTool(nextTool) {
    setTool(nextTool);
    setConnectorMode(nextTool === "connect");
    setConnectionSource(null);
    setConnectorCursor(null);
    dragRef.current = null;
  }

  function addNoteAtPointer(event) {
    if (!gridRef.current) return;

    const rect = gridRef.current.getBoundingClientRect();

    const x = Math.max(
      0,
      event.clientX -
        rect.left +
        (outerRef.current?.scrollLeft || 0)
    );

    const y = clamp(
      event.clientY - rect.top,
      0,
      gridHeight - 1
    );

    const rawBeat = (x % CHORD_WIDTH) / BEAT;

    const beat = snapEnabled
      ? Math.round(rawBeat * 4) / 4
      : rawBeat;

    const chordIndex = Math.floor(x / CHORD_WIDTH);

    const midi = clamp(
      HIGH - Math.floor(y / ROW),
      LOW,
      HIGH
    );

    saveHistory();

    setNotes(previous => [
      ...previous,
      {
        id: `drawn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        chordIndex,
        midi,
        beat,
        duration: 1
      }
    ]);
  }

  function eraseNote(noteId, record = true) {
    if (!notes.some(note => note.id === noteId)) return;

    if (record) saveHistory();

    setNotes(previous =>
      previous.filter(note => note.id !== noteId)
    );

    setConnections(previous =>
      previous.filter(
        edge => edge.from !== noteId && edge.to !== noteId
      )
    );

    setSelectedNotes(previous =>
      previous.filter(id => id !== noteId)
    );

    if (selectedNote === noteId) {
      setSelectedNote(null);
    }
  }

  function eraseAtPoint(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    const noteElement = element?.closest?.("[data-note-id]");
    const id = noteElement?.getAttribute("data-note-id");

    if (
      id &&
      !erasedDuringDragRef.current.has(id)
    ) {
      if (erasedDuringDragRef.current.size === 0) {
        saveHistory();
      }

      erasedDuringDragRef.current.add(id);
      eraseNote(id, false);
    }
  }

  function sliceNote(event, note) {
    const rect = event.currentTarget.getBoundingClientRect();

    const fraction = clamp(
      (event.clientX - rect.left) / rect.width,
      0.2,
      0.8
    );

    const firstDuration = note.duration * fraction;
    const secondDuration = note.duration - firstDuration;

    saveHistory();

    setNotes(previous =>
      previous.flatMap(item =>
        item.id !== note.id
          ? [item]
          : [
              { ...item, duration: firstDuration },
              {
                ...item,
                id: `${item.id}-slice-${Date.now()}`,
                beat: item.beat + firstDuration,
                duration: secondDuration
              }
            ]
      )
    );
  }

  function undoEdit() {
    if (!undoStack.length) return;

    const previous = undoStack[undoStack.length - 1];

    setRedoStack(stack => [
      ...stack,
      { notes, connections }
    ]);

    setNotes(previous.notes);
    setConnections(previous.connections);

    setUndoStack(stack => stack.slice(0, -1));
  }

  function redoEdit() {
    if (!redoStack.length) return;

    const next = redoStack[redoStack.length - 1];

    setUndoStack(stack => [
      ...stack,
      { notes, connections }
    ]);

    setNotes(next.notes);
    setConnections(next.connections);

    setRedoStack(stack => stack.slice(0, -1));
  }

  function duplicateSelected() {
    const ids = selectedNotes.length
      ? selectedNotes
      : selectedNote
        ? [selectedNote]
        : [];

    const chosen = notes.filter(note => ids.includes(note.id));

    if (!chosen.length) return;

    saveHistory();

    const copies = chosen.map((note, index) => ({
      ...note,
      id: `copy-${Date.now()}-${index}`,
      beat: note.beat + 1
    }));

    setNotes(previous => [...previous, ...copies]);
    setSelectedNotes(copies.map(note => note.id));
    setSelectedNote(copies[0].id);
  }

  function createConnection(sourceId, targetId) {
    const source = noteMap.get(sourceId);
    const target = noteMap.get(targetId);

    if (
      !source ||
      !target ||
      source.id === target.id ||
      target.chordIndex <= source.chordIndex
    ) {
      setConnectionSource(null);
      setConnectorCursor(null);
      return;
    }

    saveHistory();

    setConnections(previous => [
      ...previous.filter(
        connection => connection.from !== source.id
      ),
      {
        id: `${source.id}__${target.id}`,
        from: source.id,
        to: target.id
      }
    ]);

    setConnectionSource(null);
    setConnectorCursor(null);
  }

  function startConnectorDrag(event, noteId) {
    event.preventDefault();
    event.stopPropagation();

    setConnectionSource(noteId);
    setSelectedNote(noteId);
    setConnectorCursor(null);
  }

  function finishConnectorDrag(event, noteId) {
    if (!connectorMode || !connectionSource) return;

    event.stopPropagation();

    if (noteId !== connectionSource) {
      createConnection(connectionSource, noteId);
    }
  }

  function removeConnection(id) {
    saveHistory();

    setConnections(previous =>
      previous.filter(connection => connection.id !== id)
    );
  }

  function startNoteDrag(event, note, mode = "move") {
    if (event.button !== 0) return;

    event.stopPropagation();
    event.preventDefault();

    let ids = selectedNotes.includes(note.id)
      ? selectedNotes
      : [note.id];

    if (
      event.shiftKey &&
      !selectedNotes.includes(note.id)
    ) {
      ids = [...selectedNotes, note.id];
    }

    if (mode === "move") {
      setSelectedNotes(ids);
      setSelectedNote(note.id);
    }

    const originals = notes
      .filter(item => ids.includes(item.id))
      .map(item => ({ ...item }));

    dragRef.current = {
      id: note.id,
      ids,
      originals,
      mode,
      startX: event.clientX,
      startY: event.clientY
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleGridPointerMove(event) {
    const drag = dragRef.current;

    if (drag?.mode === "erase") {
      eraseAtPoint(event.clientX, event.clientY);
      return;
    }

    if (drag?.mode === "pan") {
      if (outerRef.current) {
        outerRef.current.scrollLeft =
          drag.scrollLeft - (event.clientX - drag.startX);

        outerRef.current.scrollTop =
          drag.scrollTop - (event.clientY - drag.startY);
      }

      return;
    }

    if (!drag) {
      if (
        connectorMode &&
        connectionSource &&
        gridRef.current
      ) {
        const rect = gridRef.current.getBoundingClientRect();

        setConnectorCursor({
          x: clamp(event.clientX - rect.left, 0, gridWidth),
          y: clamp(event.clientY - rect.top, 0, gridHeight)
        });
      }

      return;
    }

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    const originalById = new Map(
      drag.originals.map(item => [item.id, item])
    );

    if (drag.mode === "resize") {
      setNotes(previous =>
        previous.map(note =>
          drag.ids.includes(note.id)
            ? {
                ...note,
                duration: clamp(
                  originalById.get(note.id).duration + dx / BEAT,
                  0.25,
                  8
                )
              }
            : note
        )
      );

      return;
    }

    setNotes(previous =>
      previous.map(note => {
        if (!drag.ids.includes(note.id)) return note;

        const original = originalById.get(note.id);

        const noteX =
          original.chordIndex * CHORD_WIDTH +
          original.beat * BEAT +
          dx;

        const safeX = clamp(noteX, 0, gridWidth - 12);

        const nextChord = Math.min(
          Math.max(3, progression.length - 1),
          Math.floor(safeX / CHORD_WIDTH)
        );

        let nextBeat = clamp(
          (safeX - nextChord * CHORD_WIDTH) / BEAT,
          0,
          5.5
        );

        if (snapEnabled) {
          nextBeat = Math.round(nextBeat * 4) / 4;
        }

        return {
          ...note,
          chordIndex: nextChord,
          beat: nextBeat,
          midi: clamp(
            original.midi - Math.round(dy / ROW),
            LOW,
            HIGH
          )
        };
      })
    );
  }

  function finishNoteDrag() {
    dragRef.current = null;
    erasedDuringDragRef.current.clear();
  }

  function getConnectionPath(connection) {
    const from = noteMap.get(connection.from);
    const to = noteMap.get(connection.to);

    if (!from || !to) return "";

    const fromPosition = getNotePosition(from);
    const toPosition = getNotePosition(to);

    const x1 = fromPosition.x + from.duration * BEAT;
    const y1 = fromPosition.y + ROW / 2;
    const x2 = toPosition.x;
    const y2 = toPosition.y + ROW / 2;

    const curve = Math.max(
      30,
      Math.abs(x2 - x1) * 0.4
    );

    return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
  }

  // Playback clock follows AudioContext time, not a separate wall clock.
  useEffect(() => {
    if (!playing || paused) return undefined;

    const tick = () => {
      const beat = getCurrentBeat();

      playbackBeatRef.current = beat;
      setPlaybackBeat(beat);

      playbackRafRef.current =
        requestAnimationFrame(tick);
    };

    playbackRafRef.current =
      requestAnimationFrame(tick);

    return () => {
      if (playbackRafRef.current) {
        cancelAnimationFrame(playbackRafRef.current);
      }

      playbackRafRef.current = null;
    };
  }, [playing, paused]);

  // Keep the piano roll following the playback position.
  useEffect(() => {
    if (
      !playing ||
      !continuousScroll ||
      !outerRef.current
    ) {
      return;
    }

    const playheadX =
      (playbackBeat / beatsPerChord) * CHORD_WIDTH;

    const viewport = outerRef.current;

    if (
      playheadX >
      viewport.scrollLeft + viewport.clientWidth * 0.72
    ) {
      viewport.scrollTo({
        left: Math.max(
          0,
          playheadX - viewport.clientWidth * 0.72
        ),
        behavior: "auto"
      });
    }
  }, [
    playbackBeat,
    playing,
    continuousScroll,
    beatsPerChord
  ]);

  // Clean up audio when the Voice Mapper closes.
  useEffect(() => {
    return () => {
      stopPlayback(false);

      if (
        audioRef.current &&
        audioRef.current.state !== "closed"
      ) {
        audioRef.current.close();
      }
    };
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = event => {
      const target = event.target;

      if (
        target &&
        (
          target.isContentEditable ||
          /INPUT|TEXTAREA|SELECT/.test(target.tagName)
        )
      ) {
        return;
      }

      const mod = event.ctrlKey || event.metaKey;

      const ids = selectedNotes.length
        ? selectedNotes
        : selectedNote
          ? [selectedNote]
          : [];

      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();

        if (playing) {
          stopPlayback();
        } else {
          playProgression();
        }

        return;
      }

      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();

        const allSelected =
          notes.length > 0 &&
          selectedNotes.length === notes.length;

        setSelectedNotes(
          allSelected ? [] : notes.map(note => note.id)
        );

        setSelectedNote(
          allSelected ? null : notes[0]?.id || null
        );
      } else if (
        mod &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        undoEdit();
      } else if (
        mod &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redoEdit();
      } else if (
        mod &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();

        clipboardRef.current = notes.filter(
          note => ids.includes(note.id)
        );
      } else if (
        mod &&
        event.key.toLowerCase() === "v" &&
        clipboardRef.current.length
      ) {
        event.preventDefault();
        saveHistory();

        const copies = clipboardRef.current.map(
          (note, index) => ({
            ...note,
            id: `paste-${Date.now()}-${index}`,
            beat: note.beat + 1
          })
        );

        setNotes(previous => [...previous, ...copies]);
        setSelectedNotes(copies.map(note => note.id));
        setSelectedNote(copies[0].id);
      } else if (
        mod &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        duplicateSelected();
      } else if (
        mod &&
        event.key.toLowerCase() === "q" &&
        ids.length
      ) {
        event.preventDefault();
        saveHistory();

        setNotes(previous =>
          previous.map(note =>
            ids.includes(note.id)
              ? {
                  ...note,
                  beat: Math.round(note.beat * 4) / 4
                }
              : note
          )
        );
      } else if (
        (event.key === "Delete" ||
          event.key === "Backspace") &&
        ids.length
      ) {
        event.preventDefault();
        saveHistory();

        setNotes(previous =>
          previous.filter(note => !ids.includes(note.id))
        );

        setConnections(previous =>
          previous.filter(
            edge =>
              !ids.includes(edge.from) &&
              !ids.includes(edge.to)
          )
        );

        setSelectedNotes([]);
        setSelectedNote(null);
      } else if (
        ids.length &&
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown"
        ].includes(event.key)
      ) {
        event.preventDefault();
        saveHistory();

        const dx =
          event.key === "ArrowLeft"
            ? -0.25
            : event.key === "ArrowRight"
              ? 0.25
              : 0;

        const dy =
          event.key === "ArrowUp"
            ? 1
            : event.key === "ArrowDown"
              ? -1
              : 0;

        setNotes(previous =>
          previous.map(note =>
            ids.includes(note.id)
              ? {
                  ...note,
                  beat: clamp(note.beat + dx, 0, 5.5),
                  midi: clamp(note.midi + dy, LOW, HIGH)
                }
              : note
          )
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () =>
      window.removeEventListener("keydown", onKeyDown);
  }, [
    notes,
    selectedNotes,
    selectedNote,
    undoStack,
    redoStack,
    playing,
    paused
  ]);

  return (
    <div
      className="vm-shell"
      onContextMenu={event => event.preventDefault()}
    >
      <header className="vm-header">
        <div>
          <span className="vm-eyebrow">
            KEVIN STUDIO / NOTE EDITOR
          </span>

          <h1>Voice Mapper</h1>

          <p>
            Edit how every note moves between your chords.
          </p>
        </div>

        <button
          className="vm-close"
          onClick={() => {
            stopPlayback();
            onClose?.();
          }}
        >
          Ã¢Å“â€¢ CLOSE
        </button>
      </header>

      <div className="vm-toolbar">
        <div className="vm-transport">
          {!playing ? (
            <button
              className="vm-play"
              onClick={playProgression}
            >
              Ã¢â€“Â¶ PLAY
            </button>
          ) : (
            <>
              <button
                className="vm-play"
                onClick={pausePlayback}
                disabled={paused}
              >
                {paused ? "PAUSED" : "Ã¢â€¦Â¡ PAUSE"}
              </button>

              {paused && (
                <button
                  className="vm-play vm-resume"
                  onClick={playProgression}
                >
                  Ã¢â€“Â¶ RESUME
                </button>
              )}
            </>
          )}

          <button
            className="vm-stop"
            onClick={() => stopPlayback()}
          >
            Ã¢â€“Â  STOP
          </button>
        </div>

        <div className="vm-tempo-controls">
          <label className="vm-control vm-bpm-control">
            BPM

            <button
              type="button"
              onClick={() => changeBpm(bpm - 1)}
              aria-label="Decrease BPM"
            >
              Ã¢Ë†â€™
            </button>

            <input
              type="number"
              min="40"
              max="240"
              value={bpm}
              aria-label="Voice Mapper BPM"
              onChange={event => {
                const value = Number(event.target.value);

                if (
                  Number.isFinite(value) &&
                  value >= 40 &&
                  value <= 240
                ) {
                  changeBpm(value);
                }
              }}
            />

            <button
              type="button"
              onClick={() => changeBpm(bpm + 1)}
              aria-label="Increase BPM"
            >
              +
            </button>
          </label>

          <label className="vm-bpm-slider">
            <input
              type="range"
              min="40"
              max="240"
              step="1"
              value={bpm}
              onChange={event =>
                changeBpm(Number(event.target.value))
              }
              aria-label="Adjust Voice Mapper BPM"
            />
          </label>

          <button
            type="button"
            className={`vm-metronome ${
              metronomeOn ? "active" : ""
            }`}
            onClick={toggleMetronome}
            aria-pressed={metronomeOn}
          >
            Ã¢â„¢Â© {metronomeOn
              ? "METRONOME ON"
              : "METRONOME OFF"}
          </button>
        </div>

        <div
          className="vm-edit-tools"
          role="toolbar"
          aria-label="Piano roll tools"
        >
          {[
            ["select", "Ã¢â€ â€“", "Select / Resize"],
            ["draw", "Ã¢Å“Å½", "Draw notes"],
            ["erase", "Ã¢Å’Â«", "Delete notes"],
            ["slice", "Ã¢Å“â€š", "Slice notes"],
            ["connect", "Ã¢Å’Â", "Glide connector"],
            ["remove", "Ã¢Å Ëœ", "Delete glide"],
            ["pan", "Ã¢Å“â€¹", "Pan view"]
          ].map(([id, glyph, label]) => (
            <button
              key={id}
              className={`vm-tool-icon-button ${
                tool === id ? "active" : ""
              }`}
              onClick={() => chooseTool(id)}
              title={label}
              aria-label={label}
            >
              <span>{glyph}</span>
              <small>{label}</small>
            </button>
          ))}

          <span className="vm-tool-separator" />

          <button
            className="vm-mini-action"
            onClick={undoEdit}
            disabled={!undoStack.length}
            title="Undo"
          >
            Ã¢â€ Â¶
          </button>

          <button
            className="vm-mini-action"
            onClick={redoEdit}
            disabled={!redoStack.length}
            title="Redo"
          >
            Ã¢â€ Â·
          </button>

          <button
            className="vm-mini-action"
            onClick={duplicateSelected}
            disabled={!selectedNote}
            title="Duplicate selected note"
          >
            Ã¢Â§â€°
          </button>

          <button
            className={`vm-mini-action ${
              snapEnabled ? "active" : ""
            }`}
            onClick={() => setSnapEnabled(value => !value)}
            title="Snap to grid"
          >
            SNAP
          </button>
        </div>

        <button
          className={`vm-toggle ${
            continuousScroll ? "active" : ""
          }`}
          onClick={() =>
            setContinuousScroll(value => !value)
          }
          aria-pressed={continuousScroll}
        >
          <span className="vm-toggle-track">
            <span />
          </span>

          CONTINUOUS SCROLL {continuousScroll ? "ON" : "OFF"}
        </button>

        <label className="vm-control">
  GLIDE
  <input
    type="range"
    min="0"
    max="100"
    step="1"
    value={glideAmount}
    onChange={event => setGlideAmount(Number(event.target.value))}
  />
  <span>{glideAmount}%</span>
</label>

        <label className="vm-control">
  GLIDE SPEED
  <input
    type="range"
    min="0"
    max="100"
    step="1"
    value={glideSpeed}
    onChange={event => setGlideSpeed(Number(event.target.value))}
    aria-label="Adjust glide speed"
  />
  <span>{glideSpeed}%</span>
</label>

        <label className="vm-control">
          CHORD LENGTH

          <select
            value={beatsPerChord}
            onChange={event =>
              setBeatsPerChord(Number(event.target.value))
            }
          >
            <option value="2">2 beats</option>
            <option value="3">3 beats</option>
            <option value="4">4 beats</option>
            <option value="6">6 beats</option>
            <option value="8">8 beats</option>
          </select>
        </label>

        <label className="vm-control">
          WAVE

          <select
            value={waveform}
            onChange={event =>
              setWaveform(event.target.value)
            }
          >
            <option value="sine">Sine</option>
            <option value="triangle">Triangle</option>
            <option value="sawtooth">Sawtooth</option>
            <option value="square">Square</option>
          </select>
        </label>

        <label className="vm-control vm-volume">
          VOLUME

          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={event =>
              setVolume(Number(event.target.value))
            }
          />

          <span>{volume}%</span>
        </label>

        <button
          className="vm-reset"
          onClick={resetMapper}
        >
          Ã¢â€ Âº RESET
        </button>
      </div>

      <div className="vm-hint">
        {tool === "draw"
          ? "DRAW: click an empty piano-roll cell to create a note. Snap can be switched off."
          : tool === "erase"
            ? "DELETE: click a note to remove it and its glide links."
            : tool === "slice"
              ? "SLICE: click a note where you want to split it into two notes."
              : tool === "connect"
                ? "GLIDE: drag from a note's white dot to a later note. The line follows the note positions."
                : tool === "remove"
                  ? "DELETE GLIDE: click a glide curve or a note to remove its connections."
                  : tool === "pan"
                    ? "PAN: drag the piano roll to move around the arrangement."
                    : "SELECT / RESIZE: drag notes to change pitch and timing; drag the right edge to resize. Double-check edits with Undo / Redo."}
      </div>

      <div
        className="vm-roll-outer"
        ref={outerRef}
      >
        <div className="vm-roll">
          <div className="vm-keyboard">
            {Array.from(
              { length: HIGH - LOW + 1 },
              (_, index) => {
                const midi = HIGH - index;
                const black = [1, 3, 6, 8, 10].includes(
                  midi % 12
                );

                return (
                  <div
                    key={midi}
                    className={`vm-key ${
                      black ? "black" : "white"
                    }`}
                    style={{ height: ROW }}
                  >
                    <span>{noteName(midi)}</span>
                  </div>
                );
              }
            )}
          </div>

          <div className="vm-grid-wrap">
            <div className="vm-chord-heads">
              {progression.map((chord, index) => (
                <div
                  className="vm-chord-head"
                  key={chord.id}
                >
                  <strong>
                    {noteNames[chord.root]} {chord.type}
                  </strong>

                  <span>
                    CHORD {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>

            <div
              ref={gridRef}
              className="vm-grid"
              style={{
                width: gridWidth,
                height: gridHeight
              }}
              onPointerDown={event => {
                if (event.button === 2) {
                  event.preventDefault();

                  dragRef.current = { mode: "erase" };
                  erasedDuringDragRef.current.clear();

                  eraseAtPoint(event.clientX, event.clientY);

                  event.currentTarget.setPointerCapture(
                    event.pointerId
                  );

                  return;
                }

                if (
                  tool === "pan" &&
                  outerRef.current
                ) {
                  dragRef.current = {
                    mode: "pan",
                    startX: event.clientX,
                    startY: event.clientY,
                    scrollLeft: outerRef.current.scrollLeft,
                    scrollTop: outerRef.current.scrollTop
                  };

                  event.currentTarget.setPointerCapture(
                    event.pointerId
                  );

                  return;
                }

                if (
                  event.button === 0 &&
                  (tool === "select" || tool === "draw")
                ) {
                  addNoteAtPointer(event);
                }
              }}
              onPointerMove={handleGridPointerMove}
              onPointerUp={finishNoteDrag}
              onPointerCancel={finishNoteDrag}
              onContextMenu={event =>
                event.preventDefault()
              }
            >
              {Array.from(
                { length: HIGH - LOW + 1 },
                (_, index) => {
                  const midi = HIGH - index;
                  const black = [1, 3, 6, 8, 10].includes(
                    midi % 12
                  );

                  return (
                    <div
                      key={midi}
                      className={`vm-grid-row ${
                        black ? "vm-black-row" : ""
                      }`}
                      style={{ height: ROW }}
                    />
                  );
                }
              )}

              {progression.map((chord, index) => (
                <div
                  key={chord.id}
                  className="vm-chord-divider"
                  style={{
                    left: index * CHORD_WIDTH,
                    height: gridHeight
                  }}
                />
              ))}

              <svg
                className="vm-connections"
                width={gridWidth}
                height={gridHeight}
                viewBox={`0 0 ${gridWidth} ${gridHeight}`}
              >
                {connections.map(connection => (
                  <g key={connection.id}>
                    <path
                      d={getConnectionPath(connection)}
                      className="vm-connection-line"
                    />

                    <path
                      d={getConnectionPath(connection)}
                      className="vm-connection-hit"
                      onClick={() =>
                        removeConnection(connection.id)
                      }
                    />
                  </g>
                ))}

                {connectorMode &&
                  connectionSource &&
                  connectorCursor &&
                  (() => {
                    const source = noteMap.get(connectionSource);

                    if (!source) return null;

                    const position = getNotePosition(source);

                    const x1 =
                      position.x + source.duration * BEAT;

                    const y1 = position.y + ROW / 2;
                    const x2 = connectorCursor.x;
                    const y2 = connectorCursor.y;

                    const curve = Math.max(
                      30,
                      Math.abs(x2 - x1) * 0.4
                    );

                    return (
                      <path
                        d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                        className="vm-connection-preview"
                      />
                    );
                  })()}

                {playbackDots.map(dot => (
                  <g
                    key={dot.id}
                    className="vm-playback-dot"
                  >
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r="5.5"
                    />

                    <text
                      x={dot.x + 8}
                      y={dot.y - 8}
                    >
                      {dot.label}
                    </text>
                  </g>
                ))}
              </svg>

              {notes.map((note, index) => {
                const position = getNotePosition(note);

                const palette = [
                  "#61cfc3",
                  "#80aee8",
                  "#c29ae9",
                  "#e6b76c"
                ];

                const color = palette[index % palette.length];

                return (
                  <div
                    key={note.id}
                    data-note-id={note.id}
                    className={`vm-note ${
                      selectedNotes.includes(note.id) ||
                      selectedNote === note.id
                        ? "selected"
                        : ""
                    } ${
                      connectionSource === note.id
                        ? "connecting"
                        : ""
                    }`}
                    style={{
                      left: position.x,
                      top: position.y,
                      width: Math.max(
                        32,
                        note.duration * BEAT
                      ),
                      height: ROW - 3,
                      background: color
                    }}
                    onPointerDown={event => {
                      if (event.button === 2) {
                        event.preventDefault();
                        event.stopPropagation();

                        dragRef.current = { mode: "erase" };
                        erasedDuringDragRef.current.clear();

                        eraseAtPoint(
                          event.clientX,
                          event.clientY
                        );

                        event.currentTarget.setPointerCapture(
                          event.pointerId
                        );
                      } else if (tool === "connect") {
                        startConnectorDrag(event, note.id);
                      } else if (
                        tool === "select" ||
                        tool === "draw"
                      ) {
                        event.stopPropagation();
                        saveHistory();
                        startNoteDrag(event, note);
                      } else if (tool === "erase") {
                        event.stopPropagation();
                        eraseNote(note.id);
                      } else {
                        event.stopPropagation();
                      }
                    }}
                    onPointerUp={event =>
                      finishConnectorDrag(event, note.id)
                    }
                    onContextMenu={event =>
                      event.preventDefault()
                    }
                    onClick={event => {
                      event.stopPropagation();

                      if (tool === "erase") {
                        eraseNote(note.id);
                      }

                      if (tool === "slice") {
                        sliceNote(event, note);
                      }

                      if (tool === "remove") {
                        saveHistory();

                        setConnections(previous =>
                          previous.filter(
                            edge =>
                              edge.from !== note.id &&
                              edge.to !== note.id
                          )
                        );
                      }

                      if (tool === "select") {
                        setSelectedNote(note.id);

                        setSelectedNotes(previous =>
                          event.shiftKey
                            ? previous.includes(note.id)
                              ? previous.filter(
                                  id => id !== note.id
                                )
                              : [...previous, note.id]
                            : [note.id]
                        );
                      }
                    }}
                  >
                    <button
                      className={`vm-note-dot ${
                        tool === "connect"
                          ? "connector-ready"
                          : ""
                      }`}
                      title="Drag from here to another note to create a glide"
                      onPointerDown={event => {
                        if (tool === "connect") {
                          startConnectorDrag(event, note.id);
                        } else {
                          event.stopPropagation();
                        }
                      }}
                      onClick={event =>
                        event.stopPropagation()
                      }
                    />

                    <span>{noteName(note.midi)}</span>

                    <button
                      className="vm-resize"
                      title="Drag to change note length"
                      onPointerDown={event => {
                        if (tool === "select") {
                          event.stopPropagation();
                          saveHistory();

                          startNoteDrag(
                            event,
                            note,
                            "resize"
                          );
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <footer className="vm-footer">
        <span>
          <strong>{notes.length}</strong> NOTES
        </span>

        <span>
          <strong>{connections.length}</strong> GLIDE CONNECTIONS
        </span>

        <span>
          <strong>{progression.length}</strong> CHORDS
        </span>

        <span className="vm-auto">
          Ã¢â€”Â AUTOMATIC GLIDES ENABLED BY DEFAULT
        </span>

        <span className="vm-scroll-status">
          FOLLOW PLAYBACK: {continuousScroll ? "ON" : "OFF"}
        </span>
      </footer>
    </div>
  );
}