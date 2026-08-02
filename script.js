"use strict";

/* =========================================================
   MISI ESCAPE ROOM RAMADAN ADAM
   script.js
   ========================================================= */

/* ---------------------------------------------------------
   1. GAME STATE
   --------------------------------------------------------- */
let currentRoom = 1;          // 1 - 4
let isTransitioning = false;  // lock antara bilik
let isMuted = false;
let hintsUsed = 0;

let elapsedSeconds = 0;       // Number, masa keseluruhan
let mainTimerInterval = null;

/* Bilik 1: Sequence */
let seq1Selected = [];        // array label kad yang dipilih ikut urutan
const seq1Correct = ["Bangun Tidur", "Makan Sahur", "Berniat Puasa", "Berbuka"];
const seq1Cards = [
  { label: "Berbuka", emoji: "🌙" },
  { label: "Berniat Puasa", emoji: "🤲" },
  { label: "Bangun Tidur", emoji: "⏰" },
  { label: "Makan Sahur", emoji: "🍽️" }
];
let seq1CardOrder = [];       // urutan paparan (dikocok)

/* Bilik 2: Filter */
const room2Items = [
  { label: "Membaca Al-Quran", emoji: "📖", eliminate: false },
  { label: "Bergaduh", emoji: "🤬", eliminate: true },
  { label: "Hidung Berdarah Tidak Sengaja", emoji: "🩸", eliminate: false },
  { label: "Makan Biskut Sengaja", emoji: "🍗", eliminate: true },
  { label: "Berehat", emoji: "😴", eliminate: false },
  { label: "Mengumpat", emoji: "🗣️", eliminate: true }
];
let room2RemovedCount = 0;
const room2TotalToRemove = 3;

/* Bilik 3: Hidden Object / Time Attack */
const room3Pool = [
  { label: "Kurma", emoji: "🌴", correct: true },
  { label: "Air Jernih", emoji: "💧", correct: true },
  { label: "Buah Segar", emoji: "🍎", correct: true },
  { label: "Kentang Goreng", emoji: "🍟", correct: false },
  { label: "Coklat", emoji: "🍫", correct: false },
  { label: "Air Manis", emoji: "🧃", correct: false },
  { label: "Sayur", emoji: "🥗", correct: false },
  { label: "Aiskrim", emoji: "🍦", correct: false },
  { label: "Donut", emoji: "🍩", correct: false }
];
let room3FoundCount = 0;
const room3TotalToFind = 3;
let room3TimeLeft = 25;
let room3Interval = null;
let room3Active = false;

/* Bilik 4: Padlock */
const room4Questions = [
  {
    text: "Digit 1: Berapa syarat wajib puasa?",
    options: ["2", "3", "4", "5"],
    correctIndex: 1,
    digit: "3"
  },
  {
    text: "Digit 2: Adakah muntah TIDAK sengaja membatalkan puasa? (0 = Tidak Batal, 1 = Batal)",
    options: ["0", "1"],
    correctIndex: 0,
    digit: "0"
  },
  {
    text: "Digit 3: Rukun Puasa ada berapa? (Niat & Menahan Diri)",
    options: ["1", "2", "3", "4"],
    correctIndex: 1,
    digit: "2"
  }
];
let room4Answered = [null, null, null];
let room4Digits = ["_", "_", "_"];
const room4CorrectCode = "302";
let room4EnteredCode = "";

/* ---------------------------------------------------------
   2. AUDIO SYNTHESIZER (Web Audio API, 8-bit, tiada mp3)
   --------------------------------------------------------- */
let audioCtx = null;

function unlockAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AC();
}

