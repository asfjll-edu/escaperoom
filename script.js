/* =========================================================
   MISI ESCAPE ROOM RAMADAN ADAM — script.js
   Vanilla JS. No external libraries/audio files.
   ========================================================= */

(function(){
"use strict";

/* ============ AUDIO ENGINE (Web Audio API synth) ============ */
const Audio8bit = (function(){
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let soundOn = true;
  let musicTimer = null;
  let musicStep = 0;

  function ensureCtx(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.12;
      musicGain.connect(masterGain);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.35;
      sfxGain.connect(masterGain);
    }
    if(ctx.state === "suspended"){ ctx.resume(); }
  }

  function tone(freq, dur, type, gainNode, startAt, vol){
    if(!soundOn) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + (startAt || 0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(gainNode);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playClick(){
    ensureCtx();
    tone(520, 0.07, "square", sfxGain, 0, 0.4);
  }

  function playUnlock(){
    ensureCtx();
    tone(392, 0.09, "square", sfxGain, 0, 0.45);
    tone(523, 0.09, "square", sfxGain, 0.09, 0.45);
    tone(659, 0.09, "square", sfxGain, 0.18, 0.45);
    tone(784, 0.22, "square", sfxGain, 0.27, 0.5);
  }

  function playError(){
    ensureCtx();
    tone(180, 0.16, "sawtooth", sfxGain, 0, 0.4);
    tone(140, 0.22, "sawtooth", sfxGain, 0.1, 0.4);
  }

  function playVictory(){
    ensureCtx();
    const notes = [523,659,784,1047,784,1047,1319];
    notes.forEach((n,i)=> tone(n, 0.22, "square", sfxGain, i*0.14, 0.5));
  }

  const scale = [261.63, 329.63, 392.00, 440.00, 523.25, 440.00, 392.00, 329.63];
  function musicLoop(){
    if(!soundOn){ musicTimer = setTimeout(musicLoop, 500); return; }
    ensureCtx();
    const note = scale[musicStep % scale.length];
    tone(note, 0.5, "triangle", musicGain, 0, 0.22);
    tone(note/2, 0.9, "sine", musicGain, 0, 0.12);
    musicStep++;
    musicTimer = setTimeout(musicLoop, 480);
  }

  function startMusic(){
    ensureCtx();
    if(musicTimer) return;
    musicLoop();
  }

  function setSoundOn(v){
    soundOn = v;
  }

  return { ensureCtx, playClick, playUnlock, playError, playVictory, startMusic, setSoundOn,
           get on(){ return soundOn; } };
})();

/* ============ GAME STATE ============ */
const State = {
  currentRoom: 1,
  keys: 0,
  hintsUsed: 0,
  startTime: null,
  timerInterval: null,
  locked: false, // prevents interaction during transitions
  soundOn: true
};

const ROOM_HINTS = {
  1: "Fikir apa yang Adam buat dahulu sebelum berpuasa: Bangun ➔ Makan ➔ Niat ➔ (mula puasa hingga) Berbuka.",
  2: "Buang sahaja perkara yang BATAL atau MAKRUH seperti bergaduh, makan sengaja, dan mengumpat.",
  3: "Sunnah berbuka: Kurma, Air Jernih, dan Buah-buahan. Elak makanan berlebihan gula/minyak!",
  4: "Digit 1 = bilangan syarat wajib puasa. Digit 2 = 0 kerana muntah tak sengaja tidak membatalkan. Digit 3 = bilangan rukun puasa."
};

/* ============ DOM refs ============ */
const $ = (sel, ctx) => (ctx||document).querySelector(sel);
const $all = (sel, ctx) => Array.from((ctx||document).querySelectorAll(sel));

const screenSplash = $("#screen-splash");
const screenGame = $("#screen-game");
const screenVictory = $("#screen-victory");
const btnStart = $("#btn-start");
const btnHint = $("#btn-hint");
const btnSound = $("#btn-sound");
const hudRoomNum = $("#hud-room-num");
const hudKeys = $("#hud-keys");
const hudTimer = $("#hud-timer");
const doorTransition = $("#door-transition");
const hintPopup = $("#hint-popup");
const hintText = $("#hint-text");
const hintClose = $("#hint-close");

/* ============ Helpers ============ */
function showScreen(el){
  [screenSplash, screenGame, screenVictory].forEach(s => s.classList.remove("active"));
  el.classList.add("active");
}

function formatTime(ms){
  const totalSec = Math.max(0, Math.floor(ms/1000));
  const m = String(Math.floor(totalSec/60)).padStart(2,"0");
  const s = String(totalSec%60).padStart(2,"0");
  return m+":"+s;
}

function updateHud(){
  hudRoomNum.textContent = State.currentRoom;
  hudKeys.textContent = "🗝️ " + State.keys + "/4";
  $all(".progress-node").forEach(node=>{
    const r = Number(node.dataset.room);
    node.classList.remove("done","current");
    if(r < State.currentRoom) node.classList.add("done");
    else if(r === State.currentRoom) node.classList.add("current");
  });
}

function startGlobalTimer(){
  State.startTime = Date.now();
  State.timerInterval = setInterval(()=>{
    const elapsed = Date.now() - State.startTime;
    hudTimer.textContent = formatTime(elapsed);
  }, 250);
}

function stopGlobalTimer(){
  if(State.timerInterval){ clearInterval(State.timerInterval); State.timerInterval = null; }
}

/* ============ Room transition (door unlock) ============ */
function unlockRoomAndAdvance(roomNum){
  if(State.locked) return;
  State.locked = true;
  State.keys = Math.min(4, State.keys + 1);
  updateHud();
  Audio8bit.playUnlock();

  const currentRoomEl = $(`#room-${roomNum}`);
  currentRoomEl.classList.add("leaving");

  doorTransition.classList.add("active");
  // reset animation by cloning
  const leftLeaf = $(".door-left");
  const rightLeaf = $(".door-right");
  leftLeaf.style.animation = "none"; rightLeaf.style.animation = "none";
  void leftLeaf.offsetWidth;
  leftLeaf.style.animation = "";
  rightLeaf.style.animation = "";

  setTimeout(()=>{
    doorTransition.classList.remove("active");
    currentRoomEl.classList.remove("active","leaving");

    if(roomNum >= 4){
      goToVictory();
    } else {
      State.currentRoom = roomNum + 1;
      updateHud();
      const nextEl = $(`#room-${State.currentRoom}`);
      nextEl.classList.add("active");
    }
    State.locked = false;
  }, 950);
}

/* ============ ROOM 1: SAHUR (sequence) ============ */
(function setupRoom1(){
  const correctOrder = ["bangun","makan","niat","berbuka"];
  let placed = [];
  const slots = $all(".seq-slot");
  const cards = $all(".seq-card");
  const resetBtn = $("#seq-reset");

  function renderSlots(){
    slots.forEach((slot, i)=>{
      const numSpan = slot.querySelector(".slot-num");
      if(placed[i]){
        const card = cards.find(c=>c.dataset.id===placed[i]);
        slot.innerHTML = card ? card.innerHTML : "";
        slot.classList.add("filled");
      } else {
        slot.innerHTML = `<span class="slot-num">${i+1}</span>`;
        slot.classList.remove("filled");
      }
    });
  }

  function resetSeq(){
    placed = [];
    cards.forEach(c=> c.classList.remove("used","wrong"));
    renderSlots();
  }

  cards.forEach(card=>{
    card.addEventListener("click", ()=>{
      if(State.locked || State.currentRoom !== 1) return;
      Audio8bit.playClick();
      const id = card.dataset.id;
      const expectedIndex = placed.length;
      if(correctOrder[expectedIndex] === id){
        placed.push(id);
        card.classList.add("used");
        renderSlots();
        if(placed.length === correctOrder.length){
          setTimeout(()=> unlockRoomAndAdvance(1), 400);
        }
      } else {
        card.classList.add("wrong");
        Audio8bit.playError();
        setTimeout(()=>{
          card.classList.remove("wrong");
          resetSeq();
        }, 450);
      }
    });
  });

  resetBtn.addEventListener("click", ()=>{
    Audio8bit.playClick();
    resetSeq();
  });

  resetSeq();
})();

/* ============ ROOM 2: KELAS (filter/eliminate) ============ */
(function setupRoom2(){
  const items = $all(".filter-item");
  const totalToRemove = items.filter(i=> i.dataset.remove === "true").length;
  let removedCount = 0;
  const countEl = $("#filter-count");

  items.forEach(item=>{
    item.addEventListener("click", ()=>{
      if(State.locked || State.currentRoom !== 2) return;
      if(item.classList.contains("eliminated")) return;
      const shouldRemove = item.dataset.remove === "true";
      if(shouldRemove){
        Audio8bit.playClick();
        item.classList.add("eliminated");
        removedCount++;
        countEl.textContent = removedCount;
        if(removedCount >= totalToRemove){
          setTimeout(()=> unlockRoomAndAdvance(2), 400);
        }
      } else {
        Audio8bit.playError();
        item.classList.add("error");
        item.classList.add("protected");
        setTimeout(()=> item.classList.remove("error","protected"), 500);
      }
    });
  });
})();

/* ============ ROOM 3: DAPUR (hidden object + timer) ============ */
(function setupRoom3(){
  const items = $all(".hunt-item");
  const totalCorrect = items.filter(i=> i.dataset.correct === "true").length;
  const countEl = $("#hunt-count");
  const fillEl = $("#mini-timer-fill");
  const textEl = $("#mini-timer-text");
  const TOTAL_TIME = 25.0;
  let timeLeft = TOTAL_TIME;
  let foundCount = 0;
  let intervalId = null;
  let started = false;

  function resetRoom3(){
    timeLeft = TOTAL_TIME;
    foundCount = 0;
    started = false;
    countEl.textContent = "0";
    items.forEach(i=> i.classList.remove("found","error"));
    updateTimerUI();
  }

  function updateTimerUI(){
    textEl.textContent = timeLeft.toFixed(1) + "s";
    const pct = Math.max(0, (timeLeft/TOTAL_TIME)*100);
    fillEl.style.width = pct + "%";
    if(pct < 30) fillEl.style.background = "linear-gradient(90deg,#e74c3c,#f1c40f)";
    else fillEl.style.background = "linear-gradient(90deg, #2ecc71, #f1c40f)";
  }

  function startTimer(){
    if(started) return;
    started = true;
    intervalId = setInterval(()=>{
      timeLeft -= 0.1;
      if(timeLeft <= 0){
        timeLeft = 0;
        updateTimerUI();
        clearInterval(intervalId);
        started = false;
        showHint("⏰ Masa tamat! Cuba lagi cari bahan Sunnah Berbuka.");
        setTimeout(resetRoom3, 300);
        return;
      }
      updateTimerUI();
    }, 100);
  }

  items.forEach(item=>{
    item.addEventListener("click", ()=>{
      if(State.locked || State.currentRoom !== 3) return;
      if(item.classList.contains("found")) return;
      startTimer();
      const isCorrect = item.dataset.correct === "true";
      if(isCorrect){
        Audio8bit.playClick();
        item.classList.add("found");
        foundCount++;
        countEl.textContent = foundCount;
        if(foundCount >= totalCorrect){
          clearInterval(intervalId);
          started = false;
          setTimeout(()=> unlockRoomAndAdvance(3), 400);
        }
      } else {
        Audio8bit.playError();
        item.classList.add("error");
        setTimeout(()=> item.classList.remove("error"), 400);
        timeLeft = Math.max(0, timeLeft - 5);
        updateTimerUI();
      }
    });
  });

  resetRoom3();
  // expose reset for room re-entry if user goes back (not typical but safe)
  window.__resetRoom3 = resetRoom3;
})();

/* ============ ROOM 4: BERBUKA (quiz -> combination padlock) ============ */
(function setupRoom4(){
  const quizCards = $all(".quiz-card");
  const answers = { "1": "3", "2": "0", "3": "2" };
  let solvedCount = 0;
  const correctCode = "302";
  let inputDigits = [];
  const numpad = $("#numpad");
  const numButtons = $all("button", numpad);
  const safeDigits = $all(".safe-digit");

  function setNumpadEnabled(enabled){
    numButtons.forEach(b=> b.disabled = !enabled);
  }
  setNumpadEnabled(false);

  quizCards.forEach(card=>{
    const qNum = card.dataset.q;
    const opts = $all("button", card.querySelector(".quiz-opts"));
    const feedback = card.querySelector(".quiz-feedback");
    opts.forEach(btn=>{
      btn.addEventListener("click", ()=>{
        if(State.locked || State.currentRoom !== 4 || card.classList.contains("solved")) return;
        const val = btn.dataset.val;
        if(val === answers[qNum]){
          Audio8bit.playClick();
          btn.classList.add("correct");
          opts.forEach(o=> o.disabled = true);
          card.classList.add("solved");
          feedback.textContent = "✅ Betul! Digit ini disahkan.";
          solvedCount++;
          if(solvedCount === quizCards.length){
            setNumpadEnabled(true);
            feedback.parentElement && null;
          }
        } else {
          Audio8bit.playError();
          btn.classList.add("wrong");
          feedback.textContent = "❌ Cuba lagi!";
          setTimeout(()=> btn.classList.remove("wrong"), 500);
        }
      });
    });
  });

  function renderSafe(){
    safeDigits.forEach((d,i)=>{
      d.textContent = inputDigits[i] !== undefined ? inputDigits[i] : "_";
    });
  }

  function shakeSafe(){
    const box = $(".safe-display");
    box.style.animation = "none";
    void box.offsetWidth;
    box.style.animation = "shake 0.4s";
  }

  numButtons.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(State.locked || State.currentRoom !== 4) return;
      const num = btn.dataset.num;
      if(num === "clr"){
        Audio8bit.playClick();
        inputDigits = [];
        renderSafe();
        return;
      }
      if(num === "ok"){
        if(inputDigits.length < 3){
          Audio8bit.playError();
          shakeSafe();
          return;
        }
        const code = inputDigits.join("");
        if(code === correctCode){
          Audio8bit.playUnlock();
          setTimeout(()=> unlockRoomAndAdvance(4), 300);
        } else {
          Audio8bit.playError();
          shakeSafe();
          setTimeout(()=>{ inputDigits = []; renderSafe(); }, 500);
        }
        return;
      }
      // digit
      if(inputDigits.length < 3){
        Audio8bit.playClick();
        inputDigits.push(num);
        renderSafe();
      }
    });
  });

  renderSafe();
})();

