"use client";

import { useEffect, useRef, useId } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxPublicToken } from "@/lib/api-config";
import type { ResolvedLocation } from "@/lib/location-types";
import { cn } from "@/lib/utils";

export interface RouteSegmentLayer {
  id: string;
  segment_type: string;
  /** [latitude, longitude] pairs from API */
  coordinates: number[][];
  color?: string;
}

interface MapboxRouteMapProps {
  origin?: ResolvedLocation | null;
  destination?: ResolvedLocation | null;
  /** GeoJSON line: [lon, lat][] */
  routeCoordinates?: [number, number][];
  segments?: RouteSegmentLayer[];
  distanceKm?: number;
  className?: string;
  height?: number;
  interactive?: boolean;
}

const SEGMENT_COLORS: Record<string, string> = {
  domestic: "#10b981",
  foreign: "#64748b",
  route: "#2563eb",
};

function toLonLatPairs(coords: number[][]): [number, number][] {
  return coords.map(([lat, lon]) => [lon, lat]);
}

function collectBounds(
  points: [number, number][]
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

export function MapboxRouteMap({
  origin,
  destination,
  routeCoordinates,
  segments,
  distanceKm,
  className,
  height = 240,
  interactive = true,
}: MapboxRouteMapProps) {
  const mapId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const token = getMapboxPublicToken();

  const hasGeometry =
    (routeCoordinates && routeCoordinates.length >= 2) ||
    (segments && segments.some((s) => s.coordinates.length >= 2)) ||
    (origin && destination);

  useEffect(() => {
    if (!containerRef.current || !token || !hasGeometry) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [14.5, 46.05],
      zoom: 5,
      interactive,
      attributionControl: true,
    });

    mapRef.current = map;
    const boundsPoints: [number, number][] = [];

    map.on("load", () => {
      if (routeCoordinates?.length) {
        boundsPoints.push(...routeCoordinates);
        map.addSource(`route-${mapId}`, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: routeCoordinates },
          },
        });
        map.addLayer({
          id: `route-line-${mapId}`,
          type: "line",
          source: `route-${mapId}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": SEGMENT_COLORS.route,
            "line-width": 4,
            "line-opacity": 0.9,
          },
        });
      }

      segments?.forEach((seg, index) => {
        if (seg.coordinates.length < 2) return;
        const lineCoords = toLonLatPairs(seg.coordinates);
        boundsPoints.push(...lineCoords);
        const color = seg.color ?? SEGMENT_COLORS[seg.segment_type] ?? "#64748b";
        const sourceId = `seg-${mapId}-${index}`;

        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { segment_type: seg.segment_type },
            geometry: { type: "LineString", coordinates: lineCoords },
          },
        });
        map.addLayer({
          id: `${sourceId}-line`,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": color,
            "line-width": seg.segment_type === "domestic" ? 5 : 4,
            "line-opacity": 0.92,
          },
        });
      });

      if (origin) {
        boundsPoints.push([origin.longitude, origin.latitude]);
        new mapboxgl.Marker({ color: "#2563eb" })
          .setLngLat([origin.longitude, origin.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(origin.label))
          .addTo(map);
      }

      if (destination) {
        boundsPoints.push([destination.longitude, destination.latitude]);
        new mapboxgl.Marker({ color: "#06b6d4" })
          .setLngLat([destination.longitude, destination.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(destination.label))
          .addTo(map);
      }

      const bounds = collectBounds(boundsPoints);
      if (bounds) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 800 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token, mapId, routeCoordinates, segments, origin, destination, hasGeometry, interactive]);

  if (!hasGeometry) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-surface-border bg-gradient-to-br from-slate-50 to-slate-100/80",
          className
        )}
        style={{ height }}
      >
        <p className="px-4 text-center text-xs text-slate-400">
          Select pickup and delivery locations to preview the route on Mapbox
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-amber-200 bg-amber-50",
          className
        )}
      >
        <div
          className="flex items-center justify-center bg-slate-100 text-xs text-slate-500"
          style={{ height }}
        >
          Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable live route maps
        </div>
        {distanceKm != null && (
          <div className="border-t border-amber-200 bg-white px-4 py-2 text-xs text-slate-500">
            Route distance ·{" "}
            <span className="font-semibold text-slate-700">{Math.round(distanceKm)} km</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-surface-border shadow-sm", className)}>
      <div ref={containerRef} style={{ height }} className="w-full" />
      {distanceKm != null && (
        <div className="flex items-center justify-between border-t border-surface-border bg-white px-4 py-2 text-xs text-slate-500">
          <span>
            Route distance ·{" "}
            <span className="font-semibold text-slate-700">{Math.round(distanceKm)} km</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** @deprecated Use MapboxRouteMap */
export { MapboxRouteMap as RoutePreviewMap };
