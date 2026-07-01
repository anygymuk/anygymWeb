# Free Tier Setup Guide

This document describes the **backend**, **database**, and **Stripe** changes required to support the free tier and pay-per-pass flow implemented in anygymWeb.

The web app is ready and expects these API contracts. Until the API changes are deployed, free tier assignment and pass purchases will fail at the API layer.

---

## Overview

| Layer | Responsibility |
|-------|----------------|
| **Database** | `price_per_pass` on gyms, `tier: 'free'` memberships, `pass_purchases` table |
| **API** | Free tier assignment, checkout session creation, webhook → pass creation |
| **Stripe** | One-time Checkout (`mode: 'payment'`) with dynamic `price_data` per gym |
| **anygymWeb** | UI, BFF proxy to API, onboarding "Continue with Free" |

---

## 1. Database Changes

### 1.1 Gyms — add pass pricing

```sql
ALTER TABLE gyms
  ADD COLUMN price_per_pass DECIMAL(10, 2) NULL;

COMMENT ON COLUMN gyms.price_per_pass IS
  'Gym-controlled one-off pass price for free tier members. NULL = purchase unavailable.';
```

Gyms set their own price via your admin tooling. Example: `8.50` for £8.50.

### 1.2 Memberships — support free tier

No schema change required if `tier` is already a string column. Ensure it accepts `'free'`.

Free tier membership row example:

| Column | Value |
|--------|-------|
| `tier` | `free` |
| `status` | `active` |
| `monthly_limit` | `0` |
| `visits_used` | `0` |
| `guest_passes_limit` | `0` |
| `stripe_subscription_id` | `NULL` |
| `price` | `0` |

### 1.3 New `pass_purchases` table

```sql
CREATE TABLE pass_purchases (
  id SERIAL PRIMARY KEY,
  auth0_id TEXT NOT NULL,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  pass_id INTEGER NULL REFERENCES gym_passes(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'gbp',
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pass_purchases_auth0_id ON pass_purchases(auth0_id);
CREATE INDEX idx_pass_purchases_gym_id ON pass_purchases(gym_id);
CREATE INDEX idx_pass_purchases_status ON pass_purchases(status);

COMMENT ON TABLE pass_purchases IS
  'Payment records for free tier pay-per-pass. One row per checkout attempt.';
```

**Status values:** `pending`, `completed`, `failed`, `refunded`

### 1.4 Extend `gym_passes`

```sql
ALTER TABLE gym_passes
  ADD COLUMN purchase_id INTEGER NULL REFERENCES pass_purchases(id);

-- pass_cost column may already exist; populate on purchase confirmation
```

### 1.5 Migration — existing skip users

Assign free tier to users who completed onboarding but have no membership:

```sql
INSERT INTO memberships (user_id, auth0_id, tier, status, monthly_limit, visits_used, guest_passes_limit, guest_passes_used, price, created_at, updated_at)
SELECT
  u.auth0_id,
  u.auth0_id,
  'free',
  'active',
  0,
  0,
  0,
  0,
  0,
  NOW(),
  NOW()
FROM users u
WHERE u.onboarding_completed = true
  AND NOT EXISTS (
    SELECT 1 FROM memberships m WHERE m.auth0_id = u.auth0_id
  );
```

Adjust table/column names to match your schema.

---

## 2. API Changes (api.any-gym.com)

> **Detailed API implementation spec:** see [API_FREE_TIER_IMPLEMENTATION.md](./API_FREE_TIER_IMPLEMENTATION.md) for full endpoint contracts, validation rules, reference code, webhook logic, curl tests, and checklist.

### 2.1 Assign free tier on onboarding

**Extend `PUT /user`** to accept:

```json
{
  "assign_free_tier": true,
  "onboarding_completed": true,
  "...other profile fields..."
}
```

When `assign_free_tier: true`:

1. Upsert membership: `{ tier: 'free', status: 'active', monthly_limit: 0 }`
2. Create Stripe Customer if none exists (for pass purchases later)
3. Do **not** create a Stripe Subscription

### 2.2 Return `pricePerPass` on gym endpoints

**`GET /gyms`, `GET /gyms/{id}`** — include:

```json
{
  "id": 123,
  "name": "Example Gym",
  "price_per_pass": 8.50
}
```

The web app maps this to `pricePerPass`.

### 2.3 Block free tier from subscription pass generation

**`POST /generate_pass`** — reject if user membership `tier === 'free'`:

```json
{ "error": "Free tier members must purchase passes individually" }
```

### 2.4 Create pass checkout session

**New endpoint: `POST /purchase_pass_checkout`**

**Headers:** `auth0_id`

**Request body:**

```json
{
  "auth0_id": "auth0|...",
  "gym_id": 123,
  "success_url": "https://app.any-gym.com/passes?purchase=success",
  "cancel_url": "https://app.any-gym.com/dashboard?purchase=canceled"
}
```

**Server logic:**

1. Verify user has `tier: 'free'` and `status: 'active'`
2. Load gym; verify `price_per_pass > 0`
3. Get/create Stripe Customer for user
4. Create `pass_purchases` row: `status: 'pending'`, `amount: gym.price_per_pass`
5. Create Stripe Checkout Session:

```javascript
const session = await stripe.checkout.sessions.create({
  customer: stripeCustomerId,
  mode: 'payment',
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'gbp',
      unit_amount: Math.round(gym.price_per_pass * 100), // pence
      product_data: {
        name: `Gym Pass — ${gym.name}`,
        metadata: { gym_id: String(gym.id) },
      },
    },
    quantity: 1,
  }],
  success_url: successUrl,
  cancel_url: cancelUrl,
  metadata: {
    auth0_id: auth0Id,
    gym_id: String(gymId),
    purchase_type: 'single_pass',
    price_per_pass: String(gym.price_per_pass),
    pass_purchase_id: String(passPurchase.id),
  },
});
```

