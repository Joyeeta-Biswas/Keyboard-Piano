const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const A4 = 440;
const MIN_MIDI = 21; // A0
const MAX_MIDI = 108; // C8

const LAYOUT = {
  upperWhite: [
    { code: "KeyQ", letter: "Q", degree: 0 },
    { code: "KeyW", letter: "W", degree: 2 },
    { code: "KeyE", letter: "E", degree: 4 },
    { code: "KeyR", letter: "R", degree: 5 },
    { code: "KeyT", letter: "T", degree: 7 },
    { code: "KeyY", letter: "Y", degree: 9 },
    { code: "KeyU", letter: "U", degree: 11 },
    { code: "KeyI", letter: "I", degree: 12 },
    { code: "KeyO", letter: "O", degree: 14 },
    { code: "KeyP", letter: "P", degree: 16 },
    { code: "BracketLeft", letter: "[", degree: 17 },
    { code: "BracketRight", letter: "]", degree: 19 },
  ],
  upperBlack: [
    { spacer: 0.55 },
    { code: "Digit2", letter: "2", degree: 1 },
    { code: "Digit3", letter: "3", degree: 3 },
    { spacer: 1 },
    { code: "Digit5", letter: "5", degree: 6 },
    { code: "Digit6", letter: "6", degree: 8 },
    { code: "Digit7", letter: "7", degree: 10 },
    { spacer: 1 },
    { code: "Digit9", letter: "9", degree: 13 },
    { code: "Digit0", letter: "0", degree: 15 },
    { spacer: 1 },
    { code: "Equal", letter: "=", degree: 18 },
  ],
  lowerWhite: [
    { code: "KeyZ", letter: "Z", degree: 0 },
    { code: "KeyX", letter: "X", degree: 2 },
    { code: "KeyC", letter: "C", degree: 4 },
    { code: "KeyV", letter: "V", degree: 5 },
    { code: "KeyB", letter: "B", degree: 7 },
    { code: "KeyN", letter: "N", degree: 9 },
    { code: "KeyM", letter: "M", degree: 11 },
    { code: "Comma", letter: ",", degree: 12 },
    { code: "Period", letter: ".", degree: 14 },
    { code: "Slash", letter: "/", degree: 16 },
  ],
  lowerBlack: [
    { spacer: 0.55 },
    { code: "KeyS", letter: "S", degree: 1 },
    { code: "KeyD", letter: "D", degree: 3 },
    { spacer: 1 },
    { code: "KeyG", letter: "G", degree: 6 },
    { code: "KeyH", letter: "H", degree: 8 },
    { code: "KeyJ", letter: "J", degree: 10 },
    { spacer: 1 },
    { code: "KeyL", letter: "L", degree: 13 },
    { code: "Semicolon", letter: ";", degree: 15 },
  ],
};

function midiToFreq(midi) {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

function midiName(midi) {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function clampMidi(midi) {
  return Math.min(MAX_MIDI, Math.max(MIN_MIDI, midi));
}

class PianoSynth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = new Map();
    this.volume = 0.32;
    this.sustain = false;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.value = value;
  }

  play(midi) {
    this.ensure();
    this.stop(midi, true);
    const now = this.ctx.currentTime;
    const freq = midiToFreq(midi);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();
    osc1.type = "triangle";
    osc2.type = "sine";
    osc3.type = "sawtooth";
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 2;
    osc3.frequency.value = freq;
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 2, now);
    osc3.frequency.setValueAtTime(freq, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800 + (midi - 40) * 18, now);
    filter.Q.value = 1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 1.4);

    const harmonic = this.ctx.createGain();
    harmonic.gain.value = 0.08;
    const body = this.ctx.createGain();
    body.gain.value = 0.045;

    osc1.connect(filter);
    osc2.connect(harmonic);
    harmonic.connect(filter);
    osc3.connect(body);
    body.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    this.voices.set(midi, { osc1, osc2, osc3, gain, filter });
  }

  stop(midi, immediate = false) {
    const voice = this.voices.get(midi);
    if (!voice) return;
    if (this.sustain && !immediate) return;

    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now);
    const release = immediate ? 0.02 : 0.35;
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    try {
      voice.osc1.stop(now + release + 0.05);
      voice.osc2.stop(now + release + 0.05);
      voice.osc3.stop(now + release + 0.05);
    } catch (err) {
      /* already stopped */
    }
    this.voices.delete(midi);
  }

  releaseSustain() {
    for (const midi of [...this.voices.keys()]) this.stop(midi);
  }
}

