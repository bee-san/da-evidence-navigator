# Domestic abuse evidence for legal aid (prototype)

A victim-facing prototype for the 10 Downing Street data science hackathon, built for the Ministry of Justice **Domestic Abuse Gateway** challenge. It is not a government service.

To get legal aid for a private family matter on the basis of domestic abuse, applicants need evidence that meets Schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012. Evidence letters are often returned because of one or two words. This prototype helps at the points where that can be prevented.

For victims:

- **Find evidence** – one question at a time, in the order of Schedule 1: police (paragraphs 1–6A), courts (7–10), health (11–12), support services (13–19), immigration (20) and money (21). It asks who already knows, never what happened. Each answer leads to what that evidence must show and a form that writes the request email on the device, opened in the person's own email app with a link for the professional to build or check the letter (`src/app/flows/find-evidence.js`, `evidence.js`, `contact.js`). Nothing typed is sent to the site or an AI model. If nothing applies, it points to support services.
- **Request notes** – a note for each professional with the wording the Legal Aid Agency needs, to copy, print or show as a QR code.
- **Check a letter** – paste it, or add a photo or PDF, choose the type of evidence (all 31 types in Schedules 1 and 2) and see each requirement met, missing or to check, with the sentence relied on, what to ask the writer for, a confidence score and the letter marked up. The rules are a JavaScript port of the MoJ Team 1 `laa-evidence-checker` (`src/app/checker/`); `scripts/checker-golden.py` regenerates the word lists and 174 parity cases from the Python package, and `test/checker.test.mjs` checks the port gives identical results. An optional AI second opinion runs in the browser after consent.
- **Track progress** – a checklist for each letter. Nothing is saved unless the user chooses.
- **Ask the helper** – an AI chatbot for process questions, with scripted rules for emergencies, privacy and pasted letters.
- **Easy read** and a draft **Welsh** page.

For professionals:

- **Write an evidence letter** – answer a few questions and get a letter with the right wording.
- **Check several letters** – a pass/fail table for every letter in an application.

And a **demo** page with a before-and-after story, accuracy results and an impact calculator.

## Safety and privacy

- No analytics or cookies. Typed text is cleared on exit. The only storage is the progress tracker, and only if the user ticks "Save". Only helper questions leave the browser.
- Photos and PDFs are read on the device by PaddleOCR (paddleocr.js on ONNX Runtime Web, PP-OCRv6 tiny models) and PDF.js, served from this site (`assets/vendor/`; the models are downloaded at build time by `scripts/fetch-ocr-models.mjs`). On phone-style photos of the 28 test letters it made 0.4% character errors, against 39% for Tesseract.js, which it replaces. The browser test checks that no request leaves the site while a photo is read.
- The AI second opinion downloads a model from Hugging Face and its runtime from jsDelivr, only after the user agrees. The letter is not sent. Nothing is cached.
- GOV.UK **Exit this page** on every page (Shift ×3) and a [stay safe online](src/pages/safety.html) page adapted from Check if you can get legal aid.
- Points to 999 (Silent Solution 55), the National Domestic Abuse Helpline and the Civil Legal Advice harm fast-track.
- The helper sends questions to `api/chat.js`, a Vercel function that calls `gpt-5-mini` (override with `CHAT_MODEL`) with the OpenAI API when `OPENAI_API_KEY` is set, or through the Vercel AI Gateway with `AI_GATEWAY_API_KEY`. Danger, privacy and pasted letters are always answered by the rules in the browser, which are also the fallback when the API is unavailable.
- **Call them for me** (`api/call.js`): wherever a GP practice, court or local domestic abuse service has a phone number but no email address, an ElevenLabs voice agent can phone it and ask where to send the request and who to address it to, then fill both in. It says it is an AI calling on someone's behalf and never gives the person's name or why they need the evidence. Only the organisation's code and phone number leave the browser, and the function only calls the number listed for it (the NHS website, HMCTS Find a Court or Tribunal, or the bundled services directory). It never calls helplines or freephone numbers. Set `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` and `ELEVENLABS_PHONE_NUMBER_ID` to turn it on for GP practices; that agent's script says it calls "on behalf of a patient". Courts and services also need `ELEVENLABS_GENERAL_AGENT_ID`, an agent whose script uses the `organisation_name`, `organisation_type` and `on_behalf_of` variables. `CALL_DEMO_NUMBER` sends every call to a test phone instead, and the page says so.