/* ============ HINT SYSTEM ============ */
function showHint(customText){
  hintText.textContent = customText || ROOM_HINTS[State.currentRoom] || "Teruskan mencuba!";
  hintPopup.classList.add("active");
}
btnHint.addEventListener("click", ()=>{
  Audio8bit.ensureCtx();
  Audio8bit.playClick();
  State.hintsUsed++;
  showHint();
});
hintClose.addEventListener("click", ()=>{
  Audio8bit.playClick();
  hintPopup.classList.remove("active");
});

/* ============ SOUND TOGGLE ============ */
btnSound.addEventListener("click", ()=>{
  Audio8bit.ensureCtx();
  State.soundOn = !State.soundOn;
  Audio8bit.setSoundOn(State.soundOn);
  btnSound.textContent = State.soundOn ? "🔊" : "🔇";
  btnSound.classList.toggle("muted", !State.soundOn);
});

/* ============ START GAME ============ */
btnStart.addEventListener("click", ()=>{
  Audio8bit.ensureCtx();
  Audio8bit.playClick();
  Audio8bit.startMusic();
  showScreen(screenGame);
  $("#room-1").classList.add("active");
  State.currentRoom = 1;
  State.keys = 0;
  State.hintsUsed = 0;
  updateHud();
  startGlobalTimer();
});

