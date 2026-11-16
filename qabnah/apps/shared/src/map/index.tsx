import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { GeoPolygon, LatLng, Zone } from '../api/types';
import { Button } from '../ui/components';
import { useI18n } from '../i18n/i18n';

export const MUSCAT: LatLng = { lat: 23.588, lng: 58.3829 };
export { Marker, Polyline, Polygon, Tooltip, useMap, useMapEvents };

const svgPin = (fill: string, inner = '#fff') =>
  `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg"><path d="M15 39s13-12.1 13-23A13 13 0 0 0 2 16c0 10.9 13 23 13 23z" fill="${fill}" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15.5" r="5" fill="${inner}"/></svg>`;

/** Teardrop pin icon in a colour (pickup = primary, dropoff = accent…). */
export function pinIcon(color = '#0E7C66', label?: string) {
  return L.divIcon({
    className: 'map-pin',
    html: svgPin(color) + (label ? `<span class="sr-only">${label}</span>` : ''),
    iconSize: [30, 40],
    iconAnchor: [15, 39],
    tooltipAnchor: [0, -34],
  });
}

export function captainIcon(busy: boolean, text = '') {
  return L.divIcon({
    className: 'map-pin',
    html: `<div class="captain-marker ${busy ? 'captain-marker--busy' : 'captain-marker--free'}">${text}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    tooltipAnchor: [0, -14],
  });
}

export const PICKUP_COLOR = '#0E7C66';
export const DROPOFF_COLOR = '#F4A300';

export function MapView({ center = MUSCAT, zoom = 12, height = 320, className, style, children, ariaLabel, scrollWheelZoom = true }: {
  center?: LatLng; zoom?: number; height?: number | string; className?: string; style?: CSSProperties; children?: ReactNode; ariaLabel?: string; scrollWheelZoom?: boolean;
}) {
  return (
    <div className={`map ${className ?? ''}`} style={{ height, ...style }} role="region" aria-label={ariaLabel ?? 'Map'}>
      <MapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom={scrollWheelZoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        <InvalidateOnResize />
        {children}
      </MapContainer>
    </div>
  );
}

/** Leaflet needs a size recalculation when its container appears inside modals/drawers/tabs. */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(el);
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => { ro?.disconnect(); clearTimeout(t); };
  }, [map]);
  return null;
}

/** Fit the map to a set of points once (or whenever `fitKey` changes). */
export function FitBounds({ points, fitKey, maxZoom = 15, padding = 40 }: { points: LatLng[]; fitKey?: string | number; maxZoom?: number; padding?: number }) {
  const map = useMap();
  const key = fitKey ?? points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.setView([points[0].lat, points[0].lng], Math.min(maxZoom, 15)); return; }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [padding, padding], maxZoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function ClickToSet({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }) });
  return null;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function Recenter({ to }: { to: LatLng | null }) {
  const map = useMap();
  const last = useRef<string>('');
  useEffect(() => {
    if (!to) return;
    const k = `${to.lat},${to.lng}`;
    if (k === last.current) return;
    last.current = k;
    if (!map.getBounds().contains([to.lat, to.lng])) map.setView([to.lat, to.lng], Math.max(map.getZoom(), 14));
  }, [map, to]);
  return null;
}

/**
 * Location picker: tap the map or drag the pin. Keyboard users can use the "use my location" button or type
 * coordinates in a form next to it (callers decide). Reports {lat,lng} rounded to 6 decimals.
 */
export function PinPicker({ value, onChange, height = 300, color = DROPOFF_COLOR, center, label, extra, showLocate = true }: {
  value: LatLng | null; onChange: (p: LatLng) => void; height?: number; color?: string; center?: LatLng; label?: string; extra?: ReactNode; showLocate?: boolean;
}) {
  const { t } = useI18n();
  const icon = useMemo(() => pinIcon(color, t('map.pin')), [color, t]);
  const start = value ?? center ?? MUSCAT;
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <MapView center={start} zoom={value ? 15 : 12} height={height} ariaLabel={label ?? t('map.pickHint')}>
        <ClickToSet onPick={onChange} />
        <Recenter to={value} />
        {extra}
        {value ? (
          <Marker position={[value.lat, value.lng]} icon={icon} draggable keyboard
            eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onChange({ lat: round6(ll.lat), lng: round6(ll.lng) }); } }} />
        ) : null}
      </MapView>
      <div className="row between">
        <span className="text-sm muted">{t('map.pickHint')}</span>
        {showLocate && typeof navigator !== 'undefined' && 'geolocation' in navigator ? (
          <Button size="sm" variant="ghost" icon="pin" onClick={() => navigator.geolocation.getCurrentPosition(
            (pos) => onChange({ lat: round6(pos.coords.latitude), lng: round6(pos.coords.longitude) }),
            () => undefined, { enableHighAccuracy: true, timeout: 8000 })}>{t('map.locateMe')}</Button>
        ) : null}
      </div>
      {value ? <span className="text-xs muted ltr mono">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span> : null}
    </div>
  );
}

/** GeoJSON polygon ([lng,lat] rings) → Leaflet positions. */
export function polygonPositions(p: GeoPolygon | null | undefined): [number, number][][] {
  if (!p?.coordinates) return [];
  return p.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));
}

export function ZoneLayer({ zones, highlightId, showLabels = true }: { zones: Zone[]; highlightId?: string | null; showLabels?: boolean }) {
  const { pick } = useI18n();
  return (
    <>
      {zones.map((z) => (
        <Polygon key={z.id} positions={polygonPositions(z.boundary)}
          pathOptions={{ color: z.id === highlightId ? '#F4A300' : z.isActive ? '#0E7C66' : '#9AA5A2', weight: z.id === highlightId ? 3 : 1.5, fillOpacity: z.isActive ? 0.06 : 0.02, dashArray: z.isActive ? undefined : '4 4' }}>
          {showLabels ? <Tooltip sticky>{pick(z.nameEn, z.nameAr)} · {z.code}</Tooltip> : null}
        </Polygon>
      ))}
    </>
  );
}
