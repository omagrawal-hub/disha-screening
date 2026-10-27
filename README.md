# DISHA – UC Soft-Skill Screening Bot (Pilot)

In-person voice screening for women's salon partners in Bangalore. Disha talks in Hindi or English, runs the Mandatory Basic Checks, the interview, technical questions, customer scenarios and an angry-customer role-play, then gives a straight score (e.g. **13 / 17 correct**).

## 1. One-time setup (10 minutes)

1. Install **VS Code** – https://code.visualstudio.com
2. Install **Node.js 18 or newer (LTS)** – https://nodejs.org
3. Install **Google Chrome** (needed for voice input and the Hindi voice).
4. Unzip this folder, then in VS Code: **File → Open Folder… → `disha-screening`**.
5. Open the terminal in VS Code: **Terminal → New Terminal**, and run:
   ```
   npm install
   ```
6. Get a **Gemini API key**: go to https://aistudio.google.com/apikey → sign in with Google → **Create API key** → copy it.
7. Copy `.env.example` to a new file called `.env` (same folder as `package.json`) and paste the key:
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=paste-your-key-here
   GEMINI_MODEL=gemini-flash-latest
   ```
   The key stays on this computer and is never sent to the browser.
   (To use Claude instead, set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=...`.)

## 2. Run it

```
npm start
```
Then open **http://localhost:3000** in **Chrome**.

- Click **Settings → Test connection** (should say *Connected to gemini (…)*).
- Click **Test microphone** and allow access.
- Click **Hear Hindi voice** – if it sounds wrong, pick another voice in the dropdown.
- Enter a candidate label (e.g. `Test-07`) → **Start screening**.

### Live voice mode
Disha now runs as a live conversation: she speaks, then listens automatically and shows a **live caption** of what the candidate is saying. When the candidate stops talking for about 2 seconds, the answer is sent and Disha replies — no buttons needed.
- **🎙 button** = pause / continue listening.
- No reply for 12 s → Disha gently nudges, then repeats the question, then offers to simplify; after that listening pauses.
- **Type instead** (tick box) shows a text box for typing answers.
- **Let her interrupt Disha** – only with a headset; lets the candidate cut in while Disha is speaking.
- **↺ Correct last answer** goes back one question if something was misheard.
- Live transcription uses Chrome's speech service, so the laptop needs internet.

In VS Code you can also press **F5** (“Run DISHA server”) to start it with the debugger.

## 3. Changing questions and rules (no coding)

Everything lives in **`config/disha_config.json`**. Edit and save, then reload the browser page – no restart needed.

| What | Where in the file |
|---|---|
| Question wording | `steps[].prompt_hinglish`, `probe` |
| What counts as correct | `steps[].correct_if`, `scenario_bank[].correct_if`, `technical_bank.items[].correct_if`, `roleplay.correct_if` |
| UC terms Disha may say (earnings, PSP hours, leaves, ₹2,000 kit…) | `uc_terms` |
| Hub list | `hubs` |
| Role-play opening line | `roleplay.opening_line_hinglish` |

Terms and hubs can also be edited for one session in **Settings**.

## 4. Where results are saved

| Folder | Contents |
|---|---|
| `data/sessions/` | Paused / in-progress interviews (resume from the right panel) |
| `data/reports/` | Final report per candidate (score, wrong answers, verbatim answers, flags) |
| `data/audio/<candidate>/` | Audio clips of scenario and role-play answers, for reviewing tone flags |

## 5. How scoring works

- **Mandatory Basic Checks** (age, kids under 3, pregnancy, own salon, pedicure, travel, reading, spoken Hindi/English, weekends, hours, training): failing one ends the call – only after Disha has convinced (where allowed) and confirmed.
- **17 scored questions**, each Correct (1) or Not (0): 9 soft-skill, 4 technical, 3 customer scenarios, 1 tone role-play.
- **≥ 75 % → Auto-pass · 50–74 % → Manual review · < 50 % → Reject.**
- Any **attitude flag** (rude / arrogant words) or a skipped basic check caps the result at Manual review.
- **Review flags** (not scored): much louder than her usual voice, interrupting Disha, very short replies in role-play/scenarios. These point the screening lead to the audio clip – they never change the score.

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| “GEMINI_API_KEY is missing” | Create `.env` (step 1.7) in the same folder as `package.json`, then stop (Ctrl + C) and run `npm start` again. |
| “API key not valid” | Copy the key again from aistudio.google.com/apikey (no spaces or quotes). |
| “model … not found / not supported” | Settings → Test connection lists the models your key can use. Put one in `GEMINI_MODEL` in `.env` and restart. |
| “quota exceeded” / 429 | Free-tier limit reached – wait a minute, or enable billing on the Google AI Studio project. |
| “Could not reach the gemini API” | Office Wi-Fi / VPN may block it – try a hotspot or ask IT to allow `generativelanguage.googleapis.com`. |
| `.env` saved as `.env.txt` | In File Explorer turn on View → File name extensions and rename it to exactly `.env`. |
| Mic blocked | Chrome address bar → lock icon → Microphone → Allow → reload. |
| Hindi sounds English | Settings → pick a Hindi voice (Chrome: “Google हिन्दी”; Edge: “Swara”). |
| Many “interruption” flags | Use a headset – speakers leak Disha's voice into the mic. Or untick *Flag interruptions*. |

## 7. Pilot rules

- Use role-play / test candidates until legal has approved consent text and data retention for real candidates.
- On the **free** Gemini tier Google may use prompts to improve its products – fine for role-play tests, but use a **paid (billing-enabled) project** before any real candidate data goes through it.
- `data/` holds personal answers and audio – don't email or upload it; delete it after the pilot review.
- Have senior trainers validate the technical and role-play “correct if” lines before go-live.
