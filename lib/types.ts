export interface Gym {
  id: number
  name: string
  address: string
  city: string
  postcode: string
  phone?: string
  latitude?: number
  longitude?: number
  gym_chain_id?: number
  required_tier: string
  amenities?: any // jsonb
  opening_hours?: any // jsonb
  image_url?: string
  rating?: number
  status?: string
  createdAt: Date
  updatedAt: Date
}

export interface GymPass {
  id: number
  userId: string
  gymId: number
  passCode: string
  status: string
  validUntil: Date
  usedAt?: Date
  qrCodeUrl?: string
  subscriptionTier?: string
  passCost?: number
  createdAt: Date
  updatedAt: Date
  gym?: Gym
}

export interface Subscription {
  id: number
  userId: string
  tier: string
  monthlyLimit: number
  visitsUsed: number
  price: number
  startDate: Date
  nextBillingDate: Date
  currentPeriodStart: Date
  currentPeriodEnd: Date
  status: string
  stripeSubscriptionId?: string
  stripeCustomerId?: string
  guestPassesLimit: number
  guestPassesUsed: number
  createdAt: Date
  updatedAt: Date
}

export interface Article {
  id: string
  title: string
  headline?: string
  excerpt?: string | null
  slug?: string
  published_date?: string | null
  featured_image?: string
  featured_image_alt?: string
}

