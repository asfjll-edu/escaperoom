"use strict";

/* =========================================================
   ESCAPE ROOM RAMADAN ADAM - v2 (Adventure UI)
   script.js
   ========================================================= */

/* ---------------------------------------------------------
   1. GAME STATE
   --------------------------------------------------------- */
let score = 0;
let keys = 0;
const maxKeys = 4;
let lives = 5;
const maxLives = 5;
let currentRoom = 1; // 1-5 (5 = Bilik Akhir)
let isMuted = false;
let isTransitioning = false;

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

function sfxClick() { playTone(680, 0.06, "square", 0.1); }
function sfxCorrect() {
  playTone(523.25, 0.1, "square", 0.12, 0);
  playTone(783.99, 0.16, "square", 0.13, 0.09);
}
function sfxWrong() {
  playTone(220, 0.15, "sawtooth", 0.12, 0);
  playTone(160, 0.2, "sawtooth", 0.12, 0.1);
}
function sfxUnlock() {
  playTone(392, 0.1, "square", 0.12, 0);
  playTone(523.25, 0.1, "square", 0.12, 0.1);
  playTone(659.25, 0.1, "square", 0.12, 0.2);
  playTone(880, 0.22, "square", 0.13, 0.3);
}
function sfxVictory() {
  [523.25, 587.33, 659.25, 783.99, 880, 1046.5].forEach((f, i) =>
    playTone(f, 0.22, "square", 0.13, i * 0.13)
  );
}

function toggleMute() {
  isMuted = !isMuted;
  document.getElementById("btn-mute").textContent = isMuted ? "🔇" : "🔊";
}

/* ---------------------------------------------------------
   3. DOM REFERENCES
   --------------------------------------------------------- */
const screenStart = document.getElementById("screen-start");
const screenGame = document.getElementById("screen-game");
const screenVictory = document.getElementById("screen-victory");

const roomHeaderIcon = document.getElementById("room-header-icon");
const roomHeaderTitle = document.getElementById("room-header-title");
const roomHeaderSub = document.getElementById("room-header-sub");

const stage = document.getElementById("stage");
const stageScene = document.getElementById("stage-scene");
const stageObjects = document.getElementById("stage-objects");
const feedbackLayer = document.getElementById("feedback-float-layer");
const azanOverlay = document.getElementById("azan-overlay");

const dialogNpc = document.getElementById("dialog-npc");
const dialogText = document.getElementById("dialog-text");

const hudScore = document.getElementById("hud-score");
const hudKeys = document.getElementById("hud-keys");
const hudLives = document.getElementById("hud-lives");

const statKeys = document.getElementById("stat-keys");
const statScore = document.getElementById("stat-score");
const statLives = document.getElementById("stat-lives");
const badgeRow = document.getElementById("badge-row");

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

function safeNumber(n) {
  const v = Number(n);
  return isNaN(v) ? 0 : v;
}

/* ---------------------------------------------------------
   6. HUD UPDATE (kunci Number, elak NaN)
   --------------------------------------------------------- */
function updateHUD() {
  score = safeNumber(score);
  if (score < 0) score = 0;
  keys = safeNumber(keys);
  if (keys < 0) keys = 0;
  if (keys > maxKeys) keys = maxKeys;
  lives = safeNumber(lives);
  if (lives < 0) lives = 0;
  if (lives > maxLives) lives = maxLives;

  hudScore.textContent = String(score);
  hudKeys.textContent = keys + "/" + maxKeys;

  let heartsHtml = "";
  for (let i = 0; i < maxLives; i++) {
    heartsHtml += i < lives ? "❤️" : '<span class="heart-lost">🤍</span>';
  }
  hudLives.innerHTML = heartsHtml;
}

function addScore(delta) {
  score = safeNumber(score) + safeNumber(delta);
  updateHUD();
}

function loseLife() {
  lives = safeNumber(lives) - 1;
  if (lives < 0) lives = 0;
  updateHUD();
}

