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

  // Memoize selected marker icon - create once and reuse
  const selectedMarkerIcon = useMemo(() => {
    return L.divIcon({
      html: `<div style="
        background-color: #f97316;
        color: white;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 4px solid white;
        box-shadow: 0 4px 8px rgba(0,0,0,0.4);
        transform: scale(1.2);
      ">📍</div>`,
      className: 'custom-selected-marker',
      iconSize: L.point(32, 32, true),
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
                    className="mt-2 w-full px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
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

