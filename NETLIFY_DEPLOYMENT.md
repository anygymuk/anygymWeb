# Netlify Deployment Guide

## Prerequisites

1. Netlify account
2. GitHub repository connected to Netlify
3. All environment variables configured in Netlify

## Build Settings

In your Netlify dashboard, configure these build settings:

- **Build command**: `npm run build`
- **Publish directory**: **MUST BE LEFT EMPTY** (do not set to `.` or `.next` - the Netlify Next.js plugin handles this automatically)
- **Base directory**: Leave empty (unless your Next.js app is in a subdirectory)
- **Node version**: `20` (or set in `netlify.toml`)

**Important**: If you see the error "Your publish directory cannot be the same as the base directory", make sure:
1. Publish directory is **completely empty** in Netlify dashboard
2. Base directory is **empty** (unless your app is in a subdirectory)
3. The `@netlify/plugin-nextjs` plugin is installed (it's in `package.json`)

## Required Environment Variables

Set these in Netlify Dashboard → Site settings → Environment variables:

### Auth0 Variables
- `AUTH0_SECRET` - Generate with `openssl rand -hex 32`
- `AUTH0_BASE_URL` - Your Netlify site URL (e.g., `https://your-site.netlify.app`)
- `AUTH0_ISSUER_BASE_URL` - Your Auth0 domain (e.g., `https://your-tenant.auth0.com`)
- `AUTH0_CLIENT_ID` - Auth0 application client ID
- `AUTH0_CLIENT_SECRET` - Auth0 application client secret

### Stripe Variables
- `STRIPE_SECRET_KEY` - Stripe secret key (starts with `sk_`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (starts with `pk_`)
- `STRIPE_PRICE_ID` - Stripe subscription price ID (starts with `price_`)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (starts with `whsec_`)

### Database Variables
- `DATABASE_URL` - Neon database connection string

## Auth0 Configuration

Update your Auth0 application settings:

1. **Allowed Callback URLs**: 
   - Add: `https://your-site.netlify.app/api/auth/callback`

2. **Allowed Logout URLs**: 
   - Add: `https://your-site.netlify.app`

3. **Allowed Web Origins**: 
   - Add: `https://your-site.netlify.app`

## Stripe Webhook Configuration

1. In Stripe Dashboard → Webhooks, create a new endpoint
2. URL: `https://your-site.netlify.app/api/stripe/webhook`
3. Subscribe to events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in Netlify

## Deployment Steps

1. Push your code to GitHub
2. Netlify will automatically detect the `netlify.toml` file
3. Ensure all environment variables are set in Netlify dashboard
4. Trigger a new deployment or wait for automatic deployment

## Troubleshooting

### 404 Errors

If you're getting 404 errors:
- Ensure `@netlify/plugin-nextjs` is installed (it's in `package.json`)
- Check that `netlify.toml` exists and is correct
- Verify the build completed successfully in Netlify logs

### Environment Variable Issues

- Make sure all environment variables are set in Netlify dashboard
- Variables prefixed with `NEXT_PUBLIC_` are available on the client side
- Restart the site after adding new environment variables

### Build Failures

- Check Netlify build logs for specific errors
- Ensure Node version is set to 20
- Verify all dependencies are in `package.json`

