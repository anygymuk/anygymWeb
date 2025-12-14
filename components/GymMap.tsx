'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { Gym } from '@/lib/types'

// Fix for default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface GymMapProps {
  gyms: Gym[]
  selectedGym?: Gym | null
  onGymClick?: (gym: Gym) => void
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [map, center, zoom])
  return null
}

export default function GymMap({ gyms, selectedGym, onGymClick }: GymMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([54.5, -2.0]) // Center of UK
  const [mapZoom, setMapZoom] = useState(6)

  useEffect(() => {
    if (selectedGym && selectedGym.latitude && selectedGym.longitude) {
      setMapCenter([Number(selectedGym.latitude), Number(selectedGym.longitude)])
      setMapZoom(13)
    }
  }, [selectedGym])

  // Memoize cluster icon creation function
  const createClusterCustomIcon = useCallback((cluster: any) => {
    const count = cluster.getChildCount()
    return L.divIcon({
      html: `<div style="
        background-color: #f97316;
        color: white;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">${count}</div>`,
      className: 'custom-marker-cluster',
      iconSize: L.point(40, 40, true),
    })
  }, [])

  // Create custom gym marker icon - orange pin with white circle and red/coral dumbbell
  const gymMarkerIcon = useMemo(() => {
    return L.divIcon({
      html: `
        <svg width="40" height="50" viewBox="0 0 40 50" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          <!-- Orange teardrop pin shape -->
          <path d="M20 0 C12 0 6 6 6 14 C6 20 20 40 20 40 C20 40 34 20 34 14 C34 6 28 0 20 0 Z" fill="#f97316"/>
          <!-- White circle -->
          <circle cx="20" cy="14" r="9" fill="white"/>
          <!-- Red/coral dumbbell icon (Font Awesome style, scaled to fit within circle) -->
          <g transform="translate(20, 14) scale(0.025) translate(-320, -320)">
            <path d="M96 176C96 149.5 117.5 128 144 128C170.5 128 192 149.5 192 176L192 288L448 288L448 176C448 149.5 469.5 128 496 128C522.5 128 544 149.5 544 176L544 192L560 192C586.5 192 608 213.5 608 240L608 288C625.7 288 640 302.3 640 320C640 337.7 625.7 352 608 352L608 400C608 426.5 586.5 448 560 448L544 448L544 464C544 490.5 522.5 512 496 512C469.5 512 448 490.5 448 464L448 352L192 352L192 464C192 490.5 170.5 512 144 512C117.5 512 96 490.5 96 464L96 448L80 448C53.5 448 32 426.5 32 400L32 352C14.3 352 0 337.7 0 320C0 302.3 14.3 288 32 288L32 240C32 213.5 53.5 192 80 192L96 192L96 176z" fill="#ff6b6b"/>
          </g>
        </svg>
      `,
      className: 'custom-gym-marker',
      iconSize: L.point(40, 50, true),
      iconAnchor: L.point(20, 50, true),
      popupAnchor: L.point(0, -50, true),
    })
  }, [])

  // Memoize selected marker icon - create once and reuse (larger version with scale)
  const selectedMarkerIcon = useMemo(() => {
    return L.divIcon({
      html: `
        <svg width="48" height="60" viewBox="0 0 40 50" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4)); transform: scale(1.2);">
          <!-- Orange teardrop pin shape with white border -->
          <path d="M20 0 C12 0 6 6 6 14 C6 20 20 40 20 40 C20 40 34 20 34 14 C34 6 28 0 20 0 Z" fill="#f97316" stroke="white" stroke-width="2"/>
          <!-- White circle -->
          <circle cx="20" cy="14" r="9" fill="white"/>
          <!-- Red/coral dumbbell icon (Font Awesome style, scaled to fit within circle) -->
          <g transform="translate(20, 14) scale(0.025) translate(-320, -320)">
            <path d="M96 176C96 149.5 117.5 128 144 128C170.5 128 192 149.5 192 176L192 288L448 288L448 176C448 149.5 469.5 128 496 128C522.5 128 544 149.5 544 176L544 192L560 192C586.5 192 608 213.5 608 240L608 288C625.7 288 640 302.3 640 320C640 337.7 625.7 352 608 352L608 400C608 426.5 586.5 448 560 448L544 448L544 464C544 490.5 522.5 512 496 512C469.5 512 448 490.5 448 464L448 352L192 352L192 464C192 490.5 170.5 512 144 512C117.5 512 96 490.5 96 464L96 448L80 448C53.5 448 32 426.5 32 400L32 352C14.3 352 0 337.7 0 320C0 302.3 14.3 288 32 288L32 240C32 213.5 53.5 192 80 192L96 192L96 176z" fill="#ff6b6b"/>
          </g>
        </svg>
      `,
      className: 'custom-selected-marker',
      iconSize: L.point(48, 60, true),
      iconAnchor: L.point(24, 60, true),
      popupAnchor: L.point(0, -60, true),
    })
  }, [])

  // Memoize filtered gyms to prevent unnecessary re-renders
  // Exclude selected gym from cluster group to avoid icon switching issues
  const validGyms = useMemo(() => {
    return gyms.filter((gym) => gym.latitude && gym.longitude)
  }, [gyms])

  const gymsForCluster = useMemo(() => {
    if (!selectedGym) return validGyms
    return validGyms.filter((gym) => gym.id !== selectedGym.id)
  }, [validGyms, selectedGym])

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <MapController center={mapCenter} zoom={mapZoom} />
        <MarkerClusterGroup
          key="gym-cluster-group"
          chunkedLoading
          iconCreateFunction={createClusterCustomIcon}
        >
          {gymsForCluster.map((gym) => (
            <Marker
              key={`gym-${gym.id}`}
              position={[Number(gym.latitude), Number(gym.longitude)]}
              icon={gymMarkerIcon}
              eventHandlers={{
                click: () => {
                  if (onGymClick) {
                    onGymClick(gym)
                  }
                },
              }}
            >
              <Popup>
                <div className="p-2">
                  <h3 className="font-semibold text-lg mb-1">{gym.name}</h3>
                  <p className="text-sm text-gray-600">{gym.address}</p>
                  <p className="text-sm text-gray-600">
                    {gym.city} {gym.postcode}
                  </p>
                  {gym.phone && (
                    <p className="text-sm text-gray-600">Phone: {gym.phone}</p>
                  )}
                  <button
                    onClick={() => onGymClick?.(gym)}
                    className="mt-2 w-full px-3 py-1 bg-[#FF6B6B] text-white text-sm rounded hover:bg-[#FF5252]"
                  >
                    View Details
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
        
        {/* Render selected gym marker separately outside cluster group */}
        {selectedGym && selectedGym.latitude && selectedGym.longitude && (
          <Marker
            key={`selected-gym-${selectedGym.id}`}
            position={[Number(selectedGym.latitude), Number(selectedGym.longitude)]}
            icon={selectedMarkerIcon}
            zIndexOffset={1000}
            eventHandlers={{
              click: () => {
                if (onGymClick) {
                  onGymClick(selectedGym)
                }
              },
            }}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-lg mb-1">{selectedGym.name}</h3>
                <p className="text-sm text-gray-600">{selectedGym.address}</p>
                <p className="text-sm text-gray-600">
                  {selectedGym.city} {selectedGym.postcode}
                </p>
                {selectedGym.phone && (
                  <p className="text-sm text-gray-600">Phone: {selectedGym.phone}</p>
                )}
                <button
                  onClick={() => onGymClick?.(selectedGym)}
                  className="mt-2 w-full px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  View Details
                </button>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}

