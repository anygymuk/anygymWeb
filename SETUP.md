# Setup Guide

## Current Status

The application is a **framework/template** that needs to be configured to work with your existing Auth0, Stripe, and Neon database setup.

## What Needs to Be Configured

### 1. Environment Variables

You need to create a `.env.local` file with your actual credentials:

```bash
cp .env.example .env.local
```

Then fill in:
- **Auth0 credentials** from your Auth0 dashboard
- **Stripe API keys** from your Stripe dashboard  
- **Neon database connection string**
- **Stripe Price ID** for your subscription product

### 2. Database Schema Compatibility

The application assumes these table structures. **We need to verify if your existing database matches:**

#### Expected Tables:

**`gyms` table:**
- `id` (UUID or text)
- `name` (text)
- `address` (text)
- `city` (text)
- `state` (text)
- `zip_code` (text) - Note: using snake_case
- `phone` (text, nullable)
- `website` (text, nullable)
- `amenities` (text array, nullable)
- `latitude` (numeric, nullable)
- `longitude` (numeric, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**`user_subscriptions` table:**
- `id` (UUID or text)
- `user_id` (text) - Auth0 user ID (sub claim)
- `stripe_customer_id` (text)
- `stripe_subscription_id` (text, unique)
- `status` (text) - 'active', 'canceled', 'past_due', 'trialing'
- `current_period_end` (timestamp)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**`gym_passes` table:**
- `id` (UUID or text)
- `user_id` (text) - Auth0 user ID
- `gym_id` (UUID or text, foreign key to gyms)
- `status` (text) - 'active', 'used', 'expired'
- `expires_at` (timestamp)
- `created_at` (timestamp)

### 3. What We Need From You

To make this work with your existing setup, please provide:

1. **Database Schema Details:**
   - What are your actual table names?
   - What are your column names? (snake_case vs camelCase?)
   - What data types are you using? (UUID vs text for IDs?)
   - Do you already have these tables, or do we need to create them?

2. **Auth0 Configuration:**
   - Your Auth0 domain
   - Client ID and Secret
   - Any custom claims or user metadata you're using

3. **Stripe Configuration:**
   - Do you already have Stripe customers/subscriptions in your database?
   - What's your subscription price/product ID?
   - Do you have webhooks set up?

4. **Existing Data:**
   - Do you already have gym data in your database?
   - Do you have existing user subscriptions?
   - Any existing gym passes?

Once you provide this information, I can:
- Adjust the SQL queries to match your schema
- Update column names if needed
- Ensure compatibility with your existing data
- Configure the integrations properly

