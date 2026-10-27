// CFG is loaded from /config.js (built by the server from config/disha_config.json)
const BASIC_END = new Set(["A2","A4","A5","A6","A7","A8","A9","A10","A11","B13","B14","B15"]);
const BASIC_SHOW = ["A2","A4","A5","A6","A7","A8","A9","A10","A11","A12","A1"];
const PRACTICAL_LINE = "Stage A khatam. Ab trainer aapka hard-skill practical lenge. Practical ke baad hum baaki baat karenge.";
const GREETING = {
  text: "नमस्ते! मैं दिशा हूँ, Urban Company की तरफ़ से। ये बातचीत सिर्फ़ स्क्रीनिंग के लिए रिकॉर्ड होगी। क्या हम शुरू करें? आप हिंदी में बात करना चाहेंगी या English में?",
  lang: "hi-IN"
};
const stepById = Object.fromEntries(CFG.steps.map(s => [s.id, s]));
const scenById = Object.fromEntries(CFG.scenarios.map(s => [s.id, s]));
const techById = Object.fromEntries(CFG.tech.map(s => [s.id, s]));

let S;

function fresh(){
  const sc = [...CFG.scenarios].sort(() => Math.random() - .5).slice(0, 3).map(s => s.id).sort();
  const A = CFG.steps.filter(s => s.stage === "A").map(s => s.id);
  const B = CFG.steps.filter(s => s.stage === "B").map(s => s.id);
  const D = CFG.steps.filter(s => s.stage === "D").map(s => s.id);
  const tk = ["K1", ...CFG.tech.filter(t => t.id !== "K1").sort(() => Math.random() - .5).slice(0, 3).map(t => t.id).sort()];
  return { lang: "hi", order: [...A, "PRACTICAL", ...B, ...tk, ...sc, CFG.roleplay.id, ...D], idx: 0, fields: {}, results: {}, probeUsed: false,
           transcript: [], hardSkill: null, ended: false, end: null, busy: false, t0: null, lastSay: "", convinced: {}, lastQid: null, turns: {}, review: [], voice: {} };
}