function playTone(freq, duration, type, volume, delay) {
  if (!audioCtx || isMuted) return;
  const t0 = audioCtx.currentTime + (delay || 0);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || "square";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume || 0.12, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function sfxClick() {
  playTone(680, 0.07, "square", 0.1);
}

function sfxUnlock() {
  playTone(392, 0.1, "square", 0.12, 0);
  playTone(523.25, 0.1, "square", 0.12, 0.1);
  playTone(659.25, 0.1, "square", 0.12, 0.2);
  playTone(880, 0.2, "square", 0.13, 0.3);
}

function sfxWrong() {
  playTone(220, 0.16, "sawtooth", 0.12, 0);
  playTone(160, 0.22, "sawtooth", 0.12, 0.1);
}

function sfxVictory() {
  const melody = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  melody.forEach((f, i) => playTone(f, 0.22, "square", 0.13, i * 0.14));
}

function toggleMute() {
  isMuted = !isMuted;
  const btn = document.getElementById("btn-mute");
  btn.textContent = isMuted ? "🔇" : "🔊";
}

/* ---------------------------------------------------------
   3. DOM REFERENCES
   --------------------------------------------------------- */
const screenStart = document.getElementById("screen-start");
const screenGame = document.getElementById("screen-game");
const screenVictory = document.getElementById("screen-victory");

const hudRoom = document.getElementById("hud-room");
const hudTimer = document.getElementById("hud-timer");
const lockMessage = document.getElementById("lock-message");
const roomStage = document.getElementById("room-stage");
const hintBox = document.getElementById("hint-box");
const toast = document.getElementById("toast");
const roomDots = document.querySelectorAll(".room-dot");

const victoryTime = document.getElementById("victory-time");
const victoryHints = document.getElementById("victory-hints");
const victoryRank = document.getElementById("victory-rank");

/* ---------------------------------------------------------
   4. SCREEN NAVIGATION
   --------------------------------------------------------- */
function showScreen(el) {
  [screenStart, screenGame, screenVictory].forEach(s => s.classList.add("hidden"));
  el.classList.remove("hidden");
}

/* ---------------------------------------------------------
   5. UTILS
   --------------------------------------------------------- */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(totalSeconds) {
  let s = Number(totalSeconds);
  if (isNaN(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}

function showToast(message, isError) {
  toast.textContent = message;
  toast.classList.remove("hidden", "error");
  if (isError) toast.classList.add("error");
  toast.classList.remove("hidden");
  void toast.offsetWidth;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 1800);
}

/* ---------------------------------------------------------
   6. MAIN TIMER (count-up, elak NaN)
   --------------------------------------------------------- */
function startMainTimer() {
  stopMainTimer();
  elapsedSeconds = 0;
  mainTimerInterval = setInterval(() => {
    elapsedSeconds = Number(elapsedSeconds) + 1;
    if (isNaN(elapsedSeconds)) elapsedSeconds = 0;
    hudTimer.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function stopMainTimer() {
  if (mainTimerInterval) {
    clearInterval(mainTimerInterval);
    mainTimerInterval = null;
  }
}

/* ---------------------------------------------------------
   7. HUD / ROOM DOTS UPDATE
   --------------------------------------------------------- */
function updateHUDRoom() {
  hudRoom.textContent = currentRoom + " / 4";
  roomDots.forEach(dot => {
    const r = Number(dot.dataset.room);
    dot.classList.remove("active", "done");
    if (r < currentRoom) dot.classList.add("done");
    else if (r === currentRoom) dot.classList.add("active");
  });
}

/* ---------------------------------------------------------
   8. HINT SYSTEM
   --------------------------------------------------------- */
const roomHints = {
  1: "Petunjuk: Mulakan dengan bangun dari tidur sebelum makan, kemudian niat sebelum fajar, dan hari itu berakhir dengan berbuka.",
  2: "Petunjuk: Buang perkara yang membatalkan puasa (makan sengaja) dan yang makruh (bergaduh, mengumpat).",
  3: "Petunjuk: Cari Kurma, Air Jernih dan Buah Segar sahaja — elakkan makanan berat atau minuman manis.",
  4: "Petunjuk: Jawab ketiga-tiga soalan dahulu untuk mendapatkan digitnya, kemudian taip kod pada NumPad."
};

function showHint() {
  hintsUsed++;
  hintBox.textContent = "💡 " + roomHints[currentRoom];
  hintBox.classList.remove("hidden");
  document.getElementById("btn-hint").classList.add("active-hint");
  sfxClick();
}

/* ---------------------------------------------------------
   9. ROOM LOCK MESSAGES
   --------------------------------------------------------- */
const lockMessages = {
  1: "Kunci pintu terikat dengan urutan sahur yang betul!",
  2: "Pengawal Pintu hanya bagi lalu jika kelas bebas daripada perkara makruh/batal!",
  3: "Cari 3 Bahan Sunnah Berbuka yang tersembunyi di dapur sebelum masa tamat!",
  4: "Masukkan 3-Digit Kod Rahsia pada Peti Besi untuk berbuka puasa!"
};

/* ---------------------------------------------------------
   10. ROOM RENDER DISPATCH
   --------------------------------------------------------- */
function renderRoom() {
  hintBox.classList.add("hidden");
  document.getElementById("btn-hint").classList.remove("active-hint");
  lockMessage.textContent = lockMessages[currentRoom];
  updateHUDRoom();

  if (currentRoom === 1) {
    roomStage.className = "room-stage bg-sahur";
    renderRoom1();
  } else if (currentRoom === 2) {
    roomStage.className = "room-stage bg-sekolah";
    renderRoom2();
  } else if (currentRoom === 3) {
    roomStage.className = "room-stage bg-dapur";
    renderRoom3();
  } else if (currentRoom === 4) {
    roomStage.className = "room-stage bg-berbuka";
    renderRoom4();
  }
}

/* ---------------------------------------------------------
   11. BILIK 1: BILIK SAHUR (Sequence Puzzle)
   --------------------------------------------------------- */
function renderRoom1() {
  seq1Selected = [];
  seq1CardOrder = shuffleArray(seq1Cards);

  roomStage.innerHTML = `
    <div class="room-heading">🚪 BILIK 1: BILIK SAHUR</div>
    <div class="room-instruction">Tekan kad mengikut urutan waktu yang betul sebelum berpuasa.</div>
    <div class="sequence-slots" id="seq-slots"></div>
    <div class="card-grid" id="seq-card-grid"></div>
  `;

  renderSeqSlots();

  const grid = document.getElementById("seq-card-grid");
  seq1CardOrder.forEach(card => {
    const btn = document.createElement("button");
    btn.className = "seq-card";
    btn.innerHTML = `<span class="card-emoji">${card.emoji}</span><span class="card-label">${card.label}</span>`;
    btn.addEventListener("click", () => handleSeq1Pick(card.label, btn));
    grid.appendChild(btn);
  });
}

function renderSeqSlots() {
  const slotsEl = document.getElementById("seq-slots");
  slotsEl.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const slot = document.createElement("div");
    if (seq1Selected[i]) {
      slot.className = "sequence-slot filled";
      const c = seq1Cards.find(c => c.label === seq1Selected[i]);
      slot.textContent = c ? c.emoji : "?";
    } else {
      slot.className = "sequence-slot";
      slot.textContent = i + 1;
    }
    slotsEl.appendChild(slot);
  }
}

function handleSeq1Pick(label, btnEl) {
  if (isTransitioning) return;
  if (seq1Selected.includes(label)) return;

  sfxClick();
  const expectedLabel = seq1Correct[seq1Selected.length];

  if (label === expectedLabel) {
    seq1Selected.push(label);
    btnEl.disabled = true;
    renderSeqSlots();

    if (seq1Selected.length === seq1Correct.length) {
      showToast("✅ URUTAN BETUL!", false);
      unlockDoor();
    }
  } else {
    sfxWrong();
    btnEl.classList.add("wrong-shake");
    showToast("❌ Urutan salah, cuba lagi!", true);
    seq1Selected = [];
    renderSeqSlots();
    setTimeout(() => {
      document.querySelectorAll(".seq-card").forEach(b => {
        b.disabled = false;
        b.classList.remove("wrong-shake");
      });
    }, 450);
  }
}

/* ---------------------------------------------------------
   12. BILIK 2: KELAS SEKOLAH (Toggle Filter)
   --------------------------------------------------------- */
function renderRoom2() {
  room2RemovedCount = 0;

  roomStage.innerHTML = `
    <div class="room-heading">🚪 BILIK 2: KELAS SEKOLAH</div>
    <div class="room-instruction">Klik untuk BUANG situasi yang BATAL atau MAKRUH sahaja.</div>
    <div class="filter-grid" id="filter-grid"></div>
    <div class="filter-counter" id="filter-counter">Dibuang: 0 / 3</div>
  `;

  const grid = document.getElementById("filter-grid");
  room2Items.forEach((item, idx) => {
    const btn = document.createElement("button");
    btn.className = "filter-item";
    btn.dataset.idx = String(idx);
    btn.innerHTML = `<span class="card-emoji">${item.emoji}</span><span class="card-label">${item.label}</span>`;
    btn.addEventListener("click", () => handleRoom2Click(idx, btn));
    grid.appendChild(btn);
  });
}

function handleRoom2Click(idx, btnEl) {
  if (isTransitioning) return;
  if (btnEl.classList.contains("removed")) return;

  const item = room2Items[idx];

  if (item.eliminate) {
    sfxClick();
    btnEl.classList.add("removed");
    room2RemovedCount++;
    document.getElementById("filter-counter").textContent =
      "Dibuang: " + room2RemovedCount + " / " + room2TotalToRemove;

    if (room2RemovedCount >= room2TotalToRemove) {
      showToast("✅ KELAS SUDAH BERSIH!", false);
      unlockDoor();
    }
  } else {
    sfxWrong();
    btnEl.classList.add("wrong-shake");
    showToast("❌ Itu perkara sah/sunat, jangan buang!", true);
    setTimeout(() => btnEl.classList.remove("wrong-shake"), 450);
  }
}

/* ---------------------------------------------------------
   13. BILIK 3: DAPUR PETANG (Hidden Object / Time Attack)
   --------------------------------------------------------- */
function renderRoom3() {
  room3FoundCount = 0;
  room3TimeLeft = 25;
  room3Active = true;

  const shuffled = shuffleArray(room3Pool);

  roomStage.innerHTML = `
    <div class="room-heading">🚪 BILIK 3: DAPUR PETANG</div>
    <div class="room-instruction">Cari 3 Bahan Sunnah Berbuka dalam masa yang diberikan!</div>
    <div class="timeattack-bar-track"><div class="timeattack-bar-fill" id="room3-bar"></div></div>
    <div class="hidden-object-grid" id="room3-grid"></div>
    <div class="found-counter" id="room3-counter">Dijumpai: 0 / 3 &nbsp;|&nbsp; Masa: <span id="room3-time">25</span>s</div>
  `;

  const grid = document.getElementById("room3-grid");
  shuffled.forEach((item, idx) => {
    const btn = document.createElement("button");
    btn.className = "hidden-item";
    btn.dataset.idx = String(idx);
    btn.textContent = item.emoji;
    btn.title = item.label;
    btn.addEventListener("click", () => handleRoom3Click(item, btn));
    grid.appendChild(btn);
  });

  clearInterval(room3Interval);
  room3Interval = setInterval(() => {
    room3TimeLeft = Number(room3TimeLeft) - 1;
    if (isNaN(room3TimeLeft)) room3TimeLeft = 0;
    if (room3TimeLeft < 0) room3TimeLeft = 0;
    updateRoom3Bar();

    if (room3TimeLeft <= 0 && room3Active) {
      room3Active = false;
      clearInterval(room3Interval);
      sfxWrong();
      showToast("⏱️ MASA TAMAT! Cuba lagi.", true);
      setTimeout(() => renderRoom3(), 1000);
    }
  }, 1000);
}

function updateRoom3Bar() {
  const pct = Math.max(0, (room3TimeLeft / 25) * 100);
  const bar = document.getElementById("room3-bar");
  const timeLabel = document.getElementById("room3-time");
  if (bar) bar.style.width = pct + "%";
  if (timeLabel) timeLabel.textContent = String(room3TimeLeft);
  if (bar) {
    if (room3TimeLeft <= 8) {
      bar.style.background = "linear-gradient(90deg, #ff4d4d, #cc2f2f)";
    } else if (room3TimeLeft <= 15) {
      bar.style.background = "linear-gradient(90deg, #ffd23e, #e0a82a)";
    }
  }
}

function handleRoom3Click(item, btnEl) {
  if (isTransitioning || !room3Active) return;
  if (btnEl.classList.contains("found")) return;

  if (item.correct) {
    sfxClick();
    btnEl.classList.add("found");
    room3FoundCount++;
    document.getElementById("room3-counter").innerHTML =
      "Dijumpai: " + room3FoundCount + " / " + room3TotalToFind + " &nbsp;|&nbsp; Masa: <span id=\"room3-time\">" + room3TimeLeft + "</span>s";

    if (room3FoundCount >= room3TotalToFind) {
      room3Active = false;
      clearInterval(room3Interval);
      showToast("✅ BAHAN SUNNAH DIJUMPAI!", false);
      unlockDoor();
    }
  } else {
    sfxWrong();
    btnEl.classList.add("wrong-flash");
    room3TimeLeft = Number(room3TimeLeft) - 5;
    if (room3TimeLeft < 0) room3TimeLeft = 0;
    updateRoom3Bar();
    showToast("❌ Bukan bahan sunnah! -5 saat", true);
    setTimeout(() => btnEl.classList.remove("wrong-flash"), 450);

    if (room3TimeLeft <= 0) {
      room3Active = false;
      clearInterval(room3Interval);
      showToast("⏱️ MASA TAMAT! Cuba lagi.", true);
      setTimeout(() => renderRoom3(), 1000);
    }
  }
}

/* ---------------------------------------------------------
   14. BILIK 4: RUANG BERBUKA (Combination Padlock)
   --------------------------------------------------------- */
function renderRoom4() {
  room4Answered = [null, null, null];
  room4Digits = ["_", "_", "_"];
  room4EnteredCode = "";

  roomStage.innerHTML = `
    <div class="room-heading">🚪 BILIK 4: RUANG BERBUKA</div>
    <div class="room-instruction">Jawab soalan untuk dapatkan digit, kemudian masukkan kod pada Peti Besi.</div>
    <div class="padlock-questions" id="padlock-questions"></div>
    <div class="safe-display" id="safe-display"></div>
    <div class="numpad" id="numpad"></div>
  `;

  const qWrap = document.getElementById("padlock-questions");
  room4Questions.forEach((q, qi) => {
    const qBox = document.createElement("div");
    qBox.className = "padlock-question";
    qBox.innerHTML = `<div class="padlock-q-text">${q.text}</div>
      <div class="padlock-q-options" id="padlock-opts-${qi}"></div>
      <div class="padlock-digit-reveal" id="padlock-digit-${qi}"></div>`;
    qWrap.appendChild(qBox);

    const optsWrap = qBox.querySelector(`#padlock-opts-${qi}`);
    q.options.forEach((opt, oi) => {
      const b = document.createElement("button");
      b.className = "padlock-opt-btn";
      b.textContent = opt;
      b.addEventListener("click", () => handleRoom4Answer(qi, oi, b));
      optsWrap.appendChild(b);
    });
  });

  renderSafeDisplay();
  renderNumpad();
}

function handleRoom4Answer(qIndex, optIndex, btnEl) {
  if (isTransitioning) return;
  sfxClick();

  const q = room4Questions[qIndex];
  const optsWrap = document.getElementById("padlock-opts-" + qIndex);
  Array.from(optsWrap.children).forEach(b => b.classList.remove("selected"));
  btnEl.classList.add("selected");

  room4Answered[qIndex] = optIndex;
  const digitReveal = document.getElementById("padlock-digit-" + qIndex);

  if (optIndex === q.correctIndex) {
    room4Digits[qIndex] = q.digit;
    digitReveal.textContent = "✅ DIGIT: " + q.digit;
    digitReveal.style.color = "var(--c-neon-green)";
  } else {
    room4Digits[qIndex] = "_";
    digitReveal.textContent = "❌ Cuba jawapan lain";
    digitReveal.style.color = "var(--c-neon-red)";
  }
  renderSafeDisplay();
}

function renderSafeDisplay() {
  const wrap = document.getElementById("safe-display");
  wrap.innerHTML = "";
  const enteredPadded = room4EnteredCode.split("");
  for (let i = 0; i < 3; i++) {
    const box = document.createElement("div");
    box.className = "safe-digit-box";
    box.textContent = enteredPadded[i] || "_";
    wrap.appendChild(box);
  }
}

function renderNumpad() {
  const pad = document.getElementById("numpad");
  pad.innerHTML = "";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "PADAM", "0", "MASUK"];
  keys.forEach(key => {
    const b = document.createElement("button");
    b.className = "numpad-btn" + (key === "PADAM" || key === "MASUK" ? " wide" : "");
    b.textContent = key;
    b.addEventListener("click", () => handleNumpadPress(key));
    pad.appendChild(b);
  });
}

function handleNumpadPress(key) {
  if (isTransitioning) return;
  sfxClick();

  if (key === "PADAM") {
    room4EnteredCode = room4EnteredCode.slice(0, -1);
    renderSafeDisplay();
    return;
  }

  if (key === "MASUK") {
    submitRoom4Code();
    return;
  }

  if (room4EnteredCode.length < 3) {
    room4EnteredCode += key;
    renderSafeDisplay();
  }
}

function submitRoom4Code() {
  if (room4EnteredCode.length !== 3) {
    showToast("Sila masukkan 3 digit kod!", true);
    return;
  }

  if (room4EnteredCode === room4CorrectCode) {
    showToast("✅ PETI BESI TERBUKA!", false);
    unlockDoor();
  } else {
    sfxWrong();
    showToast("❌ Kod salah! Jawab soalan dengan teliti.", true);
    room4EnteredCode = "";
    renderSafeDisplay();
  }
}

/* ---------------------------------------------------------
   15. UNLOCK DOOR / ROOM TRANSITION
   --------------------------------------------------------- */
function unlockDoor() {
  if (isTransitioning) return;
  isTransitioning = true;
  sfxUnlock();

  clearInterval(room3Interval);
  room3Active = false;

  roomStage.classList.add("room-transition-out");

  setTimeout(() => {
    roomStage.classList.remove("room-transition-out");
    if (currentRoom < 4) {
      currentRoom++;
      renderRoom();
      isTransitioning = false;
    } else {
      finishGame();
    }
  }, 550);
}

/* ---------------------------------------------------------
   16. START / RESET GAME
   --------------------------------------------------------- */
function startGame() {
  currentRoom = 1;
  hintsUsed = 0;
  isTransitioning = false;

  showScreen(screenGame);
  renderRoom();
  startMainTimer();
}

/* ---------------------------------------------------------
   17. FINISH GAME / VICTORY
   --------------------------------------------------------- */
function finishGame() {
  stopMainTimer();
  sfxVictory();

  let totalSeconds = Number(elapsedSeconds);
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;

  victoryTime.textContent = formatTime(totalSeconds);
  victoryHints.textContent = String(hintsUsed);

  let rank = "ESCAPE MASTER";
  if (hintsUsed >= 3 || totalSeconds > 480) {
    rank = "PEMBANTU RAJIN";
  } else if (hintsUsed >= 1 || totalSeconds > 240) {
    rank = "PENYELAMAT ADAM";
  } else {
    rank = "ESCAPE MASTER";
  }
  victoryRank.textContent = rank;

  showScreen(screenVictory);
}

/* ---------------------------------------------------------
   18. MODALS
   --------------------------------------------------------- */
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

/* ---------------------------------------------------------
   19. EVENT LISTENERS
   --------------------------------------------------------- */
document.getElementById("btn-start").addEventListener("click", () => {
  unlockAudio();
  sfxClick();
  startGame();
});

document.getElementById("btn-howto").addEventListener("click", () => {
  unlockAudio();
  sfxClick();
  openModal("modal-howto");
});

document.getElementById("btn-replay").addEventListener("click", () => {
  sfxClick();
  startGame();
});

document.getElementById("btn-hint").addEventListener("click", () => {
  showHint();
});

document.getElementById("btn-mute").addEventListener("click", () => {
  toggleMute();
});

document.querySelectorAll("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => {
    sfxClick();
    closeModal(btn.dataset.closeModal);
  });
});

document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

/* ---------------------------------------------------------
   20. INITIAL STATE
   --------------------------------------------------------- */
showScreen(screenStart);
