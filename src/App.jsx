import { useEffect, useRef, useState } from "react";
import VoiceMapper from "./VoiceMapper";
import RecordingStudio from "./RecordingStudio";
import "./App.css";

const computerKeys = [
  "z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m",
  "q", "2", "w", "3", "e", "r", "5", "t", "6", "y", "7", "u",
  "i", "9", "o", "0", "p", "[", "=", "]", "\\", ";", "'", "/"
];
const computerKeyIndex = Object.fromEntries(computerKeys.map((key, index) => [key, index]));

const colors = [
  "#ed6868", "#e99458", "#e8c45c", "#a6cb65",
  "#55cba0", "#50c8d9", "#599be8", "#8188e9",
  "#b18be5", "#d17fc5", "#db7997", "#a2b0bc"
];

const blackNotes = [1, 3, 6, 8, 10];
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const chordTypes = [
  { name: "Major", intervals: [0, 4, 7] },
  { name: "Minor", intervals: [0, 3, 7] },
  { name: "Diminished", intervals: [0, 3, 6] },
  { name: "Augmented", intervals: [0, 4, 8] },
  { name: "Sus2", intervals: [0, 2, 7] },
  { name: "Sus4", intervals: [0, 5, 7] },
  { name: "Major 7", intervals: [0, 4, 7, 11] },
  { name: "Minor 7", intervals: [0, 3, 7, 10] },
  { name: "Dominant 7", intervals: [0, 4, 7, 10] },
  { name: "Diminished 7", intervals: [0, 3, 6, 9] },
  { name: "Major 9", intervals: [0, 4, 7, 11, 14] },
  { name: "Minor 9", intervals: [0, 3, 7, 10, 14] },
  { name: "Dominant 9", intervals: [0, 4, 7, 10, 14] },
  { name: "Major 11", intervals: [0, 4, 7, 11, 14, 17] },
  { name: "Minor 11", intervals: [0, 3, 7, 10, 14, 17] },
  { name: "Major 13", intervals: [0, 4, 7, 11, 14, 17, 21] },
  { name: "Minor 13", intervals: [0, 3, 7, 10, 14, 17, 21] },
  { name: "Add9", intervals: [0, 4, 7, 14] },
  { name: "Minor Add9", intervals: [0, 3, 7, 14] },
  { name: "Minor Major 7", intervals: [0, 3, 7, 11] },
  { name: "Half-Diminished 7", intervals: [0, 3, 6, 10] },
  { name: "Dominant 11", intervals: [0, 4, 7, 10, 14, 17] },
  { name: "Dominant 13", intervals: [0, 4, 7, 10, 14, 17, 21] },
  { name: "Dominant 7 b9", intervals: [0, 4, 7, 10, 13] },
  { name: "Dominant 7 sharp9", intervals: [0, 4, 7, 10, 15] },
  { name: "Dominant 7 sharp11", intervals: [0, 4, 6, 10, 14] },
  { name: "Dominant 7 b13", intervals: [0, 4, 7, 10, 14, 20] },
  { name: "Altered 7", intervals: [0, 4, 6, 10, 13, 15] },
  { name: "Major 6/9", intervals: [0, 4, 7, 9, 14] },
  { name: "Minor 6", intervals: [0, 3, 7, 9] },
  { name: "Power 5", intervals: [0, 7, 12] }
];

