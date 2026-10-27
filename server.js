// DISHA – UC soft-skill screening bot (pilot)
// Local server: serves the tablet UI, keeps the Anthropic API key on the server,
// and stores sessions, reports and role-play audio clips in ./data
const express = require("express");
const fs = require("fs");
const path = require("path");

// ---------- Load .env from THIS folder (works with UTF-8, UTF-8 BOM and UTF-16 files) ----------
const ENV_PATH = path.join(__dirname, ".env");
const envReport = [];
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    envReport.push(`.env NOT found in ${__dirname}`);
    for (const alt of [".env.txt", "env", "env.txt", ".env.example.txt"]) {
      if (fs.existsSync(path.join(__dirname, alt))) envReport.push(`Found "${alt}" – rename it to exactly ".env"`);
    }
    return;
  }
  const buf = fs.readFileSync(ENV_PATH);
  let text;
  if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.slice(2).toString("utf16le");
  else if (buf[0] === 0xfe && buf[1] === 0xff) text = Buffer.from(buf.slice(2)).swap16().toString("utf16le");
  else text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const found = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[k]) process.env[k] = v;
    found.push(k + (v ? "" : " (empty)"));
  }
  envReport.push(`.env found in ${__dirname} → keys: ${found.join(", ") || "none"}`);
  if (/PASTE_YOUR|your-gemini-key|your-key-here/i.test(process.env.GEMINI_API_KEY || "")) envReport.push("GEMINI_API_KEY is still the placeholder – paste your real key");
}
loadEnv();

const PORT = process.env.PORT || 3000;
// Provider: "gemini" or "anthropic". Defaults to Gemini when a GEMINI_API_KEY is present.
const PROVIDER = (process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY ? "anthropic" : "gemini")).toLowerCase();
const API_KEY = PROVIDER === "gemini" ? (process.env.GEMINI_API_KEY || "") : (process.env.ANTHROPIC_API_KEY || "");
const MODEL = PROVIDER === "gemini" ? (process.env.GEMINI_MODEL || "gemini-flash-latest") : (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6");
const KEY_NAME = PROVIDER === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
// Find files even if folders were flattened when uploading to GitHub
const firstExisting = list => list.find(p => fs.existsSync(p)) || list[0];
const CONFIG_PATH = firstExisting([path.join(__dirname, "config", "disha_config.json"), path.join(__dirname, "disha_config.json")]);
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, "public", "index.html")) ? path.join(__dirname, "public")
                 : (fs.existsSync(path.join(__dirname, "index.html")) ? __dirname : null);
const DATA = path.join(__dirname, "data");
for (const d of ["sessions", "reports", "audio"]) fs.mkdirSync(path.join(DATA, d), { recursive: true });

const app = express();
app.set("trust proxy", 1);                 // needed behind Render / Cloud Run / tunnels for https detection
app.use(express.json({ limit: "5mb" }));

// ---------- Access PIN (set ACCESS_PIN to protect the site when it is online) ----------
const crypto = require("crypto");
const ACCESS_PIN = process.env.ACCESS_PIN || "";
const SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update("disha:" + ACCESS_PIN + ":" + (process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || "")).digest("hex");
const token = () => crypto.createHmac("sha256", SECRET).update("ok:" + ACCESS_PIN).digest("hex");
const cookieOf = req => Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split("=")).filter(p => p[0]));
const fails = new Map();
const LOGIN_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DISHA – sign in</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#E7F0E8;font-family:system-ui,sans-serif;color:#241A26}
form{background:#FBFCFA;border:1px solid #D9E2DA;border-radius:18px;padding:28px;width:min(340px,90vw)}h1{margin:0 0 4px;color:#2B1630;font-size:28px}
p{color:#6A5F6C;margin:0 0 18px}input{width:100%;box-sizing:border-box;font-size:22px;padding:12px;border:1px solid #D9E2DA;border-radius:10px;letter-spacing:4px}
button{margin-top:14px;width:100%;padding:12px;border:none;border-radius:10px;background:#2B1630;color:#fff;font-size:17px;font-weight:600;cursor:pointer}
.err{color:#B23A48;margin-top:10px;min-height:20px}</style></head><body>
<form id="f"><h1>DISHA</h1><p>Enter the screening PIN</p><input id="pin" type="password" inputmode="numeric" autocomplete="off" autofocus><button>Continue</button><div class="err" id="e"></div></form>
<script>document.getElementById("f").onsubmit=async e=>{e.preventDefault();const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin:document.getElementById("pin").value})});
if(r.ok)location.href="/";else document.getElementById("e").textContent=(await r.json()).error||"Wrong PIN";};</script></body></html>`;
app.get("/login", (req, res) => res.type("html").send(LOGIN_HTML));
app.post("/api/login", (req, res) => {
  if (!ACCESS_PIN) return res.json({ ok: true });
  const ip = req.ip, f = fails.get(ip) || { n: 0, t: 0 };
  if (f.n >= 5 && Date.now() - f.t < 10 * 60 * 1000) return res.status(429).json({ error: "Too many attempts – wait 10 minutes" });
  if (String((req.body || {}).pin || "") !== ACCESS_PIN) { fails.set(ip, { n: f.n + 1, t: Date.now() }); return res.status(401).json({ error: "Wrong PIN" }); }
  fails.delete(ip);
  res.setHeader("Set-Cookie", `disha_auth=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${req.secure ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.use((req, res, next) => {
  if (!ACCESS_PIN) return next();
  if (cookieOf(req).disha_auth === token()) return next();
  if (req.path.startsWith("/api/") || req.path === "/config.js") return res.status(401).json({ error: "Not signed in – reload the page and enter the PIN" });
  res.redirect("/login");
});
if (PUBLIC_DIR === path.join(__dirname, "public")) app.use(express.static(PUBLIC_DIR));
else if (PUBLIC_DIR) {   // screen files sit next to server.js – serve only those three
  for (const f of ["index.html", "app.js", "styles.css"]) app.get("/" + (f === "index.html" ? "" : f), (req, res) => res.sendFile(path.join(PUBLIC_DIR, f)));
}
app.get("/", (req, res) => res.status(500).type("html").send("<h2>DISHA screen files are missing</h2><p>Upload the <b>public</b> folder (index.html, app.js, styles.css) to GitHub, next to server.js.</p>"));

const safe = s => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);