const synth = new PianoSynth();
const heldKeys = new Map();
let spacePedal = false;
let octaveOffset = 0;
const WHITE_WIDTH = 18;
const BLACK_WIDTH = 11;

function baseMidiForRow(row) {
  // Lower row starts at C4; upper row is one octave higher, overlapping on C5.
  const start = row === "upper" ? 72 : 60;
  return start + octaveOffset * 12;
}

function midiFromDegree(degree, row) {
  return clampMidi(baseMidiForRow(row) + degree);
}

function renderComputerRow(containerId, items, rowKind, isBlack) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  items.forEach((item) => {
    if (item.spacer) {
      const spacer = document.createElement("div");
      spacer.className = "comp-key spacer";
      spacer.style.width = `${item.spacer * 58}px`;
      el.appendChild(spacer);
      return;
    }
    const midi = midiFromDegree(item.degree, rowKind);
    const key = document.createElement("button");
    key.type = "button";
    key.className = `comp-key${isBlack ? " blackish" : ""}`;
    key.dataset.code = item.code;
    key.dataset.midi = String(midi);
    key.innerHTML = `<span class="letter">${item.letter}</span><span class="note">${midiName(midi)}</span>`;
    key.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      noteOn(midi, item.code);
    });
    key.addEventListener("pointerup", () => noteOff(midi, item.code));
    key.addEventListener("pointerleave", () => noteOff(midi, item.code));
    el.appendChild(key);
  });
}

function isBlackMidi(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function renderPiano() {
  const piano = document.getElementById("piano");
  piano.innerHTML = "";
  const whites = [];
  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi += 1) {
    if (!isBlackMidi(midi)) whites.push(midi);
  }
  piano.style.minWidth = `${whites.length * WHITE_WIDTH + 16}px`;

  const letters = currentMap();
  whites.forEach((midi, i) => {
    const key = document.createElement("div");
    key.className = "key white";
    key.dataset.midi = String(midi);
    key.style.left = `${8 + i * WHITE_WIDTH}px`;
    key.style.width = `${WHITE_WIDTH - 1}px`;
    const letter = letters.get(midi);
    const name = midi % 12 === 0 ? midiName(midi) : "";
    key.innerHTML = `<span class="label">${letter || name}</span>`;
    bindPianoKey(key, midi);
    piano.appendChild(key);
  });

  whites.forEach((midi, i) => {
    const sharp = midi + 1;
    if (sharp > MAX_MIDI || !isBlackMidi(sharp)) return;
    const key = document.createElement("div");
    key.className = "key black";
    key.dataset.midi = String(sharp);
    key.style.width = `${BLACK_WIDTH}px`;
    key.style.left = `${8 + (i + 1) * WHITE_WIDTH - BLACK_WIDTH / 2}px`;
    const letter = letters.get(sharp);
    if (letter) key.innerHTML = `<span class="label">${letter}</span>`;
    bindPianoKey(key, sharp);
    piano.appendChild(key);
  });
}

function currentMap() {
  const map = new Map();
  const add = (items, row) => {
    items.forEach((item) => {
      if (!item.code) return;
      const midi = midiFromDegree(item.degree, row);
      if (!map.has(midi)) map.set(midi, item.letter);
    });
  };
  add(LAYOUT.lowerWhite, "lower");
  add(LAYOUT.lowerBlack, "lower");
  add(LAYOUT.upperWhite, "upper");
  add(LAYOUT.upperBlack, "upper");
  return map;
}

function bindPianoKey(el, midi) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    noteOn(midi, `mouse-${midi}`);
  });
  el.addEventListener("pointerup", () => noteOff(midi, `mouse-${midi}`));
  el.addEventListener("pointerleave", () => noteOff(midi, `mouse-${midi}`));
}