## How the checks work

`src/app/rules.js` has rules for 9 letter types. Five come from the accepted and rejected examples in the hackathon pack:

| Paragraph | Rejected example fails because |
|---|---|
| 11 health professional | "might be consistent" |
| 14 IDVA | "we provided" rather than "I am providing" |
| 17 support organisation | matters relied on too general |
| 18 refuge refusal | no perpetrator or family relationship |
| 19 local authority | "might be a victim" |

Four more (MARAC, refuge admission, social services, financial abuse) come from GOV.UK guidance and are tested only against fictional letters (`src/app/synthetic.js`). The checker also warns about dates over 5 years old or in the future.

`src/app/variations.js` edits the pack letters to test other ways of making the same mistake ("may be", "could be", "we have provided", removed dates or relationships) and formatting changes (capitals, broken lines, curly quotes). `src/app/evaluate.js` runs every letter; the tests and the demo page both use it.

| Letters | Number | Correct |
|---|---|---|
| Hackathon pack | 12 | 12 |
| Fictional (other types) | 8 | 8 |
| Variations | 46 | 46 |

`scripts/generate-dataset.mjs` writes 1,000 fictional evidence documents (500 that meet the June 2026 LAA evidence guidance, 500 that each fail one named requirement) across every Schedule 1 and 2 paragraph; `scripts/evaluate-dataset.mjs` scores the rules against them. The rules were tuned on seed 2026 and scored once on a held-out set (seed 7): 402 of 404 letters of supported types correct (99.5%), up from 62.1% before tuning, with no good letters flagged. Both sets come from the same templates and the labels are our reading of the guidance, not caseworker decisions, so this shows the rules follow the guidance, not how often they agree with assessors. On `data/demo16.jsonl` – 16 letters in varied wording from a separate review pack (`data/Demo-16-review.pdf`), with labels proposed by an AI model and not yet human-reviewed – the rules got 0 of the 13 decisive letters right: they look for sample-letter wording and miss paraphrases. Each result now has a confidence rating (0–100%, high/medium/low); see `src/pages/rules.html`.

Measured on the 45 pack, fictional and edited letters, the rules found 16 of 16 hedged letters and flagged none of 29 firm ones. The optional AI model (DeBERTa v3 xsmall, zero-shot, 90% threshold) found 11 of 16 and also flagged none. The rules were written from these letters, so their results show consistency, not real-world accuracy. Measuring that needs real, anonymised Legal Aid Agency decisions.

## Run locally

```bash
npm ci
npm test                # rules, variations, builder
npm run build           # writes the static site to _site/
npm run test:browser    # Chrome: axe-core WCAG 2.2 AA on every page, keyboard, journeys, OCR
RUN_MODEL=1 npm run test:browser   # also downloads and runs the AI model
```

Set `CHROME_PATH` if Chrome is not in the default place. `.github/workflows/ci.yml` runs the unit and browser tests on every pull request and push to `main`.

## Deploy

The site is hosted on Vercel, which deploys every push to `main`. `vercel.json` runs the tests, builds the static site into `_site/` and serves `api/chat.js` as a function. Set `OPENAI_API_KEY` (or `AI_GATEWAY_API_KEY`) in the project's environment variables. To deploy by hand:

```bash
vercel deploy --prod
```

Vercel Authentication protects every deployment, including production, so only members of the Vercel team can open it.

The endpoint spends the project's OpenAI or AI Gateway credit and sits behind Vercel Authentication; it caps each request at 12 messages of 4,000 characters.

## Credits

[GOV.UK Frontend](https://design-system.service.gov.uk/) 6.5.1 (MIT), vendored without the GDS Transport font and GOV.UK crown, which are restricted to GOV.UK services. paddleocr.js, ONNX Runtime Web, the PP-OCRv6 models, PDF.js and qrcode-generator are listed in `assets/vendor/NOTICE.txt`. Content is adapted from [GOV.UK](https://www.gov.uk/legal-aid/domestic-abuse) under the Open Government Licence v3.0.
