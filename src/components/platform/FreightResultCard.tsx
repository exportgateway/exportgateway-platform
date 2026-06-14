"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Globe,
  Sparkles,
} from "lucide-react";
import type { FreightPriceRequest, FreightPriceResponse } from "@/lib/platform-api";
import { countryNameFromCode } from "@/lib/freight-presets";
import { LazyMapboxRouteMap } from "@/components/platform/LazyMapboxRouteMap";
import { FreightTrustBadge } from "@/components/platform/FreightTrustBadge";
import type { ResolvedLocation } from "@/lib/location-types";

const PRICING_METHODOLOGY = [
  "Mapbox route distance",
  "Fuel-adjusted freight pricing",
  "Historical freight lane intelligence",
  "Loading meter utilization",
  "Vehicle type selection",
  "Commercial pricing model",
] as const;

interface FreightResultCardProps {
  result: FreightPriceResponse;
  request: FreightPriceRequest;
  origin: ResolvedLocation | null;
  destination: ResolvedLocation | null;
  routeCoordinates?: [number, number][];
}

function confidenceLabel(score: number): string {
  if (score >= 90) return "High";
  if (score >= 75) return "Good";
  return "Indicative";
}

function routeCityLine(location: ResolvedLocation): string {
  const country =
    location.country ||
    (location.country_code ? countryNameFromCode(location.country_code) : "");
  if (location.city && country) return `${location.city}, ${country}`;
  return location.label;
}

function mapboxDirectionsUrl(
  origin: ResolvedLocation,
  destination: ResolvedLocation
): string {
  return `https://www.mapbox.com/directions/#/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
}

export function FreightResultCard({
  result,
  request,
  origin,
  destination,
  routeCoordinates,
}: FreightResultCardProps) {
  const confidence = result.confidence_score ?? 0;
  const historical = result.historical_match;
  const showHistorical =
    historical?.similar_shipments_count != null &&
    historical.similar_shipments_count > 0 &&
    historical.average_historical_price_eur != null;

  const canOpenMapbox = Boolean(origin && destination);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-sm"
      data-screenshot="freight-result"
    >
      {/* Price hero */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 px-6 py-7 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Estimated Freight Price
        </p>
        <p className="mt-2 text-5xl font-extrabold tabular-nums tracking-tight sm:text-6xl">
          €{result.price_eur?.toLocaleString("de-DE") ?? "—"}
        </p>
        {result.price_range && (
          <p className="mt-2 text-sm text-slate-300">
            Range €{result.price_range[0].toLocaleString("de-DE")} – €
            {result.price_range[1].toLocaleString("de-DE")}
          </p>
        )}

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Distance
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {result.distance_km != null ? `${Math.round(result.distance_km).toLocaleString("de-DE")} km` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Confidence
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {confidence}%{" "}
              <span className="text-sm font-normal text-slate-300">
                ({confidenceLabel(confidence)})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Transport Type
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">{request.transport_type}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Loading Meters
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {request.loading_meters.toFixed(1)} LM
            </dd>
          </div>
        </dl>
      </div>

      <FreightTrustBadge />

      <div className="space-y-5 p-5 sm:p-6">
        {/* Route summary */}
        {origin && destination && (
          <div className="rounded-xl border border-surface-border bg-slate-50/60 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Route Summary
            </h3>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
              <span>{routeCityLine(origin)}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
              <span>{routeCityLine(destination)}</span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <SummaryItem
                label="Distance"
                value={
                  result.distance_km != null
                    ? `${Math.round(result.distance_km).toLocaleString("de-DE")} km`
                    : "—"
                }
              />
              <SummaryItem label="Transport Type" value={request.transport_type} />
              <SummaryItem
                label="Weight"
                value={`${request.weight_kg.toLocaleString("de-DE")} kg`}
              />
              <SummaryItem
                label="Pallets"
                value={request.pallets > 0 ? String(request.pallets) : "—"}
              />
              <SummaryItem
                label="Loading Meters"
                value={`${request.loading_meters.toFixed(1)} LM`}
              />
            </dl>
          </div>
        )}

        {/* Future: historical match block */}
        {showHistorical && historical && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-900">
              <Sparkles className="h-4 w-4" aria-hidden />
              Based on {historical.similar_shipments_count} similar historical shipments
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Average historical price
                </dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                  €{historical.average_historical_price_eur!.toLocaleString("de-DE")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Current estimate
                </dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                  €{result.price_eur?.toLocaleString("de-DE") ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Confidence
                </dt>
                <dd className="mt-0.5 text-lg font-bold text-slate-900">
                  {historical.confidence_label ?? confidenceLabel(confidence)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {result.warning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {result.warning}
          </div>
        )}

        {/* Pricing methodology */}
        <div className="rounded-xl border border-surface-border bg-slate-50/60 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Pricing Methodology</h3>
          <p className="mt-1 text-xs text-slate-500">This estimate uses:</p>
          <ul className="mt-3 space-y-2">
            {PRICING_METHODOLOGY.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {origin && destination && result.price_eur != null && (
          <Link
            href="/intrastat-ai"
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm font-semibold text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
          >
            <Globe className="h-4 w-4" aria-hidden />
            Intrastat AI Auditor — Coming Soon
          </Link>
        )}

        {/* Map — secondary */}
        {origin && destination && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Route map
              </p>
              {canOpenMapbox && result.distance_source === "mapbox" && (
                <a
                  href={mapboxDirectionsUrl(origin, destination)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Open Route in Mapbox
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </div>
            <LazyMapboxRouteMap
              origin={origin}
              destination={destination}
              routeCoordinates={routeCoordinates}
              distanceKm={result.distance_km}
              height={200}
              interactive={false}
            />
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-400">
          Indicative EU road freight estimate. Not a binding carrier quote. Powered by ExportGateway
          Freight Intelligence Engine.
        </p>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
