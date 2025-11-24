/**
 * Haversine distance calculation (in km)
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (x: number) => (x * Math.PI) / 180
  const R = 6371 // Earth's radius in km

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const d = R * c

  return d
}

/**
 * Get coordinates from postcode using Geoapify
 */
export async function getCoordinatesFromPostcode(postcode: string): Promise<{
  latitude: number
  longitude: number
} | null> {
  try {
    const apiKey = process.env.GEOAPIFY_API_KEY || 'cc5e1b6700894f2bbeab8789097dc292'
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(postcode)}&format=json&apiKey=${apiKey}`
    )
    const data = await response.json()

    if (data.results && data.results.length > 0) {
      return {
        latitude: data.results[0].lat,
        longitude: data.results[0].lon,
      }
    }
    return null
  } catch (error) {
    console.error('Error geocoding postcode:', error)
    return null
  }
}