6. Store `stripe_checkout_session_id` on `pass_purchases`
7. Return:

```json
{
  "session_id": "cs_...",
  "checkout_url": "https://checkout.stripe.com/..."
}
```

The web BFF at `/api/stripe/create-pass-checkout-session` forwards to this endpoint.

### 2.5 Stripe webhook (API-owned)

Register a **separate webhook endpoint on the API** (not anygymWeb) for pass purchases.

**Events to handle:**

- `checkout.session.completed` (where `metadata.purchase_type === 'single_pass'`)
- `checkout.session.expired` → set `pass_purchases.status = 'failed'`
- Optional: `charge.refunded` → `status = 'refunded'`

**`checkout.session.completed` handler:**

1. **Idempotency:** Look up `pass_purchases` by `stripe_checkout_session_id`. If `status === 'completed'`, return 200 (already processed).
2. Verify `session.payment_status === 'paid'`
3. Verify paid amount matches `pass_purchases.amount` (guard against tampering)
4. Create `gym_passes` row (same logic as `generate_pass`: pass code, QR, 24h validity)
5. Set `gym_passes.pass_cost = pass_purchases.amount`, `gym_passes.purchase_id = pass_purchases.id`
6. Update `pass_purchases`: `status = 'completed'`, `pass_id = <new pass id>`, `stripe_payment_intent_id = session.payment_intent`

**Do not create the pass before payment confirms.**

### 2.6 Upgrade free → paid

When a Stripe subscription activates (existing flow):

1. Replace free membership with paid tier
2. Or update same row: `tier: 'standard'`, attach `stripe_subscription_id`

---

## 3. Stripe Configuration

### 3.1 No new Products required for pass purchases

Pass purchases use **dynamic `price_data`** at checkout time. You do **not** need a Stripe Product/Price per gym.

Existing subscription Products (Standard/Premium/Elite) are unchanged.

### 3.2 Webhook endpoint on the API

In [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks):

1. **Add endpoint** pointing to your API, e.g. `https://api.any-gym.com/stripe/webhook`
2. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - (Optional) `charge.refunded`
3. Copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET` on the API server

If the API already has a webhook for subscriptions, add pass-purchase handling in the same handler by checking `metadata.purchase_type`:

```javascript
if (session.metadata?.purchase_type === 'single_pass') {
  await handlePassPurchaseCompleted(session);
} else {
  await handleSubscriptionCheckout(session); // existing
}
```

### 3.3 API environment variables

Ensure the API has:

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Create checkout sessions, verify webhooks |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures |

### 3.4 anygymWeb environment variables (unchanged)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Redirect to Checkout (subscriptions + pass purchases) |
| `STRIPE_API_KEY` / `STRIPE_SECRET_KEY` | Subscription checkout BFF only |

Pass purchase Checkout Sessions are created by the **API**, not anygymWeb. The web app only redirects to the session URL/ID returned by the API.

### 3.5 Test mode checklist

1. Set `price_per_pass` on a test gym (e.g. `5.00`)
2. Complete onboarding → "Continue with Free"
3. Verify `GET /user` returns `membership.tier: 'free'`
4. Click "Purchase Pass" on dashboard
5. Complete Stripe test payment (`4242 4242 4242 4242`)
6. Verify webhook fires → pass appears on `/passes`
7. Verify `pass_purchases.status = 'completed'` and `gym_passes.pass_cost = 5.00`

---

## 4. Web App Changes (already implemented)

| File | Change |
|------|--------|
| `lib/membership.ts` | Membership mode helpers |
| `lib/gym.ts` | `pricePerPass` mapping |
| `lib/pass-checkout.ts` | Client redirect to pass checkout |
| `app/api/onboarding/route.ts` | Sends `assign_free_tier: true` |
| `app/onboarding/page.tsx` | "Continue with Free" button |
| `app/api/stripe/create-pass-checkout-session/route.ts` | BFF → API |
| `components/GymDetailsPanel.tsx` | Purchase Pass UI + pricing |
| `components/PassesView.tsx` | Free tier layout, pass cost display |
| `components/SubscriptionManager.tsx` | Free plan display + upgrade |
| `components/TermsModal.tsx` | Dynamic labels + price |

---

## 5. Data Flow Summary

```
Onboarding "Continue with Free"
  → PUT /user { assign_free_tier: true }
  → API creates membership tier=free

Purchase Pass (free tier)
  → POST /api/stripe/create-pass-checkout-session { gymId }
  → POST api.any-gym.com/purchase_pass_checkout
  → API creates pass_purchases (pending) + Stripe Checkout
  → User pays on Stripe
  → API webhook checkout.session.completed
  → API creates gym_passes + updates pass_purchases (completed)
  → User lands on /passes?purchase=success

Generate Pass (paid tier) — unchanged
  → POST /api/passes/generate
  → POST api.any-gym.com/generate_pass
```

---

## 6. Rollout Order

1. Deploy database migrations
2. Deploy API: free tier assignment + `price_per_pass` on gym responses
3. Configure Stripe webhook on API
4. Deploy API: `POST /purchase_pass_checkout` + webhook pass creation
5. Set `price_per_pass` on gyms via admin
6. Deploy anygymWeb (this repo)
7. Run backfill migration for existing skip users