const progressionPresets = [
  { name: "Pop / Emotional", genre: "R&B · POP", level: "Simple", degrees: [[0,"Major"],[9,"Minor"],[5,"Major"],[7,"Major"]] },
  { name: "Dark Minor Loop", genre: "PHONK · TRAP", level: "Simple", degrees: [[0,"Minor"],[8,"Major"],[3,"Minor"],[10,"Major"]] },
  { name: "Gospel Lift", genre: "GOSPEL", level: "Intermediate", degrees: [[0,"Major 7"],[5,"Major 7"],[7,"Dominant 7"],[0,"Major 7"]] },
  { name: "Neo-Soul Colors", genre: "NEO-SOUL", level: "Advanced", degrees: [[0,"Minor 9"],[5,"Dominant 13"],[9,"Major 9"],[7,"Dominant 7 sharp9"]] },
  { name: "Jazz Turnaround", genre: "JAZZ", level: "Advanced", degrees: [[0,"Major 9"],[9,"Dominant 13"],[2,"Minor 9"],[7,"Dominant 7 b9"]] },
  { name: "Cinematic Rise", genre: "CINEMATIC", level: "Intermediate", degrees: [[0,"Minor"],[8,"Major"],[5,"Minor"],[7,"Major"]] },
  { name: "Gospel Passing Motion", genre: "GOSPEL · JAZZ", level: "Advanced", degrees: [[0,"Major 7"],[4,"Minor 7"],[5,"Minor 7"],[7,"Dominant 7"]] },
  { name: "Experimental Chromatic", genre: "EXPERIMENTAL", level: "Complex", degrees: [[0,"Minor Major 7"],[1,"Dominant 7 sharp11"],[6,"Half-Diminished 7"],[7,"Altered 7"]] },
  { name: "Phonk Suspense", genre: "PHONK", level: "Intermediate", degrees: [[0,"Minor"],[1,"Major"],[8,"Minor"],[7,"Major"]] },
  { name: "Modulating Dream", genre: "CINEMATIC · NEO-SOUL", level: "Complex", degrees: [[0,"Major 9"],[4,"Minor 9"],[6,"Dominant 7 b9"],[9,"Major 7"],[2,"Minor 11"],[7,"Dominant 13"]] },
  { name: "Altered Jazz Cycle", genre: "JAZZ · EXPERIMENTAL", level: "Complex", degrees: [[0,"Minor 11"],[5,"Dominant 7 sharp9"],[10,"Major 9"],[3,"Altered 7"],[8,"Major 13"]] }
];

