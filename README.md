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
