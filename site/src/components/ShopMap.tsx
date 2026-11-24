import { useMemo } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet'
import { SHOP } from '../lib/pickup.ts'
import { useTheme } from '../lib/theme.tsx'
import { shopIcon, TILE_ATTRIBUTION, TILE_URL } from './map-icons.ts'

const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Contact map: the shop's pin on tiles tinted to the theme. The wheel never zooms it, and on
 * touch screens one finger scrolls the page instead of dragging the map.
 */
export default function ShopMap({ label }: { label: string }) {
  const { resolved } = useTheme()
  const icon = useMemo(() => shopIcon(), [])
  return (
    <MapContainer center={[SHOP.lat, SHOP.lon]} zoom={16} scrollWheelZoom={false} dragging={!coarse} className="size-full">
      <TileLayer key={resolved} url={TILE_URL} attribution={TILE_ATTRIBUTION} className={resolved === 'dark' ? 'nt-tiles-dark' : 'nt-tiles-light'} maxZoom={19} />
      <Marker position={[SHOP.lat, SHOP.lon]} icon={icon} title={label}>
        <Tooltip permanent direction="top" offset={[0, -16]}>
          {SHOP.name}
        </Tooltip>
      </Marker>
    </MapContainer>
  )
}
