# Domestic abuse evidence for legal aid (prototype)

A victim-facing prototype for the 10 Downing Street data science hackathon, built for the Ministry of Justice **Domestic Abuse Gateway** challenge. It is not a government service.

To get legal aid for a private family matter on the basis of domestic abuse, applicants need evidence that meets Schedule 1 of the Civil Legal Aid (Procedure) Regulations 2012. Evidence letters are often returned because of one or two words. This prototype helps victims at the two points where they can affect the result:

1. **Find evidence** – answer which services you have been in contact with (never what happened) and see the evidence routes that may apply.
2. **Request notes** – a note to hand each professional with the exact wording that paragraph needs.
3. **Check a letter** – paste a letter and see whether it is likely to be accepted, with a message to send back if it needs changes.
4. **Ask the helper** – an AI chatbot for process questions, with scripted rules for emergencies, privacy and pasted letters.

## Safety

- No analytics, cookies or storage. Entered text is cleared on exit. Only helper questions leave the browser.
- GOV.UK **Exit this page** on every page (Shift ×3) and a [stay safe online](src/pages/safety.html) page adapted from Check if you can get legal aid.
- Points to 999 (Silent Solution 55), the National Domestic Abuse Helpline and the Civil Legal Advice harm fast-track.
- The helper sends questions to `api/chat.js`, a Vercel function that calls an OpenAI model (`openai/gpt-5-mini`, override with `CHAT_MODEL`) through the Vercel AI Gateway. Danger, privacy and pasted letters are always answered by the rules in the browser, which are also the fallback when the API is unavailable (as on GitHub Pages).

## How the checks work

`src/app/rules.js` encodes rules for paragraphs 11, 14, 17, 18 and 19, derived from the accepted and rejected examples in the hackathon evidence pack (`src/app/samples.js`). The tests check that every accepted example passes and every rejected example fails for the reason it was rejected:

| Paragraph | Rejected because |
|---|---|
| 11 health professional | "might be consistent" |
| 14 IDVA | "we provided" rather than "I am providing" |
| 17 support organisation | matters relied on too general |
| 18 refuge | no perpetrator or family relationship |
| 19 local authority | "might be a victim" |

12 examples are not enough to measure accuracy against Legal Aid Agency assessors. This is a screening aid; people make the decisions.

## Run locally

```bash
npm test         # rule tests against the example letters
npm run build    # writes the static site to _site/
npx serve _site  # or any static server
```

Pushes to `main` are tested, built and deployed to GitHub Pages by `.github/workflows/pages.yml`. GitHub Pages has no backend, so the helper uses its scripted answers there.

## Deploy to Vercel

`vercel.json` builds the static site into `_site/` and serves `api/chat.js` as a function. Set `AI_GATEWAY_API_KEY` in the project's environment variables, then:

```bash
vercel deploy --prod
```

The endpoint has no authentication and spends the project's AI Gateway credit; it caps each request at 12 messages of 4,000 characters.

## Credits

Built with [GOV.UK Frontend](https://design-system.service.gov.uk/) 6.5.1 (MIT), vendored in `assets/govuk/` without the GDS Transport font and GOV.UK crown, which are restricted to GOV.UK services. Content is adapted from [GOV.UK](https://www.gov.uk/legal-aid/domestic-abuse) under the Open Government Licence v3.0.