/* ---------------------------------------------------------
   7. FEEDBACK: FLOAT TEXT + POPUP + SHAKE
   --------------------------------------------------------- */
function showFloatText(text, positive) {
  const el = document.createElement("div");
  el.className = "float-text " + (positive ? "positive" : "negative");
  el.textContent = text;
  feedbackLayer.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

function showPopup(message, isCorrect) {
  const el = document.createElement("div");
  el.className = "popup-msg " + (isCorrect ? "correct" : "wrong");
  el.textContent = (isCorrect ? "✅ " : "❌ ") + message;
  feedbackLayer.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

function shakeStage() {
  stage.classList.remove("screen-shake");
  void stage.offsetWidth;
  stage.classList.add("screen-shake");
}

function spawnConfetti() {
  const colors = ["#2ecc71", "#f1c40f", "#e74c3c", "#3498db", "#ffffff"];
  for (let i = 0; i < 24; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (0.9 + Math.random() * 0.8) + "s";
    piece.style.transform = "rotate(" + Math.floor(Math.random() * 360) + "deg)";
    feedbackLayer.appendChild(piece);
    setTimeout(() => piece.remove(), 2000);
  }
}

/* ---------------------------------------------------------
   8. DRAG & DROP ENGINE (Pointer Events, universal touch+mouse)
   --------------------------------------------------------- */
function findZoneAtPoint(zones, x, y) {
  for (const z of zones) {
    const r = z.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
  }
  return null;
}

function enableDrag(el, getDropZones, onDrop) {
  el.addEventListener("pointerdown", (e) => {
    if (isTransitioning) return;
    if (el.classList.contains("placed")) return;
    e.preventDefault();

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    el.setPointerCapture(pointerId);
    el.classList.add("dragging");
    el.style.transition = "none";

    function move(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      el.style.transform = "translate(" + dx + "px," + dy + "px)";
      const zones = getDropZones();
      zones.forEach(z => z.classList.remove("hover-active"));
      const hz = findZoneAtPoint(zones, ev.clientX, ev.clientY);
      if (hz) hz.classList.add("hover-active");
    }

    function up(ev) {
      el.releasePointerCapture(pointerId);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.classList.remove("dragging");

      const zones = getDropZones();
      zones.forEach(z => z.classList.remove("hover-active"));
      const dropZone = findZoneAtPoint(zones, ev.clientX, ev.clientY);

      let accepted = false;
      if (dropZone) accepted = onDrop(el, dropZone);

      if (!accepted) {
        el.classList.add("shake-reject");
        sfxWrong();
        setTimeout(() => {
          el.style.transition = "transform 0.3s ease";
          el.style.transform = "translate(0,0)";
          el.classList.remove("shake-reject");
          setTimeout(() => { el.style.transition = ""; }, 320);
        }, 10);
      }
    }

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
}

function placeItem(el) {
  el.style.transform = "";
  el.style.transition = "";
  el.classList.add("placed");
}

/* ---------------------------------------------------------
   9. ROOM META (header text, lock messages)
   --------------------------------------------------------- */
const roomMeta = {
  1: { icon: "🌙", title: "Bilik Sahur", sub: "Bersedia sebelum fajar", bgClass: "stage-sahur", npc: "👩" },
  2: { icon: "🏫", title: "Bilik Sekolah", sub: "Kekalkan puasa sepanjang hari", bgClass: "stage-sekolah", npc: "🧕" },
  3: { icon: "🌇", title: "Bilik Petang", sub: "Bersedia untuk berbuka", bgClass: "stage-petang", npc: "👨" },
  4: { icon: "🕌", title: "Bilik Berbuka", sub: "Waktu Maghrib tiba", bgClass: "stage-berbuka", npc: "👳" },
  5: { icon: "🗝️", title: "Bilik Akhir", sub: "Kunci Ramadan", bgClass: "stage-akhir", npc: "🌟" }
};

function setRoomHeader(roomNum) {
  const m = roomMeta[roomNum];
  roomHeaderIcon.textContent = m.icon;
  roomHeaderTitle.textContent = m.title;
  roomHeaderSub.textContent = m.sub;
  stage.className = "stage " + m.bgClass;
  dialogNpc.textContent = m.npc;
}

/* ---------------------------------------------------------
   10. ROOM DISPATCH
   --------------------------------------------------------- */
function renderRoom() {
  setRoomHeader(currentRoom);
  stageScene.innerHTML = "";
  azanOverlay.classList.add("hidden");

  if (currentRoom === 1) renderRoom1();
  else if (currentRoom === 2) renderRoom2();
  else if (currentRoom === 3) renderRoom3StageA();
  else if (currentRoom === 4) renderRoom4Intro();
  else if (currentRoom === 5) renderRoom5();
}

/* ---------------------------------------------------------
   11. BILIK SAHUR (Drag & Drop ke Meja)
   --------------------------------------------------------- */
const room1Items = [
  { label: "Roti", emoji: "🍞", correct: true },
  { label: "Air", emoji: "💧", correct: true },
  { label: "Kurma", emoji: "🌴", correct: true },
  { label: "Game", emoji: "🎮", correct: false },
  { label: "Bola", emoji: "⚽", correct: false },
  { label: "Headphone", emoji: "🎧", correct: false }
];
let room1PlacedCount = 0;

function renderRoom1() {
  room1PlacedCount = 0;
  dialogText.textContent = "Seret makanan dan minuman yang sesuai untuk sahur ke Meja Sahur.";

  stageObjects.innerHTML = `
    <div class="dropzone-row">
      <div class="dropzone dropzone-single" id="meja-sahur">
        <span class="dropzone-icon">🍽️</span>
        <span>MEJA SAHUR</span>
        <div class="dropzone-filled-items" id="meja-sahur-items"></div>
      </div>
    </div>
    <div class="item-tray" id="room1-tray"></div>
  `;

  const tray = document.getElementById("room1-tray");
  shuffleArray(room1Items).forEach(item => {
    const el = document.createElement("div");
    el.className = "drag-item";
    el.innerHTML = item.emoji + '<span class="drag-label">' + item.label + "</span>";
    tray.appendChild(el);

    enableDrag(el, () => [document.getElementById("meja-sahur")], (dragEl, zone) => {
      sfxClick();
      if (item.correct) {
        placeItem(dragEl);
        document.getElementById("meja-sahur-items").innerHTML += '<span class="placed-chip">' + item.emoji + "</span>";
        room1PlacedCount++;
        addScore(5);
        showFloatText("+5", true);
        showPopup("Sesuai untuk sahur!", true);
        sfxCorrect();
        if (room1PlacedCount >= 3) {
          setTimeout(() => unlockDoor(), 500);
        }
        return true;
      } else {
        showPopup("Itu tidak diperlukan untuk sahur.", false);
        loseLife();
        shakeStage();
        return false;
      }
    });
  });
}

/* ---------------------------------------------------------
   12. BILIK SEKOLAH (Drag ke 3 Kategori)
   --------------------------------------------------------- */
const room2Items = [
  { label: "Baca Al-Quran", emoji: "📖", zone: "tidak-batal" },
  { label: "Ke Masjid", emoji: "🕌", zone: "tidak-batal" },
  { label: "Berdoa", emoji: "🤲", zone: "tidak-batal" },
  { label: "Makan Sengaja", emoji: "🍔", zone: "batal" },
  { label: "Marah-marah", emoji: "😡", zone: "berhati-hati" },
  { label: "Leka Bermain", emoji: "📱", zone: "berhati-hati" }
];
let room2PlacedCount = 0;

function renderRoom2() {
  room2PlacedCount = 0;
  dialogText.textContent = "Seret setiap situasi ke kotak yang betul.";

  stageObjects.innerHTML = `
    <div class="dropzone-row">
      <div class="dropzone" data-zone="tidak-batal" id="zone-tidak-batal">
        <span class="dropzone-icon">✅</span><span>Tidak Batal</span>
        <div class="dropzone-filled-items"></div>
      </div>
      <div class="dropzone" data-zone="berhati-hati" id="zone-berhati-hati">
        <span class="dropzone-icon">⚠️</span><span>Berhati-hati</span>
        <div class="dropzone-filled-items"></div>
      </div>
      <div class="dropzone" data-zone="batal" id="zone-batal">
        <span class="dropzone-icon">❌</span><span>Batal Puasa</span>
        <div class="dropzone-filled-items"></div>
      </div>
    </div>
    <div class="item-tray" id="room2-tray"></div>
  `;

  const tray = document.getElementById("room2-tray");
  const zones = () => [
    document.getElementById("zone-tidak-batal"),
    document.getElementById("zone-berhati-hati"),
    document.getElementById("zone-batal")
  ];

  shuffleArray(room2Items).forEach(item => {
    const el = document.createElement("div");
    el.className = "drag-item";
    el.innerHTML = item.emoji + '<span class="drag-label">' + item.label + "</span>";
    tray.appendChild(el);

    enableDrag(el, zones, (dragEl, zone) => {
      sfxClick();
      if (zone.dataset.zone === item.zone) {
        placeItem(dragEl);
        zone.querySelector(".dropzone-filled-items").innerHTML += '<span class="placed-chip">' + item.emoji + "</span>";
        room2PlacedCount++;
        addScore(5);
        showFloatText("+5", true);
        sfxCorrect();
        if (room2PlacedCount >= room2Items.length) {
          setTimeout(() => unlockDoor(), 500);
        }
        return true;
      } else {
        showPopup("Bukan kategori yang betul.", false);
        loseLife();
        shakeStage();
        return false;
      }
    });
  });
}

/* ---------------------------------------------------------
   13. BILIK PETANG (Reflex Game + Dapur Drag)
   --------------------------------------------------------- */
const reflexGoodPool = [
  { emoji: "📖", correct: true },
  { emoji: "🤲", correct: true },
  { emoji: "🌴", correct: true }
];
const reflexBadPool = [
  { emoji: "🍔", correct: false },
  { emoji: "🥤", correct: false },
  { emoji: "🍟", correct: false }
];
const reflexTargetHits = 5;
const reflexDuration = 12;

let reflexHits = 0;
let reflexTimeLeft = reflexDuration;
let reflexSpawnInterval = null;
let reflexTimerInterval = null;
let reflexActive = false;

function renderRoom3StageA() {
  reflexHits = 0;
  reflexTimeLeft = reflexDuration;
  reflexActive = true;

  dialogText.textContent = "Tekan objek yang BETUL semasa ia bergerak melintasi skrin!";

  stageObjects.innerHTML = `
    <div class="reflex-timer-wrap">
      <div class="reflex-timer-track"><div class="reflex-timer-fill" id="reflex-timer-fill"></div></div>
    </div>
    <div class="reflex-lane" id="reflex-lane"></div>
    <div class="reflex-counter" id="reflex-counter">Betul: 0 / ${reflexTargetHits}</div>
  `;

  clearInterval(reflexSpawnInterval);
  clearInterval(reflexTimerInterval);

  reflexSpawnInterval = setInterval(spawnReflexObject, 850);

  reflexTimerInterval = setInterval(() => {
    reflexTimeLeft = safeNumber(reflexTimeLeft) - 1;
    if (reflexTimeLeft < 0) reflexTimeLeft = 0;
    const pct = Math.max(0, (reflexTimeLeft / reflexDuration) * 100);
    const fill = document.getElementById("reflex-timer-fill");
    if (fill) {
      fill.style.width = pct + "%";
      fill.style.background = reflexTimeLeft <= 4
        ? "linear-gradient(90deg, #e74c3c, #c0392b)"
        : "linear-gradient(90deg, #2ecc71, #219150)";
    }
    if (reflexTimeLeft <= 0 && reflexActive) {
      reflexActive = false;
      clearInterval(reflexSpawnInterval);
      clearInterval(reflexTimerInterval);
      showPopup("Masa tamat! Cuba lagi.", false);
      setTimeout(() => renderRoom3StageA(), 900);
    }
  }, 1000);
}

function spawnReflexObject() {
  if (!reflexActive) return;
  const lane = document.getElementById("reflex-lane");
  if (!lane) return;

  const useGood = Math.random() < 0.55;
  const pool = useGood ? reflexGoodPool : reflexBadPool;
  const item = pool[Math.floor(Math.random() * pool.length)];

  const el = document.createElement("button");
  el.className = "reflex-object";
  el.textContent = item.emoji;
  const topPos = Math.floor(Math.random() * 200);
  el.style.top = topPos + "px";
  const duration = 2.6 + Math.random() * 1.2;
  el.style.animationDuration = duration + "s";

  el.addEventListener("animationend", () => el.remove());
  el.addEventListener("click", () => {
    if (!reflexActive) return;
    if (item.correct) {
      sfxCorrect();
      addScore(5);
      showFloatText("+5", true);
      reflexHits++;
      document.getElementById("reflex-counter").textContent = "Betul: " + reflexHits + " / " + reflexTargetHits;
      el.remove();
      if (reflexHits >= reflexTargetHits) {
        reflexActive = false;
        clearInterval(reflexSpawnInterval);
        clearInterval(reflexTimerInterval);
        showPopup("Hebat! Sedia untuk berbuka.", true);
        setTimeout(() => renderRoom3StageB(), 700);
      }
    } else {
      sfxWrong();
      loseLife();
      shakeStage();
      showFloatText("-1 ❤️", false);
      el.remove();
    }
  });

  lane.appendChild(el);
}

const room3DapurItems = [
  { label: "Kurma", emoji: "🌴", correct: true },
  { label: "Air", emoji: "💧", correct: true },
  { label: "Bubur", emoji: "🍲", correct: false },
  { label: "Coklat", emoji: "🍫", correct: false },
  { label: "Kentang Goreng", emoji: "🍟", correct: false },
  { label: "Air Manis", emoji: "🧃", correct: false }
];
let room3DapurPlaced = 0;

function renderRoom3StageB() {
  room3DapurPlaced = 0;
  dialogText.textContent = "Seret bahan SUNNAH berbuka ke Bakul Berbuka.";

  stageObjects.innerHTML = `
    <div class="dropzone-row">
      <div class="dropzone dropzone-single" id="bakul-berbuka">
        <span class="dropzone-icon">🧺</span>
        <span>BAKUL BERBUKA</span>
        <div class="dropzone-filled-items" id="bakul-items"></div>
      </div>
    </div>
    <div class="item-tray" id="room3-tray"></div>
  `;

  const tray = document.getElementById("room3-tray");
  shuffleArray(room3DapurItems).forEach(item => {
    const el = document.createElement("div");
    el.className = "drag-item";
    el.innerHTML = item.emoji + '<span class="drag-label">' + item.label + "</span>";
    tray.appendChild(el);

    enableDrag(el, () => [document.getElementById("bakul-berbuka")], (dragEl, zone) => {
      sfxClick();
      if (item.correct) {
        placeItem(dragEl);
        document.getElementById("bakul-items").innerHTML += '<span class="placed-chip">' + item.emoji + "</span>";
        room3DapurPlaced++;
        addScore(5);
        showFloatText("+5", true);
        sfxCorrect();
        if (room3DapurPlaced >= 2) {
          setTimeout(() => unlockDoor(), 500);
        }
        return true;
      } else {
        showPopup("Bukan bahan sunnah berbuka.", false);
        loseLife();
        shakeStage();
        return false;
      }
    });
  });
}

/* ---------------------------------------------------------
   14. BILIK BERBUKA (Azan + Timeline Puzzle)
   --------------------------------------------------------- */
const room4Sequence = [
  { label: "Doa", emoji: "🤲" },
  { label: "Kurma", emoji: "🌴" },
  { label: "Air", emoji: "💧" },
  { label: "Makan", emoji: "🍛" },
  { label: "Solat", emoji: "🕌" }
];
let room4FilledCount = 0;

function renderRoom4Intro() {
  dialogText.textContent = "Waktu Maghrib telah tiba...";
  stageObjects.innerHTML = "";
  azanOverlay.classList.remove("hidden");
  sfxUnlock();

  setTimeout(() => {
    azanOverlay.classList.add("hidden");
    renderRoom4Puzzle();
  }, 2200);
}

function renderRoom4Puzzle() {
  room4FilledCount = 0;
  dialogText.textContent = "Seret kad adab berbuka mengikut urutan yang betul.";

  let slotsHtml = '<div class="timeline-row" id="timeline-row">';
  for (let i = 0; i < room4Sequence.length; i++) {
    slotsHtml += `<div class="timeline-slot" data-slot="${i}"><span class="slot-num">${i + 1}</span></div>`;
  }
  slotsHtml += "</div>";

  stageObjects.innerHTML = slotsHtml + '<div class="item-tray" id="room4-tray"></div>';

  const tray = document.getElementById("room4-tray");
  const getSlots = () => Array.from(document.querySelectorAll(".timeline-slot"));

  shuffleArray(room4Sequence).forEach(card => {
    const el = document.createElement("div");
    el.className = "drag-item";
    el.innerHTML = card.emoji + '<span class="drag-label">' + card.label + "</span>";
    tray.appendChild(el);

    enableDrag(el, getSlots, (dragEl, slotEl) => {
      sfxClick();
      const expectedIndex = room4FilledCount;
      const expectedCard = room4Sequence[expectedIndex];
      const slotIndex = Number(slotEl.dataset.slot);

      if (slotIndex === expectedIndex && card.label === expectedCard.label) {
        placeItem(dragEl);
        slotEl.classList.add("filled");
        slotEl.innerHTML = `<span class="slot-num">${slotIndex + 1}</span>${card.emoji}`;
        room4FilledCount++;
        addScore(5);
        showFloatText("+5", true);
        sfxCorrect();
        if (room4FilledCount >= room4Sequence.length) {
          setTimeout(() => unlockDoor(), 500);
        }
        return true;
      } else {
        showPopup("Bukan urutan yang betul.", false);
        loseLife();
        shakeStage();
        return false;
      }
    });
  });
}

/* ---------------------------------------------------------
   15. BILIK AKHIR (Memory Match Nilai Murni)
   --------------------------------------------------------- */
const room5Pairs = [
  { value: "Rajin", desc: "Bangun Sahur" },
  { value: "Sabar", desc: "Menahan Marah" },
  { value: "Tanggungjawab", desc: "Membantu Ibu" },
  { value: "Bersyukur", desc: "Berbuka Puasa" }
];
let room5Matched = 0;
let room5SelectedLeft = null;
let room5SelectedRight = null;

function renderRoom5() {
  room5Matched = 0;
  room5SelectedLeft = null;
  room5SelectedRight = null;
  dialogText.textContent = "Padankan nilai murni dengan amalannya untuk membuka Kunci Ramadan.";

  const leftItems = shuffleArray(room5Pairs.map((p, i) => ({ text: p.value, idx: i })));
  const rightItems = shuffleArray(room5Pairs.map((p, i) => ({ text: p.desc, idx: i })));

  stageObjects.innerHTML = `
    <div class="match-columns">
      <div class="match-col" id="match-left"></div>
      <div class="match-col" id="match-right"></div>
    </div>
  `;

  const leftCol = document.getElementById("match-left");
  const rightCol = document.getElementById("match-right");

  leftItems.forEach(item => {
    const el = document.createElement("button");
    el.className = "match-card";
    el.textContent = item.text;
    el.dataset.idx = String(item.idx);
    el.addEventListener("click", () => handleMatchClick(el, "left", item.idx));
    leftCol.appendChild(el);
  });

  rightItems.forEach(item => {
    const el = document.createElement("button");
    el.className = "match-card";
    el.textContent = item.text;
    el.dataset.idx = String(item.idx);
    el.addEventListener("click", () => handleMatchClick(el, "right", item.idx));
    rightCol.appendChild(el);
  });
}

function handleMatchClick(el, side, idx) {
  if (isTransitioning) return;
  if (el.classList.contains("matched")) return;
  sfxClick();

  if (side === "left") {
    if (room5SelectedLeft) room5SelectedLeft.el.classList.remove("selected");
    room5SelectedLeft = { el, idx };
    el.classList.add("selected");
  } else {
    if (room5SelectedRight) room5SelectedRight.el.classList.remove("selected");
    room5SelectedRight = { el, idx };
    el.classList.add("selected");
  }

  if (room5SelectedLeft && room5SelectedRight) {
    const l = room5SelectedLeft;
    const r = room5SelectedRight;

    if (l.idx === r.idx) {
      l.el.classList.remove("selected");
      r.el.classList.remove("selected");
      l.el.classList.add("matched");
      r.el.classList.add("matched");
      addScore(10);
      showFloatText("+10", true);
      sfxCorrect();
      room5Matched++;
      room5SelectedLeft = null;
      room5SelectedRight = null;

      if (room5Matched >= room5Pairs.length) {
        setTimeout(() => finishGame(), 600);
      }
    } else {
      sfxWrong();
      loseLife();
      shakeStage();
      l.el.classList.add("shake-reject");
      r.el.classList.add("shake-reject");
      showPopup("Padanan tidak tepat.", false);
      setTimeout(() => {
        l.el.classList.remove("selected", "shake-reject");
        r.el.classList.remove("selected", "shake-reject");
        room5SelectedLeft = null;
        room5SelectedRight = null;
      }, 500);
    }
  }
}

/* ---------------------------------------------------------
   16. UNLOCK DOOR / ROOM TRANSITION
   --------------------------------------------------------- */
function unlockDoor() {
  if (isTransitioning) return;
  isTransitioning = true;
  sfxUnlock();
  spawnConfetti();

  if (currentRoom <= 4) {
    keys++;
    updateHUD();
  }

  setTimeout(() => {
    if (currentRoom < 5) {
      currentRoom++;
      renderRoom();
    }
    isTransitioning = false;
  }, 700);
}

/* ---------------------------------------------------------
   17. START / RESET GAME
   --------------------------------------------------------- */
function startGame() {
  score = 0;
  keys = 0;
  lives = maxLives;
  currentRoom = 1;
  isTransitioning = false;

  updateHUD();
  showScreen(screenGame);
  renderRoom();
}

/* ---------------------------------------------------------
   18. FINISH GAME / VICTORY
   --------------------------------------------------------- */
function finishGame() {
  sfxVictory();
  spawnConfetti();
  updateHUD();

  statKeys.textContent = keys + "/" + maxKeys;
  statScore.textContent = String(score);
  statLives.textContent = lives + "/" + maxLives;

  const badges = ["🏅"];
  if (lives === maxLives) badges.push("💯");
  if (score >= 100) badges.push("⭐");
  if (keys === maxKeys) badges.push("🗝️");

  badgeRow.innerHTML = "";
  badges.forEach((b, i) => {
    const chip = document.createElement("div");
    chip.className = "badge-chip";
    chip.textContent = b;
    chip.style.animationDelay = (i * 0.2) + "s";
    badgeRow.appendChild(chip);
  });

  showScreen(screenVictory);
}

/* ---------------------------------------------------------
   19. MODALS
   --------------------------------------------------------- */
function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

/* ---------------------------------------------------------
   20. EVENT LISTENERS
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
   21. INITIAL STATE
   --------------------------------------------------------- */
showScreen(screenStart);
