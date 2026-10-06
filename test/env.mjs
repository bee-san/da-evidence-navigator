// Loaded before every test file (node --test --import ./test/env.mjs).
//
// Vercel runs `npm test` as part of the build, with the deployed settings set:
// OPENAI_API_KEY, the ElevenLabs and Resend keys, SITE_URL and so on. The tests
// assume none of them are set, and set the ones they need themselves, so clear
// them first. Otherwise adding a setting in the Vercel dashboard can fail the
// next production deploy.
const SETTINGS = /^(OPENAI_|OCR_OPENAI_|CHAT_MODEL$|CHECK_AI_|AI_GATEWAY_|ELEVENLABS_|CALL_|RESEND_|EMAIL_|SITE_URL$)/;
for (const key of Object.keys(process.env)) if (SETTINGS.test(key)) delete process.env[key];