function highlight(midi, on) {
  document.querySelectorAll(`[data-midi="${midi}"]`).forEach((node) => {
    node.classList.toggle("active", on);
  });
}

const activeNotes = new Map();

function noteOn(midi, id) {
  const owners = activeNotes.get(midi) || new Set();
  const already = owners.size > 0;
  owners.add(id);
  activeNotes.set(midi, owners);
  if (!already) {
    synth.play(midi);
    highlight(midi, true);
  }
  updateHud();
}

function noteOff(midi, id) {
  const owners = activeNotes.get(midi);
  if (!owners) return;
  owners.delete(id);
  if (owners.size === 0) {
    activeNotes.delete(midi);
    synth.stop(midi);
    highlight(midi, false);
  }
  updateHud();
}

function updateHud() {
  const notes = [...activeNotes.keys()].sort((a, b) => a - b).map(midiName);
  document.getElementById("now-playing").textContent = notes.length ? notes.join("  ") : "Ready";
  const zMidi = midiFromDegree(0, "lower");
  document.getElementById("octave-label").textContent = `Z is ${midiName(zMidi)}`;
  document.getElementById("oct-value").textContent = String(octaveOffset);
}

function renderAll() {
  renderComputerRow("upper-black", LAYOUT.upperBlack, "upper", true);
  renderComputerRow("upper-white", LAYOUT.upperWhite, "upper", false);
  renderComputerRow("lower-black", LAYOUT.lowerBlack, "lower", true);
  renderComputerRow("lower-white", LAYOUT.lowerWhite, "lower", false);
  renderPiano();
  activeNotes.forEach((_, midi) => highlight(midi, true));
  const focus = document.querySelector(`.key[data-midi="${midiFromDegree(0, "lower")}"]`);
  if (focus) focus.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  updateHud();
}

function lookupKey(code) {
  const search = (items, row) => {
    const found = items.find((item) => item.code === code);
    return found ? { midi: midiFromDegree(found.degree, row), code } : null;
  };
  return (
    search(LAYOUT.lowerWhite, "lower") ||
    search(LAYOUT.lowerBlack, "lower") ||
    search(LAYOUT.upperWhite, "upper") ||
    search(LAYOUT.upperBlack, "upper")
  );
}

function setOctave(next) {
  octaveOffset = Math.max(-4, Math.min(3, next));
  // Restart mapping labels; held notes keep sounding at original pitch until released.
  renderAll();
}

document.getElementById("oct-down").addEventListener("click", () => setOctave(octaveOffset - 1));
document.getElementById("oct-up").addEventListener("click", () => setOctave(octaveOffset + 1));
document.getElementById("volume").addEventListener("input", (e) => {
  synth.setVolume(Number(e.target.value));
});
document.getElementById("sustain").addEventListener("change", (e) => {
  synth.sustain = e.target.checked;
  if (!synth.sustain) synth.releaseSustain();
});

function syncSustain() {
  synth.sustain = spacePedal || document.getElementById("sustain").checked;
  if (!synth.sustain) synth.releaseSustain();
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "Space") {
    e.preventDefault();
    spacePedal = true;
    synth.sustain = true;
    return;
  }
  if (e.code === "ArrowLeft") {
    e.preventDefault();
    setOctave(octaveOffset - 1);
    return;
  }
  if (e.code === "ArrowRight") {
    e.preventDefault();
    setOctave(octaveOffset + 1);
    return;
  }
  const mapped = lookupKey(e.code);
  if (!mapped) return;
  e.preventDefault();
  heldKeys.set(e.code, mapped.midi);
  noteOn(mapped.midi, e.code);
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spacePedal = false;
    syncSustain();
    return;
  }
  const midi = heldKeys.get(e.code);
  if (midi == null) return;
  heldKeys.delete(e.code);
  noteOff(midi, e.code);
});

window.addEventListener("blur", () => {
  heldKeys.forEach((midi, code) => noteOff(midi, code));
  heldKeys.clear();
  spacePedal = false;
  syncSustain();
});

renderAll();
