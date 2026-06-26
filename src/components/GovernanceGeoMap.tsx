/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { MapPin, AlertCircle } from 'lucide-react';

interface Marker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  type: 'project' | 'cabinet' | 'report';
  description?: string;
  color?: string;
}

interface Props {
  markers?: Marker[];
  onLocationPick?: (lat: number, lng: number, address: string) => void;
  className?: string;
  zoom?: number;
  center?: { lat: number; lng: number };
}

const WB_CENTER = { lat: 22.9868, lng: 87.855 };

const MAP_STYLE = [
  { elementType: 'geometry',           stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'water',  elementType: 'geometry',        stylers: [{ color: '#0e1626' }] },
  { featureType: 'water',  elementType: 'labels.text.fill',stylers: [{ color: '#4e6d70' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'road',   elementType: 'geometry',        stylers: [{ color: '#304a7d' }] },
  { featureType: 'road',   elementType: 'labels.text.fill',stylers: [{ color: '#98a5be' }] },
  { featureType: 'poi',    elementType: 'labels.text.fill',stylers: [{ color: '#6f9ba5' }] },
  { featureType: 'landscape', elementType: 'geometry',     stylers: [{ color: '#23374d' }] },
];

declare global {
  interface Window {
    google?: any;
    initGovernanceMap?: () => void;
  }
}

export function GovernanceGeoMap({
  markers = [],
  onLocationPick,
  className = '',
  zoom = 7,
  center = WB_CENTER,
}: Props) {
  const apiKey  = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapRef  = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [pickedAddress, setPickedAddress] = useState<string | null>(null);

  const initMap = useCallback(() => {
    if (!mapRef.current || mapInst.current || !window.google?.maps) return;
    const G = window.google.maps;

    const gmap = new G.Map(mapRef.current, {
      center,
      zoom,
      styles: MAP_STYLE,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    mapInst.current = gmap;

    for (const m of markers) {
      const mk = new G.Marker({
        position: { lat: m.lat, lng: m.lng },
        map: gmap,
        title: m.title,
        icon: {
          path: G.SymbolPath.CIRCLE,
          scale: m.type === 'cabinet' ? 10 : 7,
          fillColor: m.color ?? (m.type === 'project' ? '#10b981' : m.type === 'cabinet' ? '#f59e0b' : '#3b82f6'),
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
        },
      });
      if (m.description) {
        const iw = new G.InfoWindow({
          content: `<div style="color:#111;font-size:13px;max-width:200px"><strong>${m.title}</strong><br/>${m.description}</div>`,
        });
        mk.addListener('click', () => iw.open(gmap, mk));
      }
    }

    if (onLocationPick) {
      gmap.addListener('click', async (e: any) => {
        const lat = e.latLng.lat() as number;
        const lng = e.latLng.lng() as number;
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const gc = new G.Geocoder();
          const result = await gc.geocode({ location: { lat, lng } });
          if (result.results?.[0]) address = result.results[0].formatted_address;
        } catch { /* coordinate fallback */ }
        setPickedAddress(address);
        onLocationPick(lat, lng, address);
        new G.Marker({
          position: { lat, lng },
          map: gmap,
          title: 'Report location',
          icon: {
            path: G.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 8,
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
          },
        });
      });
    }

    setReady(true);
  }, [center, zoom, markers, onLocationPick]);

  useEffect(() => {
    window.initGovernanceMap = initMap;
    if (window.google?.maps) initMap();
    return () => { delete window.initGovernanceMap; };
  }, [initMap]);

  // ── No API key ──────────────────────────────────────────────
  if (!apiKey) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-900/50 p-8 text-center ${className}`}>
        <MapPin className="mb-3 h-10 w-10 text-slate-600" />
        <p className="font-semibold text-white">Google Maps — API key required</p>
        <p className="mt-1 max-w-xs text-sm text-slate-400">
          Add <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to{' '}
          <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">.env.local</code> to activate the geo map.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Enable{' '}
          <span className="text-blue-400">Maps JS API</span> ·{' '}
          <span className="text-blue-400">Geocoding API</span> ·{' '}
          <span className="text-blue-400">Places API</span>{' '}at{' '}
          <a href="https://console.cloud.google.com" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
            console.cloud.google.com
          </a>
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          The SVG constituency map above always works — Google Maps adds real-world geotagging.
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGovernanceMap`}
        strategy="lazyOnload"
      />
      <div ref={mapRef} className="h-full w-full" style={{ minHeight: '400px' }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        </div>
      )}
      {pickedAddress && onLocationPick && (
        <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-emerald-400/30 bg-slate-900/95 px-3 py-2 text-xs text-emerald-300 backdrop-blur-sm">
          📍 {pickedAddress}
        </div>
      )}
    </div>
  );
}

export type { Marker as GeoMarker };
