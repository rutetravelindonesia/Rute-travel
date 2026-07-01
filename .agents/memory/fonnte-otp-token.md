---
name: Fonnte OTP token — validation & where it lives
description: How to diagnose "penumpang tidak dapat OTP", validate a Fonnte token, and why Replit secret updates don't fix production.
---

# Symptom: users register but never receive OTP

OTP is sent via Fonnte WhatsApp (`sendWhatsAppOTP` in api-server). On registration
the send error is swallowed (only `req.log.error`), so the user still sees the
"enter OTP" screen but nothing arrives. `resend-otp` DOES surface a 500 on failure.
Root cause is almost always an **invalid/expired FONNTE_TOKEN**, not code.

# How to validate a Fonnte device token (do NOT trust /device)

- `POST https://api.fonnte.com/device` returns `{"reason":"token invalid"}` **even for
  valid device tokens** — it is the wrong check. Don't conclude the token is bad from this.
- The authoritative test is the real send path:
  `curl -s -X POST https://api.fonnte.com/send -H "Authorization: <TOKEN>" --data-urlencode "target=6287868215823" --data-urlencode "message=test" --data-urlencode "countryCode=62"`
  - Valid token → `{"status":true,"detail":"success! message in queue",...}` (sends a real WA; use the business's own device number `6287868215823` as a harmless target).
  - Bad token → `{"reason":"unknown token","status":false}`.
- A correct Fonnte device token is **20 chars**. Get it from Fonnte dashboard → device
  row "Rute Indonesia" (must be CONNECTED/green) → **Token** button.

# Agent bash env is frozen — verify via workflow restart, not $VAR

The main-agent shell inherits its environment at session start and does **not** pick
up secret changes made mid-session (`echo $FONNTE_TOKEN` / its sha stays stale even
after the secret is updated). To apply a new secret, **restart the workflow** (workflows
load current secrets on restart). To verify a freshly-pasted token, test its literal
value with curl rather than reading `$FONNTE_TOKEN` from bash.

# CRITICAL: production is Railway, not Replit

Updating FONNTE_TOKEN as a Replit secret only fixes the Replit dev/preview. The live
Play Store app hits **railway.app** and uses **Railway's own env vars**. To fix OTP for
real users you MUST update FONNTE_TOKEN in the **Railway dashboard → Variables** and let
Railway redeploy. The same applies to any secret the app reads in production.