// ---------- UI helpers ----------
const $ = id => document.getElementById(id);
function addMsg(who, text){ const d = document.createElement("div"); d.className = "msg " + who; d.textContent = text; $("log").appendChild(d); $("log").scrollTop = 1e9; }
function setOrb(mode){ $("orb").className = "orb " + (mode || ""); }
function curId(){ return S.order[S.idx]; }
function stepObj(id){ if (CFG.roleplay && id === CFG.roleplay.id) return { ...CFG.roleplay, type: "scored", scored: true, stage: "R" }; return stepById[id] || (scenById[id] ? { ...scenById[id], block: "Customer centricity", type: "scored", dim: "customer_centricity", stage: "C" } : (techById[id] ? { ...techById[id], block: "Technical knowledge", type: "scored", dim: "technical_knowledge", stage: "K" } : null)); }
function stageOf(id){ if (id === "PRACTICAL") return "P"; const s = stepObj(id); return s ? s.stage : "D"; }
function renderTrack(){
  const stages = [["A","Basic checks"],["P","Practical"],["B","Interview"],["K","Technical"],["C","Scenarios"],["R","Role-play"],["D","Close"]];
  const now = S.ended ? "Z" : stageOf(curId());
  const ord = "APBKCRDZ";
  $("track").innerHTML = stages.map(([k, l], i) => {
    const cls = S.ended || ord.indexOf(k) < ord.indexOf(now) ? "done" : (k === now ? "now" : "");
    return `<span class="${cls}">${i + 1}. ${l}</span>`;
  }).join("");
}
function renderBasic(){
  $("basic").innerHTML = BASIC_SHOW.map(id => {
    const s = stepById[id]; const r = S.results[id];
    let st = r ? r.result : "PENDING";
    if (!r && (id === "A4" || id === "A5") && S.fields.has_kids === false) st = "INFO";
    return `<div class="row"><span class="id">${id}</span><span class="bd">${s.block}${r ? `<q>${esc(r.bucket)}</q>` : ""}</span><span class="chip ${st}">${st === "INFO" && !r ? "N/A" : st}</span></div>`;
  }).join("");
}
function renderAnswers(){
  const ids = Object.keys(S.results);
  if (!ids.length) return;
  $("answers").innerHTML = ids.map(id => { const r = S.results[id];
    const lab = r.scored && r.result !== "SKIPPED" ? (r.correct ? "✓ correct" : "✗ not correct") : r.result;
    const cls = r.scored && r.result !== "SKIPPED" ? (r.correct ? "PASS" : "REJECT") : r.result;
    return `<div class="row"><span class="id">${id}</span><span class="bd">${esc(r.bucket)}${r.quote ? `<q>“${esc(r.quote)}”</q>` : ""}</span><span class="chip ${cls}">${lab}</span></div>`; }).join("");
  $("answers").scrollTop = 1e9;
}
function esc(t){ return String(t ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
function showQuestion(text, id){
  $("question").textContent = text;
  const s = id && id !== "PRACTICAL" ? stepObj(id) : null;
  $("qmeta").textContent = s ? `${id} · ${s.block}` : (id === "PRACTICAL" ? "Practical" : "");
  $("card").classList.toggle("on", id === "A10");
}
function setInputs(on){ $("mic").disabled = !SR || !S || !S.sid || S.ended; $("input").disabled = !on; $("send").disabled = !on; }
setInterval(() => { if (S && S.t0 && !S.ended) { const s = Math.round((Date.now() - S.t0) / 1000); $("timer").textContent = `Elapsed ${Math.floor(s / 60)}m ${s % 60}s`; } }, 1000);

// ---------- Voice ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
if (!SR) $("voiceNote").textContent = "Voice input needs Chrome or Edge. Typing works everywhere.";
function pickVoice(lang){
  const sel = lang.startsWith("hi") ? $("voiceHi") : $("voiceEn");
  const chosen = sel && sel.value ? speechSynthesis.getVoices().find(v => v.name === sel.value) : null;
  if (chosen) return chosen;
  const vs = speechSynthesis.getVoices();
  return vs.find(v => v.lang === lang) || vs.find(v => v.lang.startsWith(lang.slice(0, 2))) || null;
}
function fillVoices(){
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices(); if (!vs.length) return;
  const hi = vs.filter(v => /^hi/i.test(v.lang));
  const en = vs.filter(v => /^en-IN/i.test(v.lang)).concat(vs.filter(v => /^en/i.test(v.lang) && !/^en-IN/i.test(v.lang)));
  const rank = v => (/google|swara|madhur|natural|online/i.test(v.name) ? 0 : 1);
  hi.sort((a, b) => rank(a) - rank(b)); en.sort((a, b) => rank(a) - rank(b));
  const fill = (sel, list) => { const cur = sel.value; sel.innerHTML = list.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${v.lang})</option>`).join("") || '<option value="">None found</option>'; if (cur && list.some(v => v.name === cur)) sel.value = cur; };
  fill($("voiceHi"), hi); fill($("voiceEn"), en);
  if (!hi.length) {
    const msg = "No Hindi voice on this device, so Hindi will sound wrong or be skipped. Use Google Chrome (it has 'Google हिन्दी') or Microsoft Edge (has 'Swara'), or add Hindi speech in Windows Settings › Time & language › Speech.";
    $("voiceHelp").textContent = msg; $("voiceNote").textContent = "No Hindi voice found – open Settings.";
  } else { $("voiceHelp").textContent = "Hindi voice ready: " + hi[0].name; }
}
if ("speechSynthesis" in window) { speechSynthesis.onvoiceschanged = fillVoices; setTimeout(fillVoices, 300); }
function speak(text, lang){
  return new Promise(res => {
    if (!$("tts").checked || !("speechSynthesis" in window)) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; const v = pickVoice(lang); if (v) u.voice = v; u.rate = 0.95;
    u.onend = u.onerror = () => { AM.speaking = false; setOrb(""); res(); };
    AM.speaking = true; setOrb("speaking"); speechSynthesis.speak(u);
  });
}
function recLang(){ return curId() === "A10" ? "en-IN" : (S.lang === "en" ? "en-IN" : "hi-IN"); }
let micGranted = false;
async function ensureMic(){
  if (micGranted) return true;
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true });
    st.getTracks().forEach(t => t.stop()); micGranted = true; initAudioMonitor();
    $("micStatus").textContent = "Microphone ready."; $("micStatus").className = "note ok"; $("voiceNote").textContent = "";
    return true;
  } catch (e) {
    const msg = location.protocol === "file:" ? "Microphone blocked. Serve the file on localhost (see instructions) and allow access."
      : "Microphone blocked. Click the lock icon in Chrome's address bar → allow Microphone, then reload.";
    $("micStatus").textContent = msg; $("micStatus").className = "note"; $("voiceNote").textContent = msg;
    return false;
  }
}
// ---------- Live voice conversation (continuous listening + live captions) ----------
const live = { on: false, active: false, timer: null, final: "", interim: "", started: 0, lastHeard: 0, heard: false, nudges: 0, errors: 0, turnFor: null };
function setLive(state){
  const m = { listening: "🎙 Listening… speak now", speaking: "🔊 Disha is speaking", thinking: "… Disha is thinking", paused: "⏸ Paused – tap the mic to continue", idle: "" };
  if ($("liveState")) $("liveState").textContent = m[state] || "";
}
function endSilenceMs(){ return curId() === "A10" ? 3200 : 1800; }   // reading aloud has longer natural pauses
async function startListening(){
  if (!SR || !S || S.busy || S.ended || !live.on) return;
  const id = curId(); if (!id || id === "PRACTICAL") return;
  if (!(await ensureMic())) { live.on = false; setLive("paused"); return; }
  liveStop();
  if (live.turnFor !== id) { live.nudges = 0; live.errors = 0; }
  live.turnFor = id; live.active = true; live.final = ""; live.interim = "";
  live.started = Date.now(); live.lastHeard = Date.now(); live.heard = false;
  $("capWho").textContent = "Candidate: "; $("interim").textContent = "";
  openRec();
  amBegin(id);
  listening = true; $("mic").classList.add("on"); setOrb("listening"); setLive("listening");
  live.timer = setInterval(liveTick, 200);
}
function openRec(){
  rec = new SR(); rec.lang = recLang(); rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  rec.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) live.final += (live.final ? " " : "") + t.trim(); else interim += t;
    }
    live.interim = interim;
    if ((live.final + interim).trim()) { live.heard = true; live.lastHeard = Date.now(); }
    $("interim").textContent = (live.final + " " + interim).trim();
  };
  rec.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      live.on = false; liveStop(); setLive("paused");
      $("voiceNote").textContent = "Microphone is blocked. Allow it from the lock icon in Chrome's address bar, then reload.";
    } else if (e.error === "network") {
      live.errors++; $("voiceNote").textContent = "Live transcription needs internet (Chrome sends audio to Google). Check the connection.";
    } else if (e.error === "audio-capture") {
      live.errors++; $("voiceNote").textContent = "No microphone found. Plug in the headset and check Windows sound settings.";
    }
  };
  // Chrome ends recognition on its own after silence or ~1 minute – keep the turn going
  rec.onend = () => {
    if (!(live.active && live.on)) return;
    if (live.errors > 5) { live.on = false; liveStop(); setLive("paused"); addMsg("sys", "Listening stopped after repeated errors. Tap the mic to try again."); return; }
    try { openRec(); } catch (_) {}
  };
  try { rec.start(); } catch (_) {}
}
function liveTick(){
  if (!live.active) return;
  const now = Date.now();
  if (live.heard && now - live.lastHeard > endSilenceMs()) { liveFinishTurn(); return; }
  if (!live.heard && now - live.started > 12000) liveNudge();
}
async function liveNudge(){
  live.nudges++;
  liveStop();
  if (live.nudges > 3) { live.on = false; setLive("paused"); addMsg("sys", "No reply for a while – listening paused. Tap the mic to continue."); return; }
  const hi = S.lang !== "en";
  const msg = live.nudges === 1 ? (hi ? "आप आराम से बोलिए, मैं सुन रही हूँ।" : "Take your time, I'm listening.")
            : live.nudges === 2 ? S.lastSay
            : (hi ? "अगर सवाल समझ नहीं आया तो बताइए, मैं आसान शब्दों में पूछती हूँ।" : "If the question isn't clear, just tell me and I'll ask it more simply.");
  setLive("speaking");
  await speak(msg, hi ? "hi-IN" : "en-IN");
  if (live.on) startListening();
}
function liveFinishTurn(){
  const text = (live.final + " " + live.interim).trim();
  liveStop();
  $("capWho").textContent = "Candidate said: ";
  if (text) submit(text); else if (live.on) startListening();
}
function liveStop(){
  live.active = false; if (live.timer) clearInterval(live.timer); live.timer = null;
  if (rec) { try { rec.onend = null; rec.abort(); } catch (_) {} rec = null; }
  if (listening) amEnd();
  listening = false; $("mic").classList.remove("on");
  if (!S || !S.busy) setOrb("");
}
function stopListening(){ liveStop(); }


// ---------- Claude ----------
const SYSTEM = `You are DISHA, Urban Company's screening assistant for women beauty professionals in Bangalore. You talk like a warm, respectful elder sister: natural, patient, never robotic, never like an exam.
You run ONE step of a structured screening at a time. You receive the current step (question, rule, buckets, required_fields), step_state, the candidate's latest message, the conversation so far, profile_so_far (facts she already gave), uc_terms (the ONLY facts you may state about UC), and next_question.

Choose exactly ONE action:
- "clarify": she did not understand, asked what you mean, or her words contradict something she said earlier. Explain simply with a small example (or mention both versions gently and ask which is right), then ask again. Doubts never count against her.
- "answer_question": she asked something about UC, the job, pay, training, leave, etc. Answer ONLY from uc_terms; if not covered say the trainer/team will explain in detail. If she goes off-topic, reply kindly in one line. Then return to the current question.
- "ask_missing": she answered only part of the question. Mention what she already told you and ask ONLY for the missing required fields.
- "probe": the answer is too vague to pick a bucket. Ask one natural follow-up.
- "convince": her answer is an objection or would disqualify her on something UC can address (salon/clients, pedicure, travel, 2-wheeler, weekends, hours, training, models, recharge, start date, moving) AND step_state.can_convince is true AND step_state.convinced is false. Acknowledge her specific concern, give 1–2 relevant facts from uc_terms (never invent numbers or promises), then ask again.
- "confirm": her answer would lead to REJECT or DEFER and step_state.confirmed is false (and convincing is not available or already done). Read back what you understood in her own words and ask her to confirm.
- "complete": you can pick a bucket and all required_fields are known. "say" = a short neutral acknowledgement that may reflect one fact she said (2–8 words, varied; empathetic only for personal hardship) + the next question rephrased naturally. Never praise, never judge her answer, never add your own claims about UC, never use exclamation marks. If profile_so_far already answers the next question, do not ask it blindly – confirm it in one line using her earlier words.
- "close": ONLY if result is REJECT or DEFER on a basic check AND step_state.confirmed is true AND (step_state.convinced is true OR step_state.can_convince is false). "say" = kind closing; never say reject, fail, or selected. For DEFER say when she can apply again and why (daily office training, carrying weighted bags).
- "roleplay" (step R1 only): you are playing an upset customer. Reply IN CHARACTER as the customer to what the partner just said (soften a little if she apologises and offers a fix, stay upset if she argues or blames). Keep it to 1–2 short sentences.
For R1: after customer_turns_so_far reaches max_customer_turns, or once she has clearly apologised, acknowledged and offered a fix, use "complete": step out of character ("Role-play khatam, shukriya.") then the next question. Set "correct" true only if ALL of step.correct_if are met across her replies; if any not_correct_if happened, correct is false and set attitude_flag.
If "forced_action" is present you MUST use that action.

Numbers: say ranges in words ("40 से 50 हज़ार" / "40 to 50 thousand"); never write a hyphen or dash between numbers. Earnings: only quote figures from uc_terms.
A1: also set "nearest_hub" to the closest hub from the provided hubs list based on her area (null if unsure).
Rules: one question at a time; never read out answer options; never reveal a verdict or score; never ask for a medical diagnosis; never repeat the same acknowledgement twice in a row; keep "say" under 60 words.
Scoring: if step.scored is true, set "correct" to true ONLY if her answer clearly meets step.correct_if, otherwise false (partial = false). Judge objectively; never give credit for vague answers. For scenario (C) and technical (K) steps set result "SCORED". Never hint at, list, or name the correct answer or any brand in your questions or probes – ask her to say it.
Attitude: if she sounds arrogant, dismissive, blames customers, or says she needs no training, set "attitude_flag" to a short note; else null.
Fields: always fill required_fields using those exact keys (numbers, true/false, short text). On A0 set language to exactly "hi" or "en" ("en" only if she clearly prefers English). On A3 always set has_kids true/false. On A12 set worked_with_uc true/false.
Language for "say": If language is "hi", write ONLY in Devanagari script (e.g. "आप कहाँ रहती हैं?"). Never write Hindi words in Roman letters. Keep only brand/product names (UC, O3+, Casmara) and very common words like salon, facial, training in English. If "en", simple Indian English.
Respond with ONLY a JSON object, no markdown:
{"action": str, "bucket": str|null, "result": "PASS|FLAG|HOLD|MANUAL|DEFER|REJECT|INFO|SCORED"|null, "fields": {}, "missing": [], "say": str, "evidence_quote": str, "correct": bool|null, "attitude_flag": str|null, "consistency_flag": str|null}`;

let lastApiError = "";
async function callClaude(system, payload){
  lastApiError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system, content: JSON.stringify(payload) }) });
      const data = await r.json();
      if (!r.ok || data.error) { lastApiError = data.error || ("HTTP " + r.status); throw new Error(lastApiError); }
      const clean = String(data.text || "").replace(/```json|```/g, "").trim();
      const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
      try { return JSON.parse(clean.slice(s, e + 1)); }
      catch (pe) { lastApiError = "The AI replied, but not in the expected format"; throw pe; }
    } catch (err) {
      if (!lastApiError) lastApiError = err instanceof TypeError ? "local server not reachable – is 'npm start' running?" : (err.message || String(err));
      if (attempt === 1) throw err;
    }
  }
}
async function phrase(promptText){
  const sys = `You are DISHA, a warm screening assistant. Rephrase the given question naturally for speaking aloud. If language is "hi", write ONLY in Devanagari script (e.g. "आप कहाँ रहती हैं?"). Never write Hindi words in Roman/English letters. Keep only brand or product names (UC, O3+, Casmara) and very common words like salon, facial, training in English. If "en", simple Indian English. Keep the exact meaning, add nothing. Respond with ONLY JSON: {"say": str}`;
  try { const r = await callClaude(sys, { language: S.lang, question: promptText }); return r.say || promptText; } catch (e) { return promptText; }
}

// ---------- Voice signals (review flags only – never scored) ----------
const AM = { stream: null, ctx: null, an: null, buf: null, speaking: false, cur: null, loud: 0, rec: null, chunks: [], clipN: 0 };
async function initAudioMonitor(){
  if (AM.stream) return;
  try {
    AM.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    AM.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = AM.ctx.createMediaStreamSource(AM.stream);
    AM.an = AM.ctx.createAnalyser(); AM.an.fftSize = 1024; src.connect(AM.an);
    AM.buf = new Float32Array(AM.an.fftSize);
    setInterval(amTick, 100);
  } catch (e) { /* mic not available – flags simply won't be produced */ }
}
function amRms(){
  AM.an.getFloatTimeDomainData(AM.buf);
  let s = 0; for (let i = 0; i < AM.buf.length; i++) s += AM.buf[i] * AM.buf[i];
  return Math.sqrt(s / AM.buf.length);
}
function amTick(){
  if (!AM.an || !S || S.ended) return;
  const v = amRms();
  if (AM.cur && v > 0.01) AM.cur.samples.push(v);
  if (AM.speaking && $("detectInt").checked && S.sid) {
    if (v > 0.06) AM.loud++; else AM.loud = Math.max(0, AM.loud - 1);
    if (AM.loud >= 4) {
      AM.loud = -30;
      const id = curId();
      S.review = S.review || [];
      S.review.push({ step: id, type: "interruption", note: "Started speaking while Disha was talking", at: new Date().toLocaleTimeString() });
      addMsg("sys", "Review flag: interruption at " + id);
      if ($("barge") && $("barge").checked && "speechSynthesis" in window) speechSynthesis.cancel();   // let her cut in
    }
  } else if (!AM.speaking) AM.loud = 0;
}
function amBegin(id){
  if (!AM.an) return;
  AM.cur = { id, samples: [] };
  if (/^[RC]/.test(id) && window.MediaRecorder) {
    try { AM.chunks = []; AM.rec = new MediaRecorder(AM.stream); AM.rec.ondataavailable = e => AM.chunks.push(e.data); AM.rec.start(); } catch (e) { AM.rec = null; }
  }
}
function amEnd(){
  if (!AM.cur) return;
  const { id, samples } = AM.cur; AM.cur = null;
  if (samples.length) {
    const sorted = [...samples].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    S.voice = S.voice || {};
    const prev = S.voice[id] || { p90: 0, avg: 0 };
    S.voice[id] = { p90: Math.max(prev.p90, p90), avg: Math.max(prev.avg, avg) };
    if (/^[RC]/.test(id)) {
      const base = Object.entries(S.voice).filter(([k]) => /^[AB]/.test(k)).map(([, x]) => x.p90).sort((a, b) => a - b);
      if (base.length >= 3) {
        const med = base[Math.floor(base.length / 2)];
        if (p90 > 1.8 * med) {
          S.review = S.review || [];
          S.review.push({ step: id, type: "volume", note: `Much louder than her usual voice (${(p90 / med).toFixed(1)}×)`, at: new Date().toLocaleTimeString() });
          addMsg("sys", "Review flag: louder than usual at " + id);
        }
      }
    }
  }
  if (AM.rec && AM.rec.state !== "inactive") {
    const rec = AM.rec; AM.rec = null;
    rec.onstop = () => {
      const blob = new Blob(AM.chunks, { type: "audio/webm" });
      const name = id + "-" + (++AM.clipN);
      fetch(`/api/audio/${encodeURIComponent(S.sid)}/${name}`, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: blob }).catch(() => {});
    };
    rec.stop();
  }
}

// ---------- Undo ----------
const snaps = [];
function snapshot(){
  snaps.push({ S: structuredClone(S), log: $("log").innerHTML, q: $("question").textContent, qid: curId() });
  if (snaps.length > 30) snaps.shift();
  $("undo").disabled = false;
}
function undo(){
  if (!snaps.length || S.busy) return;
  if ("speechSynthesis" in window) speechSynthesis.cancel(); stopListening();
  const s = snaps.pop();
  S = s.S; S.busy = false; S.ended = false;
  $("log").innerHTML = s.log; $("log").style.maxHeight = "";
  $("result").classList.remove("on"); $("result").innerHTML = ""; $("live").style.display = "";
  $("practical").classList.remove("on");
  showQuestion(s.q, s.qid); renderTrack(); renderBasic(); renderAnswers();
  if (!Object.keys(S.results).length) $("answers").innerHTML = '<div class="note">Answers appear here as Disha buckets them.</div>';
  addMsg("sys", "Last answer removed. Answer this question again.");
  setInputs(true); $("undo").disabled = !snaps.length;
  if (live.on) startListening(); else $("input").focus();
}

// ---------- Flow ----------
function nextIdx(from){
  let i = from + 1;
  while (i < S.order.length) {
    const id = S.order[i];
    if ((id === "A4" || id === "A5") && (S.fields.has_kids === false || S.fields.kids_count === 0)) { i++; continue; }
    return i;
  }
  return i;
}
function promptFor(id){
  if (id === "PRACTICAL") return PRACTICAL_LINE;
  const s = stepObj(id); return s ? s.prompt : "";
}
// ---------- Conversation engine ----------
const MAX_TURNS = 6;
const NO_CONVINCE = new Set(["A0","A2","A4","A6","A10","A11","R1"]);
const REQ = { A0:["language"], A1:["area","open_to_movement"], A2:["age"], A3:["marital_status","has_kids"], A4:["youngest_child_age_years"],
  A5:["caregiver_name_relation"], A6:["pregnant"], A7:["own_salon_status"], A8:["does_pedicure"], A9:["willing_to_travel_3_4km","has_2_wheeler","travels_independently"],
  A10:["reading_level"], A11:["spoken_level"], A12:["worked_with_uc"], B1:["physical_issue_mentioned"], B2:["years_experience","salons"], B3:["salon_name","salon_type"],
  B5:["income_sources"], B7:["need_for_money_level"], B8:["accepts_minimum_earnings"], B13:["weekend_ok"], B14:["daily_hours_ok"],
  B15:["training_ok"], B16:["models_count"], B17:["recharge_ok"], B18:["committed_start_date"] };
function empty(v){ return v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || /^(unknown|null|n\/a)$/i.test(String(v)); }
function requiredFor(id){
  let req = [...(REQ[id] || [])]; const f = S.fields;
  if (id === "B5" && /married/i.test(String(f.marital_status || "")) && !/un/i.test(String(f.marital_status || ""))) req.push("husband_working");
  if (id === "A12" && f.worked_with_uc === true) req.push("uc_numbers");
  return req;
}
function missingFor(id){
  const f = S.fields;
  return requiredFor(id).filter(k => {
    if (k === "has_2_wheeler") return empty(f.has_2_wheeler) && empty(f.willing_to_learn_2_wheeler);
    if (k === "does_pedicure") return empty(f.does_pedicure) && empty(f.willing_to_learn_pedicure);
    return empty(f[k]);
  });
}
function termsList(){ return $("terms").value.split("\n").map(t => t.trim()).filter(Boolean); }
function stepState(id){ S.turns = S.turns || {}; return S.turns[id] = S.turns[id] || { n: 0, convinced: false, confirmed: false, probes: 0 }; }

function buildPayload(id, text, extra){
  const s = stepObj(id); const st = stepState(id);
  const nId = S.order[nextIdx(S.idx)];
  return Object.assign({
    language: S.lang,
    step: { id, block: s.block, type: s.type, question: s.prompt, probe_hint: s.probe, rule: s.rule, buckets: s.buckets, scored: !!(s.scored || /^[CKR]/.test(id)), correct_if: s.correct_if || null, partial_answer: s.partial || null, wrong_answer: s.wrong || null,
            required_fields: requiredFor(id), still_missing: missingFor(id) },
    step_state: { turns_on_step: st.n, max_turns: MAX_TURNS, can_convince: !NO_CONVINCE.has(id), convinced: st.convinced, confirmed: st.confirmed, probes_used: st.probes },
    candidate_message: text,
    profile_so_far: S.fields,
    uc_terms: termsList(),
    hubs: id === "A1" ? $("hubs").value.split("\n").map(x => x.trim()).filter(Boolean) : undefined,
    next_question: nId ? promptFor(nId) : "Dhanyavaad! Hamari team aapko agla step batayegi.",
    next_question_if_no_kids: id === "A3" ? promptFor("A6") : undefined,
    reading_card: id === "A10" ? $("card").innerText : undefined,
    roleplay: id === "R1" ? { you_play: "an upset customer", opening_line: s.opening, customer_turns_so_far: st.n, max_customer_turns: s.max_turns, not_correct_if: s.not_correct_if } : undefined,
    conversation: S.transcript.slice(-40)
  }, extra || {});
}
async function ask(id, text, extra){
  try { return await callClaude(SYSTEM, buildPayload(id, text, extra)); }
  catch (e) {
    const hint = " Check the terminal running the server and the API key in .env (Settings → Test connection explains more).";
    addMsg("sys", "Could not reach the AI" + (lastApiError ? ": " + lastApiError : "") + "." + hint + " Then send the answer again.");
    return null;
  }
}
function record(id, r){
  const s = stepObj(id); const st = stepState(id);
  let bucket = r.bucket || "—", result = r.result || "INFO";
  if (st.convinced && result !== "REJECT" && result !== "DEFER") { bucket += " (agreed after convincing)"; if (result === "PASS") result = "FLAG"; }
  const scored = !!(s.scored || /^[CKR]/.test(id));
  S.results[id] = { bucket, result, quote: r.evidence_quote, correct: scored ? r.correct === true : null, scored, attitude: r.attitude_flag || null, flag: r.consistency_flag, turns: st.n };
  if (r.attitude_flag) addMsg("sys", "Attitude note: " + r.attitude_flag);
  renderBasic(); renderAnswers();
}
async function moveOn(line){
  S.idx = nextIdx(S.idx);
  const newId = curId();
  S.busy = false;
  if (newId === "PRACTICAL") { await say(line, "PRACTICAL"); $("practical").classList.add("on"); setInputs(false); renderTrack(); return; }
  if (!newId) { await say(line, null); finish("complete"); return; }
  if (newId === "D2") { await say(line, newId); finish("complete"); return; }
  await say(line, newId);
}
async function submit(text){
  if (S.busy || S.ended) return;
  const id = curId(); if (id === "PRACTICAL") return;
  snapshot();
  S.busy = true; setInputs(false); setOrb("thinking"); setLive("thinking");
  addMsg("me", text); S.transcript.push({ who: "candidate", step: id, text });
  const st = stepState(id); st.n++;
  const canConvince = !NO_CONVINCE.has(id);

  let r = await ask(id, text);
  if (!r) {
    S.busy = false; setInputs(true); setOrb("");
    if (live.on) {
      const hi = S.lang !== "en";
      setLive("speaking");
      await speak(hi ? "माफ़ कीजिए, नेटवर्क में थोड़ी दिक्कत है। क्या आप अपना जवाब दोबारा बोल सकती हैं?" : "Sorry, there was a network problem. Could you please say that again?", hi ? "hi-IN" : "en-IN");
      startListening();
    }
    return;
  }
  Object.assign(S.fields, r.fields || {});
  if (id === "A0" && S.fields.language) setLang(String(S.fields.language).toLowerCase().startsWith("en") ? "en" : "hi");
  if (r.consistency_flag) addMsg("sys", "Consistency note: " + r.consistency_flag);

  const negative = r.result === "REJECT" || r.result === "DEFER";
  const basic = BASIC_END.has(id);

  // Guardrails: never close or complete on a disqualifying answer without convincing and confirming first
  if ((r.action === "close" || (r.action === "complete" && negative && basic))) {
    let force = null;
    if (canConvince && !st.convinced && r.result === "REJECT") force = "convince";
    else if (!st.confirmed) force = "confirm";
    if (force && st.n < MAX_TURNS) {
      const r2 = await ask(id, text, { forced_action: force, would_be_result: r.result, would_be_bucket: r.bucket });
      if (r2) r = r2; else r.action = force;
      r.action = force;
    } else if (!basic) { r.action = "complete"; }
    else if (force) {
      record(id, { bucket: "Possible disqualifier, not confirmed – needs manual review", result: "HOLD", evidence_quote: r.evidence_quote });
      addMsg("sys", id + ": not confirmed after " + st.n + " tries; marked for review instead of closing.");
      const nId = S.order[nextIdx(S.idx)];
      await moveOn(nId ? await phrase(promptFor(nId)) : ""); return;
    }
    else { r.action = "close"; }
  }
  // Guardrail: don't complete with required parts missing
  if (r.action === "complete" && !negative) {
    const miss = missingFor(id);
    if (miss.length && st.n < MAX_TURNS && !/^[CKR]/.test(id)) {
      const r2 = await ask(id, text, { forced_action: "ask_missing", missing_fields: miss });
      if (r2) { r = r2; r.action = "ask_missing"; Object.assign(S.fields, r.fields || {}); }
    }
  }

  // Stay on the same question
  if (id === "R1" && r.action === "roleplay" && st.n >= (stepObj(id).max_turns || 3)) {
    const r2 = await ask(id, text, { forced_action: "complete" });
    if (r2) { r = r2; r.action = "complete"; }
  }
  if (/^[RC]/.test(id) && text.trim().split(/\s+/).length <= 2) {
    (S.review = S.review || []).push({ step: id, type: "short_reply", note: "Very short reply to an emotional prompt: “" + text + "”", at: new Date().toLocaleTimeString() });
  }
  if (["clarify", "answer_question", "ask_missing", "probe", "convince", "confirm", "roleplay"].includes(r.action)) {
    if (r.action === "convince") { st.convinced = true; addMsg("sys", "Disha is addressing her concern."); }
    if (r.action === "confirm") st.confirmed = true;
    if (r.action === "probe") st.probes++;
    if (st.n >= MAX_TURNS) {
      const pending = r.result === "REJECT" || r.result === "DEFER";
      record(id, { bucket: pending ? "Unclear after several tries – needs manual review" : (r.bucket || "Unclear after several tries"),
                   result: pending ? "HOLD" : "FLAG", evidence_quote: r.evidence_quote, scenario_points: null });
      addMsg("sys", id + ": moved on after " + st.n + " tries; marked for review.");
      const nId = S.order[nextIdx(S.idx)];
      const line = nId ? await phrase(promptFor(nId)) : "";
      await moveOn(line); return;
    }
    S.busy = false; await say(r.say, id); return;
  }

  // Close (confirmed disqualifier)
  if (r.action === "close" && basic) {
    record(id, r); S.busy = false; await say(r.say, id); finish(r.result === "DEFER" ? "defer" : "reject", id); return;
  }

  // Complete → next question
  record(id, r);
  await moveOn(r.say);
}

function fixSpeech(t){
  return String(t || "").replace(/(\d[\d,.]*)\s*[-–—]\s*(₹?\s*\d)/g, (m, a, b) => a + (S.lang === "en" ? " to " : " से ") + b);
}
async function say(text, id){
  text = fixSpeech(text);
  S.lastSay = text; showQuestion(text, id); addMsg("bot", text); renderTrack();
  S.transcript.push({ who: "disha", step: id, text });
  saveSession(true);
  setInputs(id !== "PRACTICAL" && !S.ended);
  liveStop(); setLive("speaking");
  await speak(text, S.lang === "en" ? "en-IN" : "hi-IN");
  setOrb("");
  if (id === "PRACTICAL" || S.ended) { setLive("idle"); return; }
  if (live.on && id) startListening(); else if (!live.on) setLive("paused");
}

// ---------- Scoring ----------
function finish(kind, atId){
  S.ended = true; S.end = { kind, atId }; setInputs(false); setOrb(""); renderTrack();
  const all = Object.entries(S.results);
  const asked = all.filter(([, r]) => r.scored && r.result !== "SKIPPED");
  const isOk = r => r.correct === true;
  const part = test => { const a = asked.filter(([id]) => test(id)); return [a.filter(([, r]) => isOk(r)).length, a.length]; };
  const soft = part(id => !/^[CKR]/.test(id)), tech = part(id => /^K/.test(id)), scen = part(id => /^C/.test(id)), tone = part(id => /^R/.test(id));
  const X = asked.filter(([, r]) => isOk(r)).length, N = asked.length;
  const skipped = all.filter(([, r]) => r.result === "SKIPPED").map(([id]) => id);
  const skippedBasic = skipped.filter(id => BASIC_END.has(id) || id === "A12" || id === "A1");
  const attitude = all.filter(([, r]) => r.attitude).map(([id, r]) => `${id}: ${r.attitude}${r.quote ? ` – “${r.quote}”` : ""}`);
  let band, color, why = "";
  if (kind === "ended") { band = "Incomplete (ended at " + atId + ")"; color = "var(--muted)"; }
  else if (kind === "reject") { band = "Not eligible (basic check " + atId + ")"; color = "var(--reject)"; }
  else if (kind === "defer") { band = "Deferred (" + atId + ")"; color = "var(--defer)"; }
  else {
    const full = N >= 17;
    const pass = N && X / N >= 0.75;
    const review = N && X / N >= 0.5;
    if (pass) { band = "Auto-pass"; color = "var(--pass)"; }
    else if (review) { band = "Manual review"; color = "var(--flag)"; }
    else { band = "Reject"; color = "var(--reject)"; }
    if (band === "Auto-pass" && (attitude.length || skippedBasic.length)) {
      band = "Manual review"; color = "var(--flag)";
      why = attitude.length ? "Attitude flag raised" : "Basic check skipped";
    }
    if (!full) why = (why ? why + " · " : "") + `Only ${N} of 17 scored questions asked – thresholds applied as 75% / 50%`;
  }
  const type = String(S.fields.salon_type || "").toUpperCase().replace(/[^ABC]/g, "").slice(0, 1);
  let routing = "—";
  if (kind === "complete" && band !== "Reject") {
    if (S.hardSkill === "fresher") routing = "NE / fresher batch";
    else if (S.hardSkill === "good" && (type === "A" || type === "B")) routing = "Prime Regular (PR)";
    else routing = "Prime Intensive (PI)";
  }
  const wrong = asked.filter(([, r]) => !isOk(r)).map(([id, r]) => `${id} – ${stepObj(id).block}: ${r.bucket}`);
  const manual = ["Weight (scale)", "Grooming checklist"];
  for (const [id, r] of all) if (r.result === "MANUAL") manual.push(`${id}: ${r.bucket}`);
  const holds = all.filter(([, r]) => r.result === "HOLD").map(([id, r]) => `${id}: ${r.bucket}`);
  const verbatim = {};
  for (const t of S.transcript) if (t.who === "candidate") (verbatim[t.step] = verbatim[t.step] || []).push(t.text);
  const secs = S.t0 ? Math.round((Date.now() - S.t0) / 1000) : 0;
  const report = { candidate: S.label, outcome: kind, stopped_at: atId || null, result: band, note: why,
    score: `${X} / ${N}`, soft_skill: `${soft[0]} / ${soft[1]}`, technical: `${tech[0]} / ${tech[1]}`, customer_scenarios: `${scen[0]} / ${scen[1]}`, tone_roleplay: `${tone[0]} / ${tone[1]}`, review_flags: S.review || [], voice_levels: S.voice || {},
    hard_skill: S.hardSkill, salon_type: type || null, nearest_hub: S.fields.nearest_hub || null, routing,
    wrong_answers: wrong, attitude_flags: attitude, manual_checks_pending: manual, holds, skipped_questions: skipped,
    profile: S.fields, results: S.results, verbatim_answers: verbatim, duration_seconds: secs, transcript: S.transcript };
  $("live").style.display = "none"; $("log").style.maxHeight = "160px";
  $("result").classList.add("on");
  const rowS = (l, p) => `<div class="dim"><div class="lab"><span>${l}</span><span>${p[0]} / ${p[1]}</span></div><div class="bar"><i style="width:${p[1] ? Math.round(100 * p[0] / p[1]) : 0}%"></i></div></div>`;
  $("result").innerHTML = `
    <div class="band" style="color:${color}">${esc(band)}</div>
    <div class="score" style="font-size:22px;color:var(--plum);margin-top:6px">Answered <b>${X} / ${N}</b> correctly</div>
    <div class="note">${esc(why)}</div>
    <div class="score" style="margin-top:6px">Duration ${Math.floor(secs / 60)}m ${secs % 60}s · Hub: ${esc(S.fields.nearest_hub || "—")} · Salon type: ${esc(type || "—")} · Routing: ${esc(routing)}</div>
    ${rowS("Soft-skill questions", soft)}${rowS("Technical knowledge", tech)}${rowS("Customer scenarios", scen)}${rowS("Tone & sensitivity (role-play)", tone)}
    ${(S.review || []).length ? `<h3 style="margin-top:12px">Review these moments (not scored)</h3><div>${S.review.map(f => esc(`${f.step} · ${f.at} – ${f.note}`)).join("<br>")}</div><div class="note">Role-play and scenario audio clips are saved in data/audio/${esc(S.sid || "")}.</div>` : ""}
    <h3 style="margin-top:16px">Not correct</h3><div>${wrong.length ? wrong.map(esc).join("<br>") : "None"}</div>
    ${attitude.length ? `<h3 style="margin-top:12px;color:var(--reject)">Attitude flags</h3><div>${attitude.map(esc).join("<br>")}</div>` : ""}
    <h3 style="margin-top:12px">Manual checks pending</h3><div>${manual.map(esc).join("<br>")}</div>
    ${holds.length ? `<h3 style="margin-top:12px">On hold</h3><div>${holds.map(esc).join("<br>")}</div>` : ""}
    ${skipped.length ? `<h3 style="margin-top:12px">Skipped (pilot)</h3><div>${skipped.join(", ")}</div>` : ""}
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><button class="btn" id="dl">Download report (JSON)</button><button class="btn ghost" id="undo2">↺ Correct last answer</button>${kind === "ended" ? '<button class="btn" id="resumeHere">Resume this interview</button>' : ""}<button class="btn ghost" id="again">Screen next candidate</button></div>
    <p class="note">Prototype only. Use role-play candidates, not real candidate data.</p>`;
  if (!$("sheetNote")) { const d = document.createElement("div"); d.id = "sheetNote"; d.className = "note"; $("result").insertBefore(d, $("result").children[2] || null); }
  $("sheetNote").textContent = "Saving report…";
  fetch("/api/reports/" + encodeURIComponent(S.sid || "candidate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) })
    .then(r => r.json())
    .then(d => {
      const sh = d.sheet || {};
      $("sheetNote").textContent = sh.ok ? "✓ Saved to Google Sheet and to data/reports" : (sh.skipped ? "✓ Saved to data/reports (Google Sheet not connected)" : "⚠ Saved to data/reports, but Google Sheet failed: " + sh.error);
      $("sheetNote").className = "note" + (sh.ok ? " ok" : "");
    })
    .catch(() => { $("sheetNote").textContent = "⚠ Could not save the report – download it with the button below."; });
  $("dl").onclick = () => { const b = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "disha_report_" + (S.label || "candidate") + ".json"; a.click(); };
  $("again").onclick = reset;
  $("undo2").onclick = undo;
  if ($("resumeHere")) $("resumeHere").onclick = () => { if (endedSnapshot) loadSession(endedSnapshot); };
  $("actions").style.display = "none";
  if (kind !== "ended") deleteSession(S.sid);
  $("undo").disabled = !snaps.length;
}

function setLang(l){
  S.lang = l;
  $("langHi").className = "mini" + (l === "hi" ? "" : " ghost");
  $("langEn").className = "mini" + (l === "en" ? "" : " ghost");
}
// ---------- Save / resume / skip / end (stored on the local server in ./data) ----------
let endedSnapshot = null;
function sessionData(){
  const copy = structuredClone(S); copy.busy = false; copy.ended = false;
  copy.elapsed = S.t0 ? Date.now() - S.t0 : 0;
  return { kind: "disha-session", v: 2, savedAt: new Date().toISOString(), S: copy, log: $("log").innerHTML, q: $("question").textContent, qid: curId() };
}
async function saveSession(quiet){
  if (!S || !S.sid || S.ended) return null;
  const data = sessionData();
  try {
    await fetch("/api/sessions/" + encodeURIComponent(S.sid), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!quiet) $("saveNote").textContent = "Saved.";
  } catch (e) { if (!quiet) $("saveNote").textContent = "Could not save – is the server running?"; }
  return data;
}
async function deleteSession(sid){
  if (sid) { try { await fetch("/api/sessions/" + encodeURIComponent(sid), { method: "DELETE" }); } catch (e) {} }
  renderSessions();
}
async function renderSessions(){
  const box = $("sessions");
  try {
    const items = await (await fetch("/api/sessions")).json();
    if (!items.length) { box.innerHTML = '<div class="note">No saved interviews.</div>'; return; }
    box.innerHTML = items.map((it, i) => `<div class="sess"><span class="bd"><b>${esc(it.label || "Candidate")}</b><br><span class="note">At ${esc(it.qid || "—")} · ${new Date(it.savedAt).toLocaleString()}</span></span>
      <button class="mini" data-res="${i}">Resume</button><button class="mini ghost" data-del="${i}">Delete</button></div>`).join("");
    box.querySelectorAll("[data-res]").forEach(b => b.onclick = async () => {
      const d = await (await fetch("/api/sessions/" + encodeURIComponent(items[+b.dataset.res].sid))).json(); loadSession(d); });
    box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (confirm("Delete this saved interview?")) deleteSession(items[+b.dataset.del].sid); });
  } catch (e) { box.innerHTML = '<div class="note">Server not reachable – start it with "npm start".</div>'; }
}
async function loadSession(data){
  if (!data || data.kind !== "disha-session") return;
  if ("speechSynthesis" in window) speechSynthesis.cancel(); stopListening();
  S = structuredClone(data.S); S.busy = false; S.ended = false; S.t0 = Date.now() - (S.elapsed || 0); setLang(S.lang || "hi");
  snaps.length = 0; $("undo").disabled = true;
  $("log").innerHTML = data.log; $("log").style.maxHeight = "";
  $("result").classList.remove("on"); $("result").innerHTML = ""; $("live").style.display = "";
  $("start").style.display = "none"; $("cand").style.display = "none"; $("actions").style.display = "flex";
  renderTrack(); renderBasic(); renderAnswers();
  addMsg("sys", "Interview resumed for " + (S.label || "candidate") + ".");
  if (curId() === "PRACTICAL") { showQuestion(data.q, "PRACTICAL"); $("practical").classList.add("on"); setInputs(false); return; }
  $("practical").classList.remove("on");
  await say(data.q || S.lastSay || promptFor(curId()), curId());
}
async function pauseInterview(){
  if (!S.sid || S.ended || S.busy) return;
  live.on = false;
  if ("speechSynthesis" in window) speechSynthesis.cancel(); stopListening();
  await saveSession(false);
  const lab = S.label;
  reset();
  addMsg("sys", `Interview for ${lab} paused and saved. Resume it from 'Saved interviews' on the right.`);
}
async function endInterview(){
  if (!S.sid || S.ended || S.busy) return;
  if (!confirm("End this interview now? You can still resume it later from Saved interviews.")) return;
  if ("speechSynthesis" in window) speechSynthesis.cancel(); stopListening();
  endedSnapshot = await saveSession(true) || sessionData();
  finish("ended", curId());
  renderSessions();
}
async function skipQuestion(){
  if (S.busy || S.ended || !S.sid) return;
  const id = curId(); if (!id || id === "PRACTICAL" || id === "A0") return;
  if ("speechSynthesis" in window) speechSynthesis.cancel(); stopListening();
  snapshot();
  S.results[id] = { bucket: "Skipped (pilot)", result: "SKIPPED", quote: "", correct: null, scored: !!(stepObj(id).scored || /^[CKR]/.test(id)), flag: null };
  S.probeUsed = false; addMsg("sys", id + " skipped."); renderBasic(); renderAnswers();
  S.idx = nextIdx(S.idx); const nId = curId();
  if (nId === "PRACTICAL") { await say(await phrase(PRACTICAL_LINE), "PRACTICAL"); $("practical").classList.add("on"); setInputs(false); renderTrack(); return; }
  if (!nId || nId === "D2") { if (nId) await say(await phrase(promptFor(nId)), nId); finish("complete"); return; }
  setOrb("thinking"); setInputs(false);
  await say(await phrase(promptFor(nId)), nId);
}

// ---------- Wiring ----------
function reset(){
  live.on = false; if (typeof liveStop === "function" && S) liveStop(); setLive("idle");
  if ("speechSynthesis" in window) speechSynthesis.cancel(); stopListening();
  S = fresh(); snaps.length = 0; $("undo").disabled = true; $("log").innerHTML = ""; $("log").style.maxHeight = ""; $("result").classList.remove("on"); $("result").innerHTML = "";
  $("live").style.display = ""; $("practical").classList.remove("on"); $("start").style.display = ""; $("timer").textContent = "";
  $("answers").innerHTML = '<div class="note">Answers appear here as Disha buckets them.</div>';
  showQuestion("Namaste! Main Disha hoon.", null); $("qmeta").textContent = "Press start when the candidate is seated";
  setInputs(false); renderTrack(); renderBasic();
  setLang("hi");
  $("cand").style.display = ""; $("actions").style.display = "none"; $("saveNote").textContent = "";
  renderSessions();
}
$("start").onclick = async () => {
  const lab = ($("cand").value.trim() || "Candidate").slice(0, 40);
  S.label = lab; S.sid = (lab.replace(/[^A-Za-z0-9_-]/g, "") || "cand") + "-" + Date.now();
  $("start").style.display = "none"; $("cand").style.display = "none"; $("actions").style.display = "flex";
  S.t0 = Date.now(); S.idx = 0;
  live.on = !!SR && await ensureMic();
  if (!live.on) { $("typeMode").checked = true; $("typeBox").style.display = "flex"; addMsg("sys", "Microphone not available – using typing for now."); }
  setInputs(true);
  await say(GREETING.text, "A0");
};
$("skip").onclick = skipQuestion;
$("langHi").onclick = () => setLang("hi");
$("langEn").onclick = () => setLang("en");
$("voiceTest").onclick = () => { const was = $("tts").checked; $("tts").checked = true; speak("नमस्ते! मैं दिशा हूँ। आप कहाँ रहती हैं?", "hi-IN").then(() => { $("tts").checked = was; }); };
$("pause").onclick = pauseInterview;
$("endNow").onclick = endInterview;
if ($("loadFile")) $("loadFile").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try { loadSession(JSON.parse(rd.result)); } catch (err) { alert("That file is not a DISHA session."); } };
  rd.readAsText(f); e.target.value = "";
};
$("mic").onclick = () => {
  if (live.on) { live.on = false; liveStop(); setLive("paused"); }
  else { live.on = true; live.nudges = 0; if (!S.busy) startListening(); }
};
$("typeMode").onchange = () => { $("typeBox").style.display = $("typeMode").checked ? "flex" : "none"; };
$("send").onclick = () => { const t = $("input").value.trim(); if (t) { $("input").value = ""; liveStop(); submit(t); } };
$("input").addEventListener("keydown", e => { if (e.key === "Enter") $("send").click(); });
$("restart").onclick = reset;
$("undo").onclick = undo;
$("settingsBtn").onclick = () => $("settings").classList.toggle("on");
$("micTest").onclick = ensureMic;
if ($("sheetTest")) $("sheetTest").onclick = async () => {
  $("sheetStatus").textContent = "Testing…"; $("sheetStatus").className = "note";
  try {
    const d = await (await fetch("/api/sheets/test")).json();
    $("sheetStatus").textContent = d.ok ? "Connected to Google Sheet “" + (d.sheet || "") + "”." : (d.error || "Failed");
    $("sheetStatus").className = "note" + (d.ok ? " ok" : "");
  } catch (e) { $("sheetStatus").textContent = "Server not reachable."; }
};
$("connTest").onclick = async () => {
  $("connStatus").textContent = "Testing…"; $("connStatus").className = "note";
  let h = {};
  try {
    h = await (await fetch("/api/health")).json();
    if (!h.keySet) { $("connStatus").textContent = `Server is running, but ${h.keyName} is missing in .env.`; return; }
    const r = await callClaude('Respond with ONLY JSON: {"ok": true}', { ping: 1 });
    $("connStatus").textContent = r && r.ok ? `Connected to ${h.provider} (${h.model}).` : "Connected, unexpected reply.";
    $("connStatus").className = "note ok";
  } catch (e) {
    let msg = "Failed: " + (lastApiError || e.message);
    if (h.provider === "gemini" && /not found|not supported|404/i.test(msg)) {
      try { const m = await (await fetch("/api/models")).json();
            if (m.models && m.models.length) msg += " · Models your key can use: " + m.models.filter(x => /flash|pro/.test(x)).slice(0, 12).join(", ") + ". Put one in GEMINI_MODEL in .env and restart."; } catch (_) {}
    }
    $("connStatus").textContent = msg;
  }
};
$("terms").value = (CFG.terms || []).join("\n");
$("hubs").value = (CFG.hubs || []).join("\n");
document.querySelectorAll("[data-hs]").forEach(b => b.onclick = async () => {
  S.hardSkill = b.dataset.hs; $("practical").classList.remove("on");
  addMsg("sys", "Trainer marked hard skills: " + b.textContent);
  S.idx = nextIdx(S.idx); const id = curId();
  setOrb("thinking"); const line = await phrase(promptFor(id)); await say(line, id);
});
reset();
