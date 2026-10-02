# Vastra — fashion store with support that remembers

A full fashion e-commerce store (catalogue, bag, coupons, Razorpay checkout, orders, returns, exchanges, reviews, loyalty points) with **Vastra Care**: an AI + human customer-support system built on **[Hindsight](https://hindsight.vectorize.io)** memory that

1. **remembers every customer** — sizes and fit, past returns, delivery quirks, payment problems, mood — across web chat, email and WhatsApp;
2. **learns in hindsight** — when a ticket closes it writes a lesson (symptom → cause → fix → faster path) into a shared playbook, and human agents' edits to AI drafts become corrections;
3. **detects new problems early** — anything it has never seen goes straight to a human, and when several customers report the same new issue it becomes an incident that escalates **New → SEV 3 → SEV 2 → SEV 1** with email, WhatsApp, a full-screen siren and on-call phone calls.

Everything is live: real product data (1,430 products from a CC0 Kaggle dataset, images on Cloudinary), real orders in Postgres, real payments in Razorpay test mode, real messages. There is no seeded or mocked data.

---

## How Hindsight memory is used

| Memory bank | What goes in | Written when | Read when |
|---|---|---|---|
| `vastra-cust-{id}` (one per customer) | sign-up, every order (items + sizes + city), returns with reasons ("M too tight"), size changes, fit reviews, failed deliveries, refunds, every support exchange, CSAT | automatically, in the background, on each event | before every AI reply (`recall`), and for the agent's "What we remember" card (`reflect`) |
| `vastra-playbook` (shared) | lessons from resolved tickets, human corrections of AI drafts, incident root causes and fixes | ticket resolved, agent edits a draft, incident resolved | before every AI reply (`recall`), in triage to decide *known vs new*, and as the **"Known issues & proven fixes" mental model** |

- **Mission & directives:** the playbook bank has a mission and directives ("no invented policy", "refunds above the AI limit need a human", "prefer proven fixes").
- **Observations:** enabled so Hindsight consolidates repeated facts.
- **Mental model:** `known-issues` is refreshed after every new lesson.

**Why this matters (the before/after):** open **Console → Memory lab**, pick a customer, ask the same question. The *without memory* answer is generic; the *with memory* answer knows their size, their last return and the courier problem at their address. **Console → Learning metrics** plots replies-to-resolve over time and compares tickets that matched a past lesson with brand-new issues.

## The support flow

```
customer message (web chat / email reply / WhatsApp)
   │
   ├─ recall: customer bank + playbook (parallel)
   ├─ triage (LLM): problem? known via lesson / incident / policy / order data — or NEW?
   │
   ├─ NEW issue ─────► open incident (severity "new") → assign human (email + WhatsApp) → AI acknowledges + drafts for the agent
   ├─ matches open incident ─► add signal (severity re-evaluated) → human; customer told "we're on it"
   ├─ matches resolved incident / lesson ─► AI applies the known fix
   └─ routine ─► AI acts on live data with tools:
         list/get order · cancel · return/exchange · change size · refund · verify payment with Razorpay ·
         update delivery details · search catalogue · size charts · escalate · resolve
         (cancel/return/refund/size change require the customer's explicit "yes" — enforced in code)
   │
   └─ retain the exchange in the customer's memory; lesson written when the ticket closes
```

### Incident severity (configurable in Admin → Alerting)

| Level | Default trigger (distinct customers, same new issue) | Alarm |
|---|---|---|
| New | 1 | assigned agent: email + WhatsApp; ticket goes straight to a human |
| SEV 3 | 3 within 24 h | whole support team by email, on-call by WhatsApp, console banner + chime |
| SEV 2 | 5 within 60 min | + pulsing red banner and sound, on-call WhatsApp repeated every 10 min until acknowledged |
| SEV 1 | 10 within 30 min, **or** 3 payment/security reports within 15 min | + full-screen siren on every console, all leads on WhatsApp, automated phone call to on-call ("press 1 to acknowledge, 2 to escalate"), auto-escalation to the next person every 5 min |

Severity only rises automatically; only a lead can lower it. Resolving an incident messages every affected customer and stores the fix in the playbook, so the next report is handled by the AI.

## Roles

| Role | Area |
|---|---|
| Customer | storefront, orders, returns, Help centre / chat |
| Support agent (L1) | `/console`: inbox, tickets with memory card, AI drafts, incidents, playbook, memory lab, metrics |
| Support lead | everything L1 does, plus approving refunds above the AI limit, owning incidents, receiving Sev 1 alarms |
| Operations | `/ops`: pack → ship (courier + AWB) → out for delivery → delivered / failed; returns pickup & QC |
| Catalog manager | `/catalog`: prices, stock per size, coupons, home banners |
| Admin | `/admin`: staff & roles, thresholds, on-call order, AI limits, store policies, integrations, notification & audit logs |

## Stack

- **Backend:** FastAPI · SQLAlchemy · Postgres (Neon) · APScheduler · WebSockets
- **AI:** Hindsight Cloud for memory · Groq (`openai/gpt-oss-120b` for the agent with tool calling, `openai/gpt-oss-20b` for triage and lessons, with automatic fallback when rate-limited)
- **Services:** Razorpay (test mode) · Cloudinary · Gmail SMTP/IMAP (or Resend) · Twilio WhatsApp + Voice · India Post pincode API
- **Frontend:** Next.js 16 · React 19 · Tailwind 4 · Recharts

## Run locally

```bash
# backend
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows; use source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env                                 # fill in your keys
pip install pandas && python -m scripts.import_catalog --zip path/to/myntra-products-dataset.zip   # one-time real catalogue import
uvicorn app.main:app --reload

# frontend
cd frontend
cp .env.example .env.local
npm install && npm run dev
```

- The first admin is created from `BOOTSTRAP_ADMIN_*`. Sign in at `/staff/login`, then add your team under **Admin → Team & roles**.
- Without email configured (development only), the login page shows the OTP on screen.
- `python -m scripts.smoke_test` runs an end-to-end check against a running API with temporary accounts, and deletes everything it created.

## Deploy (free tiers)

**API on Render (free web service)**
- New → Web Service, root directory `backend`, region Singapore.
- Build command: `pip install -r requirements.txt`.
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`.
- Health check: `/api/health`.
- Environment variables are listed in `render.yaml`.
- Add the custom domain `api.<your-domain>`.

**Frontend on Vercel (Hobby, free)**
- Import the repo with root directory `frontend`.
- Set `NEXT_PUBLIC_API_URL=https://api.<your-domain>`.
- Add the custom domain `vastra.<your-domain>`.

**Keep the free API awake.** Render's free plan sleeps after 15 idle minutes, which pauses the incident scheduler. A free monitor (cron-job.org or UptimeRobot) calling `https://api.<your-domain>/api/health` every 10 minutes keeps it running. That's about 744 of Render's 750 free hours a month.

**WhatsApp.** In Twilio's WhatsApp sandbox settings, set *When a message comes in* to `https://api.<your-domain>/api/twilio/whatsapp`.

## Data & licences

Product catalogue: [Myntra products dataset](https://www.kaggle.com/datasets/ronakbokaria/myntra-products-dataset) (CC0). "Vastra" is a fictional store built for HackWithHyderabad 3.0. It isn't affiliated with any retailer.
