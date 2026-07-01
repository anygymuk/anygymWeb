import { Gym } from '@/lib/types'

export function mapGymFromApi(gym: Record<string, unknown>): Gym {
  const pricePerPassRaw = gym.price_per_pass ?? gym.pricePerPass
  const pricePerPass =
    pricePerPassRaw != null && pricePerPassRaw !== ''
      ? parseFloat(String(pricePerPassRaw))
      : undefined

  return {
    id: gym.id as number,
    name: (gym.name as string) || '',
    address: (gym.address as string) || '',
    city: (gym.city as string) || '',
    postcode: (gym.postcode as string) || '',
    phone: (gym.phone as string) || undefined,
    latitude: gym.latitude != null ? parseFloat(String(gym.latitude)) : undefined,
    longitude:
      gym.longitude != null ? parseFloat(String(gym.longitude)) : undefined,
    gym_chain_id: (gym.gym_chain_id as number) || undefined,
    required_tier: (gym.required_tier as string) || 'standard',
    pricePerPass:
      pricePerPass != null && !isNaN(pricePerPass) ? pricePerPass : undefined,
    amenities: gym.amenities || [],
    opening_hours: gym.opening_hours || {},
    image_url: (gym.image_url as string) || undefined,
    rating: undefined,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