/* ============ VICTORY ============ */
function spawnConfetti(){
  const layer = $("#confetti-layer");
  layer.innerHTML = "";
  const emojis = ["🎉","✨","🌙","⭐","🏮","🕌","💛","💚"];
  for(let i=0;i<40;i++){
    const span = document.createElement("span");
    span.className = "confetti-piece";
    span.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    span.style.left = Math.random()*100 + "%";
    span.style.animationDuration = (2.5 + Math.random()*2.5) + "s";
    span.style.animationDelay = (Math.random()*1.5) + "s";
    span.style.fontSize = (14 + Math.random()*16) + "px";
    layer.appendChild(span);
  }
}

function computeScore(elapsedMs){
  const elapsedSec = elapsedMs/1000;
  let score = 1000;
  score -= State.hintsUsed * 40;
  score -= Math.floor(elapsedSec) * 1.2;
  score = Math.max(50, Math.round(score));
  return score;
}

function goToVictory(){
  stopGlobalTimer();
  const elapsed = Date.now() - (State.startTime || Date.now());
  const score = computeScore(elapsed);

  $("#stat-keys").textContent = State.keys + "/4";
  $("#stat-time").textContent = formatTime(elapsed);
  $("#stat-hints").textContent = String(State.hintsUsed);
  $("#stat-score").textContent = String(score);

  const badgeEl = $("#rank-badge");
  let badge = "🏆 ESCAPE MASTER";
  if(State.hintsUsed >= 3) badge = "🥉 PENYELAMAT RAMADAN";
  else if(State.hintsUsed >= 1) badge = "🥈 PEJUANG PUASA";
  else badge = "🥇 ESCAPE MASTER SEJATI";
  badgeEl.textContent = badge;

  Audio8bit.playVictory();
  showScreen(screenVictory);
  spawnConfetti();
}

/* ============ RESTART ============ */
$("#btn-restart").addEventListener("click", ()=>{
  Audio8bit.playClick();
  // reset room 1
  document.location.reload();
});

/* ============ INIT ============ */
updateHud();

})();
