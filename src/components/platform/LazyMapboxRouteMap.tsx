"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { MapboxRouteMap } from "@/components/platform/MapboxRouteMap";

const MapboxRouteMapLazy = dynamic(
  () => import("@/components/platform/MapboxRouteMap").then((m) => m.MapboxRouteMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="animate-pulse rounded-xl bg-slate-100"
        style={{ minHeight: 200 }}
        aria-label="Loading route map"
      />
    ),
  }
);

export function LazyMapboxRouteMap(props: ComponentProps<typeof MapboxRouteMap>) {
  return <MapboxRouteMapLazy {...props} />;
}
