# AnyGym Web Application

A modern web application for users to sign up via Auth0, subscribe via Stripe, and generate gym passes for access to partner gyms.

## Features

- 🔐 **Authentication**: Secure user authentication via Auth0
- 💳 **Subscriptions**: Stripe-powered subscription management
- 🏋️ **Gym Search**: Search and discover partner gyms
- 🎫 **Pass Generation**: Generate 24-hour gym access passes
- 📱 **Responsive UI**: Modern, mobile-friendly interface

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Auth0
- **Payments**: Stripe
- **Database**: Neon (PostgreSQL)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Auth0 account and application
- Stripe account
- Neon database

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Required environment variables:
- `AUTH0_SECRET`: Generate with `openssl rand -hex 32`
- `AUTH0_BASE_URL`: Your app URL (e.g., `http://localhost:3000`)
- `AUTH0_ISSUER_BASE_URL`: Your Auth0 domain
- `AUTH0_CLIENT_ID`: Auth0 application client ID
- `AUTH0_CLIENT_SECRET`: Auth0 application client secret
- `STRIPE_SECRET_KEY`: Stripe secret key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Stripe publishable key
- `STRIPE_PRICE_ID`: Stripe subscription price ID
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret
- `DATABASE_URL`: Neon database connection string

3. Set up your database schema:

The application expects the following tables:
- `gyms`: Gym information
- `user_subscriptions`: User subscription data
- `gym_passes`: Generated gym passes

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

The application expects the following database structure:

### `gyms` table
- `id` (UUID, primary key)
- `name` (text)
- `address` (text)
- `city` (text)
- `state` (text)
- `zip_code` (text)
- `phone` (text, nullable)
- `website` (text, nullable)
- `amenities` (text[], nullable)
- `latitude` (numeric, nullable)
- `longitude` (numeric, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### `user_subscriptions` table
- `id` (UUID, primary key)
- `user_id` (text) - Auth0 user ID
- `stripe_customer_id` (text)
- `stripe_subscription_id` (text, unique)
- `status` (text) - 'active', 'canceled', 'past_due', 'trialing'
- `current_period_end` (timestamp)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### `gym_passes` table
- `id` (UUID, primary key)
- `user_id` (text) - Auth0 user ID
- `gym_id` (UUID, foreign key to gyms)
- `status` (text) - 'active', 'used', 'expired'
- `expires_at` (timestamp)
- `created_at` (timestamp)

## Stripe Webhook Setup

1. Create a webhook endpoint in your Stripe Dashboard
2. Point it to: `https://your-domain.com/api/stripe/webhook`
3. Subscribe to these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/          # Auth0 authentication routes
│   │   ├── gyms/          # Gym search API
│   │   ├── passes/        # Pass generation API
│   │   └── stripe/        # Stripe integration
│   ├── dashboard/         # User dashboard
│   ├── gyms/              # Gym search and listing
│   ├── passes/            # User's gym passes
│   └── subscription/      # Subscription management
├── components/            # React components
├── lib/                   # Utility functions and types
└── public/                # Static assets
```

## License

See LICENSE file for details.