function noteName(midi) {
  return noteNames[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function frequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function makeChord(rootMidi, intervals, inversion = 0) {
  const notes = intervals.map(interval => rootMidi + interval);

  for (let i = 0; i < inversion; i++) {
    notes.push(notes.shift() + 12);
  }

  return notes;
}

function VoiceLeadingMap({ progression }) {
  if (!progression.length) {
    return (
      <div className="movement-empty">
        Add chords to your progression to see how their notes move.
      </div>
    );
  }

  const sortedChords = progression.map(chord =>
    [...chord.notes].sort((a, b) => a - b)
  );

  const allNotes = sortedChords.flat();
  const lowest = Math.min(...allNotes);
  const highest = Math.max(...allNotes);
  const width = Math.max(440, progression.length * 155 + 100);
  const height = 280;
  const left = 65;
  const spacing = 155;
  const top = 38;
  const bottom = 225;

  const yPosition = midi =>
    highest === lowest
      ? (top + bottom) / 2
      : bottom - ((midi - lowest) / (highest - lowest)) * (bottom - top);

  return (
    <div className="movement-scroll">
      <svg
        className="movement-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Visual map showing how notes move between chords"
      >
        {Array.from({ length: 5 }, (_, i) => {
          const y = top + i * ((bottom - top) / 4);
          return (
            <line
              key={i}
              x1="35"
              y1={y}
              x2={width - 25}
              y2={y}
              className="movement-grid-line"
            />
          );
        })}

        {sortedChords.slice(0, -1).map((notes, chordIndex) => {
          const nextNotes = sortedChords[chordIndex + 1];

          return notes.map((note, voiceIndex) => {
            if (nextNotes[voiceIndex] === undefined) return null;

            return (
              <line
                key={`${chordIndex}-${voiceIndex}`}
                x1={left + chordIndex * spacing}
                y1={yPosition(note)}
                x2={left + (chordIndex + 1) * spacing}
                y2={yPosition(nextNotes[voiceIndex])}
                stroke={colors[note % 12]}
                className="movement-line"
              />
            );
          });
        })}

        {sortedChords.map((notes, chordIndex) => {
          const x = left + chordIndex * spacing;

          return (
            <g key={chordIndex}>
              <text
                x={x}
                y="22"
                textAnchor="middle"
                className="movement-chord-label"
              >
                {noteNames[progression[chordIndex].root]} {progression[chordIndex].type}
              </text>

              {notes.map((note, voiceIndex) => (
                <g key={`${chordIndex}-${voiceIndex}`}>
                  <circle
                    cx={x}
                    cy={yPosition(note)}
                    r="9"
                    fill={colors[note % 12]}
                    className="movement-note"
                  />
                  <text
                    x={x}
                    y={yPosition(note) + 25}
                    textAnchor="middle"
                    className="movement-note-label"
                  >
                    {noteName(note)}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TempoControls({ bpm, setBpm, metronomeOn, onToggleMetronome }) {
  return (
    <div className="tempo-panel">
      <div className="tempo-readout">
        <span className="control-label">TEMPO</span>
        <div className="tempo-stepper">
          <button type="button" onClick={() => setBpm(value => Math.max(40, value - 1))}>−</button>
          <input
            aria-label="Tempo in beats per minute"
            type="number"
            min="40"
            max="240"
            value={bpm}
            onChange={event => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) setBpm(Math.max(40, Math.min(240, next || 40)));
            }}
          />
          <button type="button" onClick={() => setBpm(value => Math.min(240, value + 1))}>+</button>
          <strong>BPM</strong>
        </div>
      </div>
      <input
        className="tempo-slider"
        aria-label="Adjust tempo"
        type="range"
        min="40"
        max="240"
        step="1"
        value={bpm}
        onChange={event => setBpm(Number(event.target.value))}
      />
      <button
        type="button"
        className={`metronome-button ${metronomeOn ? "active" : ""}`}
        onClick={onToggleMetronome}
        aria-pressed={metronomeOn}
      >
        <span className="metronome-icon">♩</span>
        {metronomeOn ? "METRONOME ON" : "METRONOME OFF"}
      </button>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("Studio");
  const [voiceMapperOpen, setVoiceMapperOpen] = useState(false);

  const [mode, setMode] = useState("octave");
  const [octave, setOctave] = useState(4);
  const [activeNotes, setActiveNotes] = useState([]);
  const [volume, setVolume] = useState(65);
  const [waveform, setWaveform] = useState("triangle");

  const [chordRoot, setChordRoot] = useState(0);
  const [chordType, setChordType] = useState("Major");
  const [inversion, setInversion] = useState(0);
  const [progression, setProgression] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState("0");
  const [playingChord, setPlayingChord] = useState(false);

  const [glideTime, setGlideTime] = useState(0.45);
  const [playingMovement, setPlayingMovement] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const metronomeNextBeatRef = useRef(0);
  const metronomeBeatRef = useRef(0);

  const audioRef = useRef(null);
  const voicesRef = useRef(new Map());
  const pointersRef = useRef(new Map());
  const keyboardSourcesRef = useRef(new Set());
  const chordSourcesRef = useRef([]);
  const movementVoicesRef = useRef([]);
  const movementTimerRef = useRef(null);

  const startMidi = (octave + 1) * 12;
  const selectedType = chordTypes.find(type => type.name === chordType);

  const chordNotes = makeChord(
    startMidi + chordRoot,
    selectedType.intervals,
    inversion
  );

  const midiNotes = mode === "full"
    ? Array.from({ length: 88 }, (_, i) => 21 + i)
    : Array.from({ length: 36 }, (_, i) => startMidi + i);

  const whiteCount = midiNotes.filter(midi => !blackNotes.includes(midi % 12)).length;
  const notePositions = [];
  let whiteIndex = 0;

  midiNotes.forEach(midi => {
    const isBlack = blackNotes.includes(midi % 12);
    notePositions.push({ midi, isBlack, whiteIndex });
    if (!isBlack) whiteIndex++;
  });

  function getAudio() {
    if (!audioRef.current) {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      audioRef.current = new AudioClass();
    }
    return audioRef.current;
  }

  async function startNote(midi, source) {
    let voice = voicesRef.current.get(midi);
    if (voice?.sources.has(source)) return;

    if (!voice) {
      try {
        const audio = getAudio();
        if (audio.state === "suspended") await audio.resume();

        voice = voicesRef.current.get(midi);

        if (!voice) {
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();

          oscillator.type = waveform;
          oscillator.frequency.value = frequency(midi);
          gain.gain.setValueAtTime(0, audio.currentTime);
          gain.gain.linearRampToValueAtTime(
            volume / 100 * 0.18,
            audio.currentTime + 0.025
          );

          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.start();

          voice = { oscillator, gain, sources: new Set() };
          voicesRef.current.set(midi, voice);

          setActiveNotes(previous =>
            previous.includes(midi) ? previous : [...previous, midi]
          );
        }
      } catch (error) {
        console.error("Audio error:", error);
        return;
      }
    }

    voice.sources.add(source);
  }

  function stopNote(midi, source) {
    const voice = voicesRef.current.get(midi);
    if (!voice) return;

    voice.sources.delete(source);
    if (voice.sources.size > 0) return;

    const audio = audioRef.current;

    if (audio) {
      const now = audio.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.035);

      try {
        voice.oscillator.stop(now + 0.18);
      } catch {}
    }

    voicesRef.current.delete(midi);
    setActiveNotes(previous => previous.filter(note => note !== midi));
  }

  function stopChord() {
    chordSourcesRef.current.forEach(({ midi, source }) => {
      stopNote(midi, source);
    });

    chordSourcesRef.current = [];
    setPlayingChord(false);
  }

  async function playChord(chord = chordNotes) {
    stopChord();

    const sources = chord.map((midi, index) => ({
      midi,
      source: `chord-${Date.now()}-${index}`
    }));

    chordSourcesRef.current = sources;
    setPlayingChord(true);

    await Promise.all(
      sources.map(({ midi, source }) => startNote(midi, source))
    );
  }

  function stopVoiceMovement() {
    if (movementTimerRef.current) {
      clearTimeout(movementTimerRef.current);
      movementTimerRef.current = null;
    }

    const audio = audioRef.current;
    const now = audio?.currentTime ?? 0;

    movementVoicesRef.current.forEach(voice => {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.025);
        voice.oscillator.stop(now + 0.12);
      } catch {}
    });

    movementVoicesRef.current = [];
    setPlayingMovement(false);
  }

  async function playVoiceMovement() {
    if (progression.length < 2) return;

    stopVoiceMovement();
    stopChord();

    try {
      const audio = getAudio();
      if (audio.state === "suspended") await audio.resume();

      const chords = progression.map(chord =>
        [...chord.notes].sort((a, b) => a - b)
      );

      const voiceCount = Math.max(...chords.map(chord => chord.length));
      const stepDuration = (60 / bpm) * 4;
      const movementGlide = Math.min(glideTime, stepDuration * 0.9);
      const now = audio.currentTime + 0.08;
      const voices = [];

      for (let i = 0; i < voiceCount; i++) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const firstNote = chords[0][i];

        oscillator.type = waveform;
        oscillator.frequency.setValueAtTime(
          frequency(firstNote ?? chords[0][0]),
          now
        );

        gain.gain.setValueAtTime(
          firstNote === undefined ? 0 : volume / 100 * 0.13,
          now
        );

        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(now);

        voices.push({ oscillator, gain });
      }

      movementVoicesRef.current = voices;
      setPlayingMovement(true);

      chords.forEach((chord, chordIndex) => {
        const time = now + chordIndex * stepDuration;

        voices.forEach((voice, voiceIndex) => {
          const targetNote = chord[voiceIndex];
          const frequencyParam = voice.oscillator.frequency;
          const gainParam = voice.gain.gain;

          frequencyParam.cancelScheduledValues(time);
          gainParam.cancelScheduledValues(time);

          if (targetNote !== undefined) {
            frequencyParam.setValueAtTime(frequencyParam.value, time);
            frequencyParam.linearRampToValueAtTime(
              frequency(targetNote),
              time + movementGlide
            );

            gainParam.setValueAtTime(gainParam.value, time);
            gainParam.linearRampToValueAtTime(
              volume / 100 * 0.13,
              time + 0.04
            );
          } else {
            gainParam.setValueAtTime(gainParam.value, time);
            gainParam.linearRampToValueAtTime(0, time + 0.08);
          }
        });
      });

      movementTimerRef.current = setTimeout(() => {
        movementVoicesRef.current.forEach(voice => {
          try {
            voice.oscillator.stop();
          } catch {}
        });

        movementVoicesRef.current = [];
        movementTimerRef.current = null;
        setPlayingMovement(false);
      }, chords.length * stepDuration * 1000 + 200);
    } catch (error) {
      console.error("Voice movement audio error:", error);
      stopVoiceMovement();
    }
  }

  async function toggleMetronome() {
    if (metronomeOn) {
      setMetronomeOn(false);
      return;
    }

    try {
      const audio = getAudio();
      if (audio.state === "suspended") await audio.resume();
      metronomeNextBeatRef.current = audio.currentTime + 0.06;
      metronomeBeatRef.current = 0;
      setMetronomeOn(true);
    } catch (error) {
      console.error("Metronome audio error:", error);
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
      const audio = audioRef.current;
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

  function stopAll() {
    stopVoiceMovement();

    for (const [midi, voice] of voicesRef.current) {
      const audio = audioRef.current;

      if (audio) {
        const now = audio.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.025);

        try {
          voice.oscillator.stop(now + 0.15);
        } catch {}
      }

      voicesRef.current.delete(midi);
    }

    pointersRef.current.clear();
    keyboardSourcesRef.current.clear();
    chordSourcesRef.current = [];
    setPlayingChord(false);
    setActiveNotes([]);
  }

  function handlePointerDown(event) {
    const key = event.target.closest("[data-midi]");
    if (!key) return;

    event.preventDefault();

    const midi = Number(key.dataset.midi);
    const source = `pointer-${event.pointerId}`;

    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, midi);
    startNote(midi, source);
  }

  function handlePointerMove(event) {
    if (!pointersRef.current.has(event.pointerId)) return;

    const key = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-midi]");

    if (!key) return;

    const nextMidi = Number(key.dataset.midi);
    const previousMidi = pointersRef.current.get(event.pointerId);

    if (nextMidi === previousMidi) return;

    const source = `pointer-${event.pointerId}`;
    stopNote(previousMidi, source);
    pointersRef.current.set(event.pointerId, nextMidi);
    startNote(nextMidi, source);
  }

  function handlePointerUp(event) {
    if (!pointersRef.current.has(event.pointerId)) return;

    const midi = pointersRef.current.get(event.pointerId);
    stopNote(midi, `pointer-${event.pointerId}`);
    pointersRef.current.delete(event.pointerId);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    function handleTransportKey(event) {
      if (event.code !== "Space" || event.repeat || voiceMapperOpen ||
          activeTab === "Recording Studio" ||
          event.ctrlKey || event.altKey || event.metaKey ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      event.preventDefault();
      if (activeTab === "Chord Lab") {
        if (playingMovement) stopVoiceMovement();
        else playVoiceMovement();
      } else if (activeTab === "Studio") {
        if (playingChord) stopChord();
        else playChord();
      }
    }
    window.addEventListener("keydown", handleTransportKey);
    return () => window.removeEventListener("keydown", handleTransportKey);
  }, [voiceMapperOpen, activeTab, playingMovement, playingChord, progression, bpm, glideTime]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (
        activeTab === "Recording Studio" ||
        voiceMapperOpen ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) return;

      const key = event.key.toLowerCase();
      const index = computerKeyIndex[key];
      if (index === undefined) return;

      event.preventDefault();

      const source = `computer-${key}`;
      if (keyboardSourcesRef.current.has(source)) return;

      keyboardSourcesRef.current.add(source);
      startNote(startMidi + index, source);
    }

    function handleKeyUp(event) {
      if (activeTab === "Recording Studio") return;
      const key = event.key.toLowerCase();
      const index = computerKeyIndex[key];
      if (index === undefined) return;

      const source = `computer-${key}`;
      if (!keyboardSourcesRef.current.has(source)) return;

      keyboardSourcesRef.current.delete(source);
      stopNote(startMidi + index, source);
    }

    function releaseComputerKeys() {
      keyboardSourcesRef.current.forEach(source => {
        const key = source.replace("computer-", "");
        const index = computerKeyIndex[key];
        if (index !== undefined) stopNote(startMidi + index, source);
      });

      keyboardSourcesRef.current.clear();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releaseComputerKeys);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseComputerKeys);
      releaseComputerKeys();
    };
  }, [octave, waveform, volume, voiceMapperOpen, activeTab, playingMovement, playingChord, progression, bpm, glideTime]);

  useEffect(() => {
    return () => {
      if (movementTimerRef.current) clearTimeout(movementTimerRef.current);

      movementVoicesRef.current.forEach(voice => {
        try {
          voice.oscillator.stop();
        } catch {}
      });

      voicesRef.current.forEach(voice => {
        try {
          voice.oscillator.stop();
        } catch {}
      });

      audioRef.current?.close();
    };
  }, []);

  function changeOctave(amount) {
    stopAll();
    setOctave(current => Math.max(1, Math.min(7, current + amount)));
  }

  function changeMode(nextMode) {
    stopAll();
    setMode(nextMode);
  }

  function addToProgression() {
    setProgression(previous => [
      ...previous,
      {
        id: `${Date.now()}-${previous.length}`,
        root: chordRoot,
        type: chordType,
        inversion,
        octave,
        notes: [...chordNotes]
      }
    ]);
  }

  function loadProgressionPreset() {
    const preset = progressionPresets[Number(selectedPreset)];
    if (!preset) return;
    stopVoiceMovement();
    const baseMidi = (octave + 1) * 12 + chordRoot;
    const next = preset.degrees.map(([degree, typeName], index) => {
      const type = chordTypes.find(item => item.name === typeName) || chordTypes[0];
      const root = (chordRoot + degree) % 12;
      const octaveShift = Math.floor((chordRoot + degree) / 12);
      const notes = makeChord(baseMidi + degree + octaveShift * 0, type.intervals, 0);
      return {
        id: `preset-${Date.now()}-${index}`,
        root,
        type: type.name,
        inversion: 0,
        octave: octave + Math.floor((chordRoot + degree) / 12),
        notes
      };
    });
    setProgression(next);
  }

  function changeTab(tab) {
    stopAll();
    setActiveTab(tab);
  }

  function openVoiceMapper() {
    stopAll();
    setVoiceMapperOpen(true);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          KEVIN<span>STUDIO</span>
        </div>

        <div className="nav-label">WORKSPACE</div>

        {["Studio", "Chord Lab", "Recording Studio", "Sampler", "Instruments", "Projects"].map(tab => (
          <button
            key={tab}
            className={`nav-item ${activeTab === tab ? "active" : ""}`}
            onClick={() => changeTab(tab)}
          >
            {tab}
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="status-dot" /> AUDIO ENGINE READY
          <p>KEVIN STUDIO v0.4</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">YOUR CREATIVE SPACE</span>
            <h1>{activeTab}</h1>
          </div>

          <span className="offline">● AUDIO ENGINE ACTIVE</span>
        </header>

        {activeTab === "Studio" && (
          <>
            <section className="studio-heading">
              <div>
                <span className="eyebrow">INSTRUMENT / 001</span>
                <h2>Virtual Piano</h2>
                <p>Play notes, test your chords and explore the keyboard.</p>
              </div>

              <div className="sound-indicator">
                <span /> LIVE AUDIO
              </div>
            </section>

            <section className="instrument-panel">
              <div className="instrument-toolbar">
                <TempoControls bpm={bpm} setBpm={setBpm} metronomeOn={metronomeOn} onToggleMetronome={toggleMetronome} />
                <div className="mode-control">
                  <span className="control-label">KEYBOARD RANGE</span>

                  <div className="mode-buttons">
                    <button
                      className={mode === "octave" ? "selected" : ""}
                      onClick={() => changeMode("octave")}
                    >
                      3 Octaves · 36 Keys
                    </button>

                    <button
                      className={mode === "full" ? "selected" : ""}
                      onClick={() => changeMode("full")}
                    >
                      Full Piano · 88
                    </button>
                  </div>
                </div>

                {mode === "octave" && (
                  <div>
                    <span className="control-label">OCTAVE</span>

                    <div className="octave-control">
                      <button onClick={() => changeOctave(-1)}>−</button>
                      <strong>{octave}</strong>
                      <button onClick={() => changeOctave(1)}>+</button>
                    </div>
                  </div>
                )}

                <div>
                  <span className="control-label">WAVEFORM</span>

                  <select
                    value={waveform}
                    onChange={event => setWaveform(event.target.value)}
                  >
                    <option value="sine">Sine</option>
                    <option value="triangle">Triangle</option>
                    <option value="sawtooth">Sawtooth</option>
                    <option value="square">Square</option>
                  </select>
                </div>

                <div className="volume-control">
                  <span className="control-label">MASTER VOLUME · {volume}%</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={event => setVolume(Number(event.target.value))}
                  />
                </div>
              </div>

              <div className={`keyboard-wrap ${mode === "full" ? "full-range" : ""}`}>
                <div
                  className="keyboard"
                  style={{ "--white-count": whiteCount }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  {notePositions.map(({ midi, isBlack, whiteIndex }) => (
                    <div
                      key={midi}
                      data-midi={midi}
                      className={`key ${isBlack ? "black-key" : "white-key"} ${
                        activeNotes.includes(midi) ? "playing" : ""
                      }`}
                      style={{
                        "--note-color": colors[midi % 12],
                        "--white-index": whiteIndex
                      }}
                    >
                      <span className="key-note">{noteName(midi)}</span>

                      {mode === "octave" && midi >= startMidi && midi < startMidi + 36 && (
                        <span className="computer-key">
                          {computerKeys[midi - startMidi]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="keyboard-footer">
                <span>HOLD AND DRAG TO PLAY · 3-OCTAVE KEY MAP: Z–M / Q–U / I–/ (BLACK KEYS INCLUDED)</span>
                <span>{activeNotes.length} NOTES PLAYING</span>
              </div>
            </section>

            <section className="note-display">
              <span className="control-label">CURRENTLY PLAYING</span>

              <div className="active-note-list">
                {activeNotes.length === 0 ? (
                  <span className="empty-notes">Play multiple keys to build a chord.</span>
                ) : (
                  activeNotes.map(note => (
                    <span
                      key={note}
                      className="note-chip"
                      style={{ "--note-color": colors[note % 12] }}
                    >
                      {noteName(note)}
                    </span>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === "Chord Lab" && (
          <section className="chord-lab">
            <div className="section-heading">
              <div>
                <span className="eyebrow">MUSICAL WORKSPACE / 002</span>
                <h2>Chord Lab</h2>
                <p>Build chords, explore inversions and create progressions.</p>
              </div>

              <span className="sound-indicator">
                <span /> CHORD ENGINE
              </span>
            </div>

            <TempoControls bpm={bpm} setBpm={setBpm} metronomeOn={metronomeOn} onToggleMetronome={toggleMetronome} />

            <div className="chord-controls">
              <div className="chord-control">
                <label>ROOT NOTE</label>
                <select
                  value={chordRoot}
                  onChange={event => setChordRoot(Number(event.target.value))}
                >
                  {noteNames.map((name, index) => (
                    <option key={name} value={index}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="chord-control chord-type-control">
                <label>CHORD TYPE</label>
                <select
                  value={chordType}
                  onChange={event => {
                    setChordType(event.target.value);
                    setInversion(0);
                  }}
                >
                  {chordTypes.map(type => (
                    <option key={type.name} value={type.name}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div className="chord-control">
                <label>INVERSION</label>
                <select
                  value={inversion}
                  onChange={event => setInversion(Number(event.target.value))}
                >
                  {selectedType.intervals.map((_, index) => (
                    <option key={index} value={index}>
                      {index === 0 ? "Root position" : `Inversion ${index}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="chord-control">
                <label>CHORD OCTAVE</label>
                <div className="octave-control">
                  <button onClick={() => setOctave(value => Math.max(1, value - 1))}>−</button>
                  <strong>{octave}</strong>
                  <button onClick={() => setOctave(value => Math.min(7, value + 1))}>+</button>
                </div>
              </div>
            </div>

            <div className="chord-result">
              <div>
                <span className="control-label">YOUR CHORD</span>
                <h3>{noteNames[chordRoot]} {chordType}</h3>

                <div className="chord-note-list">
                  {chordNotes.map((note, index) => (
                    <span
                      key={`${note}-${index}`}
                      style={{ "--note-color": colors[note % 12] }}
                    >
                      {noteName(note)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="chord-actions">
                <button className="play-chord-button" onClick={() => playChord()}>
                  {playingChord ? "PLAY AGAIN" : "▶ PLAY CHORD"}
                </button>

                <button className="secondary-button" onClick={stopChord}>STOP</button>

                <button className="secondary-button" onClick={addToProgression}>
                  + ADD TO PROGRESSION
                </button>
              </div>
            </div>

            <div className="progression-panel">
              <div className="progression-heading">
                <div>
                  <span className="control-label">YOUR COMPOSITION</span>
                  <h3>Chord Progression</h3>
                </div>

                <button
                  className="secondary-button"
                  onClick={() => {
                    stopVoiceMovement();
                    setProgression([]);
                  }}
                >
                  CLEAR ALL
                </button>
              </div>

              <div className="preset-library">
                <div className="preset-copy">
                  <span className="control-label">PROGRESSION LIBRARY</span>
                  <strong>Start from a musical idea</strong>
                  <small>Jazz · Neo-soul · R&amp;B · Gospel · Cinematic · Phonk · Experimental</small>
                </div>
                <select value={selectedPreset} onChange={event => setSelectedPreset(event.target.value)}>
                  {progressionPresets.map((preset, index) => (
                    <option key={preset.name} value={index}>{preset.name} · {preset.level}</option>
                  ))}
                </select>
                <button className="play-chord-button" onClick={loadProgressionPreset}>LOAD PROGRESSION</button>
              </div>

              {progression.length === 0 ? (
                <p className="empty-progression">
                  Your progression is empty. Add a chord or load a progression from the library above.
                </p>
              ) : (
                <div className="progression-list">
                  {progression.map((chord, index) => (
                    <div className="progression-chord" key={chord.id}>
                      <span className="progression-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div>
                        <strong>{noteNames[chord.root]} {chord.type}</strong>
                        <small>{chord.notes.map(noteName).join(" · ")}</small>
                      </div>

                      <button
                        onClick={() => playChord(chord.notes)}
                        title="Play chord"
                      >
                        ▶
                      </button>

                      <button
                        onClick={() => setProgression(items =>
                          items.filter(item => item.id !== chord.id)
                        )}
                        title="Remove chord"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="voice-leading-section">
                <div className="voice-leading-heading">
                  <div>
                    <span className="control-label">NOTE-BY-NOTE MOVEMENT</span>
                    <h3>Voice Leading Map</h3>
                    <p>Follow each note as it travels from one chord to the next.</p>
                  </div>

                  <div className="vm-heading-actions">
                    <span className="movement-indicator">
                      <span /> VISUALIZER
                    </span>

                    <button
                      className="vm-open-button"
                      disabled={progression.length < 2}
                      onClick={openVoiceMapper}
                    >
                      OPEN VOICE MAPPER ↗
                    </button>
                  </div>
                </div>

                <VoiceLeadingMap progression={progression} />

                <div className="glide-controls">
                  <div className="glide-slider">
                    <label>
                      GLIDE TIME
                      <strong>{glideTime.toFixed(2)}s</strong>
                    </label>

                    <input
                      type="range"
                      min="0.05"
                      max="1.5"
                      step="0.05"
                      value={glideTime}
                      onChange={event => setGlideTime(Number(event.target.value))}
                    />

                    <div className="glide-range-labels">
                      <span>FAST</span>
                      <span>SLOW</span>
                    </div>
                  </div>

                  <div className="movement-actions">
                    <button
                      className="play-chord-button movement-play-button"
                      onClick={playVoiceMovement}
                      disabled={progression.length < 2}
                    >
                      {playingMovement ? "PLAYING MOVEMENT..." : "▶ PLAY NOTE MOVEMENT"}
                    </button>

                    <button className="secondary-button" onClick={stopVoiceMovement}>
                      STOP
                    </button>
                  </div>
                </div>

                {progression.length < 2 && (
                  <p className="movement-hint">
                    Add at least two chords to play the note movement.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "Recording Studio" && <RecordingStudio />}

        {["Sampler", "Instruments", "Projects"].includes(activeTab) && (
          <section className="coming-soon">
            <span className="eyebrow">KEVIN STUDIO WORKSPACE</span>
            <h2>{activeTab}</h2>
            <p>This workspace hasn't been built yet. Your Studio and Chord Lab are ready.</p>
          </section>
        )}

        <footer>
          KEVIN STUDIO © 2026 <span>BUILT FOR CREATORS</span>
        </footer>
      </main>

      {voiceMapperOpen && (
        <VoiceMapper
          progression={progression}
          bpm={bpm}
          onBpmChange={setBpm}
          onClose={() => setVoiceMapperOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