// ---------- Config → compact CFG for the browser ----------
function buildCfg() {
  const c = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  const steps = c.steps.map(s => ({
    id: s.id, stage: s.stage, block: s.block, type: s.type, prompt: s.prompt_hinglish, probe: s.probe,
    captures: s.captures, rule: s.rule, scored: !!s.scored, correct_if: s.correct_if || null,
    buckets: (s.buckets || []).map(b => ({ b: b.bucket, ex: b.examples, out: b.outcome, r: b.result }))
  }));
  const scenarios = c.scenario_bank.map(s => ({ id: s.id, prompt: s.prompt_hinglish, probe: s.probe, correct_if: s.correct_if }));
  const tech = c.technical_bank.items.map(t => ({ id: t.id, prompt: t.prompt_hinglish, probe: t.probe, correct_if: t.correct_if, partial: t.partial, wrong: t.wrong }));
  const rp = c.roleplay;
  const roleplay = { id: rp.id, block: rp.block, prompt: rp.setup_hinglish + " " + rp.opening_line_hinglish,
    opening: rp.opening_line_hinglish, max_turns: rp.max_customer_turns,
    correct_if: "ALL of: " + rp.correct_if.join("; "), not_correct_if: rp.not_correct_if };
  return { steps, scenarios, tech, roleplay, terms: c.uc_terms || [], hubs: c.hubs || [] };
}
app.get("/config.js", (req, res) => {
  try { res.type("application/javascript").send("const CFG = " + JSON.stringify(buildCfg()) + ";"); }
  catch (e) { res.status(500).type("application/javascript").send(`alert("Config error: ${String(e.message).replace(/"/g, "'")}");`); }
});

// ---------- AI proxy (Gemini or Claude) ----------
app.get("/api/health", (req, res) => res.json({ ok: true, provider: PROVIDER, keySet: !!API_KEY, keyName: KEY_NAME, model: MODEL }));

// Busy / rate-limit errors from Google are retried, then a backup model is tried.
const GEMINI_FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-flash-lite-latest")
  .split(",").map(x => x.trim()).filter(x => x && x !== MODEL);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function geminiOnce(model, system, content) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: content }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: "application/json" }
    })
  });
  const data = await r.json();
  if (data.error) { const e = new Error(data.error.message || data.error.status); e.status = r.status || data.error.code; throw e; }
  const cand = (data.candidates || [])[0];
  if (!cand) { const e = new Error("Gemini returned no answer" + (data.promptFeedback ? " (blocked: " + data.promptFeedback.blockReason + ")" : "")); e.status = 502; throw e; }
  const text = ((cand.content && cand.content.parts) || []).filter(p => p.text && !p.thought).map(p => p.text).join("");
  if (!text) { const e = new Error("Gemini answer was empty (finish reason: " + cand.finishReason + ")"); e.status = 502; e.retryable = true; throw e; }
  return text;
}
const isBusy = e => e.retryable || [429, 500, 502, 503, 504].includes(Number(e.status)) || /high demand|overloaded|unavailable|try again|quota|rate/i.test(e.message || "");
async function callGemini(system, content) {
  let lastErr;
  for (const model of [MODEL, ...GEMINI_FALLBACKS]) {
    for (const wait of [0, 1500, 4000]) {
      if (wait) await sleep(wait);
      try {
        const text = await geminiOnce(model, system, content);
        if (model !== MODEL) console.log(`  (answered by backup model ${model})`);
        return text;
      } catch (e) {
        lastErr = e;
        if (!isBusy(e)) throw e;            // wrong key, bad model name etc. – no point retrying
        console.log(`  Gemini busy on ${model} (${e.status || ""}) – retrying…`);
      }
    }
  }
  lastErr.message = "Gemini is busy right now (tried " + [MODEL, ...GEMINI_FALLBACKS].join(", ") + "). Wait a minute and send the answer again. " ;
  throw lastErr;
}
async function callAnthropic(system, content) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, messages: [{ role: "user", content }] })
  });
  const data = await r.json();
  if (data.error) { const e = new Error(data.error.message || data.error.type); e.status = r.status; throw e; }
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}
// Kept as /api/claude so the browser code doesn't change; it uses whichever provider is configured.
app.post(["/api/ai", "/api/claude"], async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: `${KEY_NAME} is not set in .env` });
  const { system, content } = req.body || {};
  try {
    const text = PROVIDER === "gemini" ? await callGemini(system, content) : await callAnthropic(system, content);
    res.json({ text });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(502).json({ error: `Could not reach the ${PROVIDER} API – check internet / firewall / VPN` });
  }
});
// Lists the Gemini models your key can use (helps if the model name in .env is wrong)
app.get("/api/models", async (req, res) => {
  if (PROVIDER !== "gemini" || !API_KEY) return res.json({ models: [] });
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": API_KEY } });
    const d = await r.json();
    if (d.error) return res.status(r.status).json({ error: d.error.message });
    res.json({ models: (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name.replace("models/", "")) });
  } catch (e) { res.status(502).json({ error: "Could not reach the Gemini API" }); }
});

