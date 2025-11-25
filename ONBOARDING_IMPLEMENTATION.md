# Onboarding Journey Implementation

## Overview

This document describes the onboarding journey implementation for new users. When a user signs up and logs in for the first time via Auth0, they must complete an onboarding flow before accessing the main application.

## Features Implemented

### 1. User Creation on First Login
- Users are automatically created in the `app_users` table when they first log in via Auth0
- The `getOrCreateAppUser` utility function handles user creation and onboarding status checks
- Users are created with `onboarding_completed = false` by default

### 2. Onboarding Flow
The onboarding journey consists of 3 steps:

**Step 1: Personal Information**
- Full Name (required)
- Date of Birth (required, validated to be in the past and reasonable age)

**Step 2: Address**
- Full Address (required)

**Step 3: Emergency Contact**
- Emergency Contact Name (required)
- Emergency Contact Number (required, basic phone validation)

### 3. Post-Onboarding Options
After completing onboarding, users have two options:
- **Continue to Subscription**: Redirects to the subscription page to select a plan
- **Skip for Now**: Redirects to the dashboard, allowing users to subscribe later

### 4. Protected Routes
All protected pages check onboarding status and redirect to `/onboarding` if incomplete:
- `/dashboard` - Main dashboard
- `/profile` - User profile page
- `/passes` - User's gym passes
- `/subscription` - Subscription management

## Database Schema

The following columns need to be added to the `app_users` table:

```sql
- date_of_birth DATE
- address TEXT
- emergency_contact_name TEXT
- emergency_contact_number TEXT
- onboarding_completed BOOLEAN DEFAULT false
```

A migration script is provided at `migrations/add_onboarding_columns.sql`.

## Files Created/Modified

### New Files
1. **`lib/user.ts`** - Utility function for user management and onboarding checks
2. **`app/onboarding/page.tsx`** - Onboarding page component with multi-step form
3. **`app/api/onboarding/route.ts`** - API endpoint to save onboarding data
4. **`migrations/add_onboarding_columns.sql`** - Database migration script

### Modified Files
1. **`app/dashboard/page.tsx`** - Added onboarding check
2. **`app/profile/page.tsx`** - Added onboarding check
3. **`app/passes/page.tsx`** - Added onboarding check
4. **`app/subscription/page.tsx`** - Added onboarding check

## Setup Instructions

### 1. Run Database Migration

Execute the migration script to add the required columns:

```bash
# Connect to your database and run:
psql $DATABASE_URL -f migrations/add_onboarding_columns.sql

# Or using your database client, execute the SQL from:
# migrations/add_onboarding_columns.sql
```

### 2. Verify Implementation

1. Sign up a new user via Auth0
2. After login, the user should be redirected to `/onboarding`
3. Complete the onboarding form
4. Choose to continue to subscription or skip
5. Verify that the user can now access protected routes

## User Flow

```
1. User signs up/logs in via Auth0
   ↓
2. User is redirected to /dashboard
   ↓
3. Dashboard checks onboarding status
   ↓
4. If incomplete → Redirect to /onboarding
   ↓
5. User completes 3-step onboarding form
   ↓
6. User chooses:
   - Continue to Subscription → /subscription → /profile?tab=subscription
   - Skip for Now → /dashboard
   ↓
7. User can now access all protected routes
```

## API Endpoints

### POST `/api/onboarding`
Saves onboarding data and marks user as onboarded.

**Request Body:**
```json
{
  "name": "John Doe",
  "dateOfBirth": "1990-01-01",
  "address": "123 Main St, City, State, ZIP",
  "emergencyContactName": "Jane Doe",
  "emergencyContactNumber": "+1234567890",
  "skipSubscription": false
}
```

**Response:**
```json
{
  "success": true,
  "skipSubscription": false
}
```

## Notes

- The onboarding check is performed server-side on all protected routes
- Users cannot bypass onboarding by directly accessing routes
- The `onboarding_completed` flag is set to `true` only after all required fields are saved
- Existing users without onboarding data will be prompted to complete onboarding on their next login