// ---------- Sessions (pause / resume) ----------
const sessFile = sid => path.join(DATA, "sessions", safe(sid) + ".json");
app.get("/api/sessions", (req, res) => {
  const out = [];
  for (const f of fs.readdirSync(path.join(DATA, "sessions"))) {
    if (!f.endsWith(".json")) continue;
    try { const d = JSON.parse(fs.readFileSync(path.join(DATA, "sessions", f), "utf-8"));
          out.push({ sid: d.S.sid, label: d.S.label, qid: d.qid, savedAt: d.savedAt }); } catch (e) {}
  }
  out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  res.json(out);
});
app.get("/api/sessions/:sid", (req, res) => {
  const f = sessFile(req.params.sid);
  if (!fs.existsSync(f)) return res.status(404).json({ error: "not found" });
  res.type("application/json").send(fs.readFileSync(f, "utf-8"));
});
app.put("/api/sessions/:sid", (req, res) => { fs.writeFileSync(sessFile(req.params.sid), JSON.stringify(req.body)); res.json({ ok: true }); });
app.delete("/api/sessions/:sid", (req, res) => { const f = sessFile(req.params.sid); if (fs.existsSync(f)) fs.unlinkSync(f); res.json({ ok: true }); });

// ---------- Reports & audio ----------
// ---------- Google Sheets (optional) ----------
const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL || "";
const SHEETS_SECRET = process.env.SHEETS_SECRET || "";
async function sendToSheets(body) {
  if (!SHEETS_URL) return { ok: false, skipped: true, error: "Google Sheet not connected (SHEETS_WEBHOOK_URL missing in .env)" };
  try {
    const r = await fetch(SHEETS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                                        body: JSON.stringify({ secret: SHEETS_SECRET, ...body }), redirect: "follow" });
    const text = await r.text();
    try { return JSON.parse(text); }
    catch (_) { return { ok: false, error: /<html/i.test(text) ? "Google returned a web page – check the Web app is deployed with access 'Anyone'" : text.slice(0, 200) }; }
  } catch (e) { return { ok: false, error: "Could not reach Google Sheets – check internet" }; }
}
app.get("/api/sheets/test", async (req, res) => res.json(await sendToSheets({ test: true })));

app.post("/api/reports/:sid", async (req, res) => {
  fs.writeFileSync(path.join(DATA, "reports", safe(req.params.sid) + ".json"), JSON.stringify(req.body, null, 2));
  const sheet = await sendToSheets({ sid: req.params.sid, report: req.body });
  if (!sheet.ok && !sheet.skipped) console.log("  Google Sheet error: " + sheet.error);
  res.json({ ok: true, savedLocally: true, sheet });
});
app.post("/api/audio/:sid/:name", express.raw({ type: () => true, limit: "25mb" }), (req, res) => {
  const dir = path.join(DATA, "audio", safe(req.params.sid));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, safe(req.params.name) + ".webm"), req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\nDISHA is running → http://localhost:${PORT}  (open in Google Chrome)`);
  for (const line of envReport) console.log("  " + line);
  console.log(ACCESS_PIN ? "  Access PIN: ON" : "  Access PIN: off (set ACCESS_PIN before putting this online)");
  console.log(PUBLIC_DIR ? "  Screen files: found" + (PUBLIC_DIR === __dirname ? " (next to server.js)" : " (public folder)") : "  ⚠ Screen files MISSING – upload the public folder (index.html, app.js, styles.css)");
  console.log(fs.existsSync(CONFIG_PATH) ? "  Questions file: found" : "  ⚠ Questions file MISSING – upload config/disha_config.json");
  console.log(SHEETS_URL ? "  Google Sheet: connected" : "  Google Sheet: not connected (reports saved in data/reports only)");
  console.log(API_KEY ? `AI provider: ${PROVIDER} · model: ${MODEL}` : `WARNING: ${KEY_NAME} is missing – copy .env.example to .env and add your key.`);
});
