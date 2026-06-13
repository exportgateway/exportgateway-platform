"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Loader2, Package, Truck, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import {
  calculateFreightPrice,
  type FreightPriceRequest,
  type FreightPriceResponse,
} from "@/lib/platform-api";
import { getMapboxRoute } from "@/lib/mapbox-routes";
import { euLanePresets } from "@/lib/freight-presets";
import {
  calculateCargoLoadingMeters,
  calculateCargoFloorAreaM2,
  CARGO_TYPE_OPTIONS,
  TRAILER_LOADING_METERS,
  TRAILER_WIDTH_METERS,
  TRAILER_LENGTH_CM,
  TRAILER_HEIGHT_CM,
  TRUCK_WIDTH_CM,
  truckUtilizationPercent,
  validateCargoFit,
  type CargoFitStatus,
  type CargoType,
} from "@/lib/freight-cargo";
import type { ResolvedLocation } from "@/lib/location-types";
import { addPlatformHistoryEntry } from "@/lib/platform-history";
import { LocationSearchInput } from "@/components/platform/LocationSearchInput";
import { FreightResultCard } from "@/components/platform/FreightResultCard";
import { cn } from "@/lib/utils";

const DEFAULT_SHIPMENT = {
  transport_type: "FTL" as const,
  weight_kg: "10000",
  cargo_type: "euro" as CargoType,
  pallets: "10",
};

export function FreightCalculatorForm() {
  const [origin, setOrigin] = useState<ResolvedLocation | null>(null);
  const [destination, setDestination] = useState<ResolvedLocation | null>(null);
  const [transportType, setTransportType] = useState<"FTL" | "LTL">(DEFAULT_SHIPMENT.transport_type);
  const [weightKg, setWeightKg] = useState(DEFAULT_SHIPMENT.weight_kg);
  const [cargoType, setCargoType] = useState<CargoType>(DEFAULT_SHIPMENT.cargo_type);
  const [pallets, setPallets] = useState(DEFAULT_SHIPMENT.pallets);
  const [customLengthCm, setCustomLengthCm] = useState("100");
  const [customWidthCm, setCustomWidthCm] = useState("100");
  const [customHeightCm, setCustomHeightCm] = useState("100");
  const [customQuantity, setCustomQuantity] = useState("1");
  const [loadingMeters, setLoadingMeters] = useState("4.0");
  const [loadingMetersManual, setLoadingMetersManual] = useState(false);
  const [cargoAdvancedOpen, setCargoAdvancedOpen] = useState(true);
  const [result, setResult] = useState<FreightPriceResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<FreightPriceRequest | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | undefined>();
  const [isPending, startTransition] = useTransition();

  const calculatedLoadingMeters = useMemo(
    () =>
      calculateCargoLoadingMeters({
        cargoType,
        pallets: parseInt(pallets, 10) || 0,
        customLengthCm: parseFloat(customLengthCm) || 0,
        customWidthCm: parseFloat(customWidthCm) || 0,
        customQuantity: parseInt(customQuantity, 10) || 0,
      }),
    [cargoType, pallets, customLengthCm, customWidthCm, customQuantity]
  );

  const calculatedFloorAreaM2 = useMemo(() => {
    if (cargoType === "custom") {
      return calculateCargoFloorAreaM2(
        parseFloat(customLengthCm) || 0,
        parseFloat(customWidthCm) || 0,
        parseInt(customQuantity, 10) || 0
      );
    }
    return null;
  }, [cargoType, customLengthCm, customWidthCm, customQuantity]);

  const cargoFit = useMemo(
    () =>
      validateCargoFit({
        cargoType,
        pallets: parseInt(pallets, 10) || 0,
        customLengthCm: parseFloat(customLengthCm) || 0,
        customWidthCm: parseFloat(customWidthCm) || 0,
        customQuantity: parseInt(customQuantity, 10) || 0,
        customHeightCm: parseFloat(customHeightCm) || 0,
      }),
    [cargoType, pallets, customLengthCm, customWidthCm, customQuantity, customHeightCm]
  );

  const utilizationPercent = useMemo(
    () => truckUtilizationPercent(parseFloat(loadingMeters) || 0),
    [loadingMeters]
  );

  useEffect(() => {
    if (!loadingMetersManual) {
      setLoadingMeters(calculatedLoadingMeters.toFixed(2));
    }
  }, [calculatedLoadingMeters, loadingMetersManual]);

  useEffect(() => {
    if (!result?.success || !origin || !destination) {
      setRouteCoordinates(undefined);
      return;
    }

    let cancelled = false;

    getMapboxRoute(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    ).then((route) => {
      if (cancelled) return;
      setRouteCoordinates(route.coordinates);
    });

    return () => {
      cancelled = true;
    };
  }, [result?.success, origin, destination]);

  function applyPreset(presetId: string) {
    const preset = euLanePresets.find((p) => p.id === presetId);
    if (!preset) return;
    setOrigin(preset.from);
    setDestination(preset.to);
    setTransportType(preset.transport_type);
    setWeightKg(String(preset.weight_kg));
    setPallets(String(preset.pallets));
    setCargoType("euro");
    setLoadingMetersManual(false);
    setLoadingMeters(String(preset.loading_meters));
    setResult(null);
  }

  function handleCargoTypeChange(type: CargoType) {
    setCargoType(type);
    setLoadingMetersManual(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!origin || !destination) return;

    startTransition(async () => {
      const payload: FreightPriceRequest = {
        city_from: origin.city || undefined,
        city_to: destination.city || undefined,
        country_from: origin.country_code || undefined,
        country_to: destination.country_code || undefined,
        from_lat: origin.latitude,
        from_lon: origin.longitude,
        to_lat: destination.latitude,
        to_lon: destination.longitude,
        weight_kg: parseFloat(weightKg) || 0,
        pallets:
          cargoType === "custom" ? 0 : parseInt(pallets, 10) || 0,
        loading_meters: parseFloat(loadingMeters) || 0,
        transport_type: transportType,
      };

      const response = await calculateFreightPrice(payload);
      setResult(response);
      setLastRequest(payload);

      if (response.success && response.price_eur != null) {
        const route = `${origin.city} → ${destination.city}`;
        addPlatformHistoryEntry({
          tool: "freight",
          route,
          summary: `€${response.price_eur.toLocaleString("de-DE")} · ${Math.round(response.distance_km ?? 0)} km`,
          href: "/platform/freight",
        });
        window.dispatchEvent(new Event("platform-history-updated"));
      }
    });
  }

  const canSubmit = Boolean(origin && destination);

  return (
    <div className="grid gap-8 xl:grid-cols-5">
      <form onSubmit={handleSubmit} className="xl:col-span-3 space-y-6">
        <div>
          <label className="label-text">Quick lanes</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {euLanePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <LocationSearchInput
            id="pickup-location"
            label="Pickup Location"
            placeholder="Enter city, postal code or address"
            value={origin}
            onChange={(loc) => {
              setOrigin(loc);
              setResult(null);
            }}
            accent="brand"
          />

          <LocationSearchInput
            id="delivery-location"
            label="Delivery Location"
            placeholder="Enter city, postal code or address"
            value={destination}
            onChange={(loc) => {
              setDestination(loc);
              setResult(null);
            }}
            accent="cyan"
          />
        </div>

        <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Truck className="h-4 w-4 text-brand-500" />
            Shipment details
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="transport_type" className="label-text">Transport type</label>
              <select
                id="transport_type"
                value={transportType}
                onChange={(e) => setTransportType(e.target.value as "FTL" | "LTL")}
                className="input-field"
              >
                <option value="FTL">FTL (Full Truck Load)</option>
                <option value="LTL">LTL (Less than Truck Load)</option>
              </select>
            </div>
            <div>
              <label htmlFor="weight_kg" className="label-text">Weight (kg)</label>
              <input
                id="weight_kg"
                type="number"
                min="0"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-surface-muted/20">
          <button
            type="button"
            onClick={() => setCargoAdvancedOpen(!cargoAdvancedOpen)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Advanced Cargo Dimensions
            </span>
            {cargoAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {cargoAdvancedOpen && (
            <div className="space-y-5 border-t border-surface-border px-5 pb-5 pt-4">
              <div>
                <p className="label-text">Cargo type</p>
                <div className="mt-2 space-y-2">
                  {CARGO_TYPE_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                        cargoType === option.id
                          ? "border-brand-300 bg-brand-50/50"
                          : "border-surface-border bg-white hover:border-slate-300"
                      )}
                    >
                      <input
                        type="radio"
                        name="cargo_type"
                        value={option.id}
                        checked={cargoType === option.id}
                        onChange={() => handleCargoTypeChange(option.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                        <span className="block text-xs text-slate-500">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {cargoType !== "custom" ? (
                <div>
                  <label htmlFor="pallets" className="label-text">Number of pallets</label>
                  <input
                    id="pallets"
                    type="number"
                    min="0"
                    step="1"
                    value={pallets}
                    onChange={(e) => {
                      setPallets(e.target.value);
                      setLoadingMetersManual(false);
                    }}
                    className="input-field max-w-xs"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    LM = floor area ÷ {TRAILER_WIDTH_METERS} m trailer width
                    {" · "}
                    e.g. 10 euro pallets = 4.00 LM
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="custom_length" className="label-text">Length (cm)</label>
                    <input
                      id="custom_length"
                      type="number"
                      min="0"
                      value={customLengthCm}
                      onChange={(e) => {
                        setCustomLengthCm(e.target.value);
                        setLoadingMetersManual(false);
                      }}
                      className="input-field"
                      placeholder="Along trailer"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom_width" className="label-text">Width (cm)</label>
                    <input
                      id="custom_width"
                      type="number"
                      min="0"
                      value={customWidthCm}
                      onChange={(e) => setCustomWidthCm(e.target.value)}
                      className="input-field"
                      placeholder={`Max ${TRAILER_WIDTH_METERS * 100} cm trailer`}
                    />
                  </div>
                  <div>
                    <label htmlFor="custom_height" className="label-text">
                      Height (cm)
                    </label>
                    <input
                      id="custom_height"
                      type="number"
                      min="0"
                      value={customHeightCm}
                      onChange={(e) => setCustomHeightCm(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom_quantity" className="label-text">Quantity</label>
                    <input
                      id="custom_quantity"
                      type="number"
                      min="1"
                      step="1"
                      value={customQuantity}
                      onChange={(e) => {
                        setCustomQuantity(e.target.value);
                        setLoadingMetersManual(false);
                      }}
                      className="input-field"
                    />
                  </div>
                  <p className="sm:col-span-2 text-xs text-slate-500">
                    LM = (length × width × quantity) m² ÷ {TRAILER_WIDTH_METERS} m · Height validated against {TRAILER_HEIGHT_CM} cm trailer clearance
                  </p>
                  {calculatedFloorAreaM2 != null && calculatedFloorAreaM2 > 0 && !cargoFit.isOversized && (
                    <p className="sm:col-span-2 text-xs font-medium text-slate-600">
                      Floor area: {calculatedFloorAreaM2.toFixed(2)} m² →{" "}
                      {(calculatedFloorAreaM2 / TRAILER_WIDTH_METERS).toFixed(2)} LM
                    </p>
                  )}
                </div>
              )}

              <CargoFitPanel fit={cargoFit} />

              <div className="rounded-xl border border-surface-border bg-white p-4 space-y-4">
                {cargoFit.isOversized ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-800">
                        Warning
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-red-900">Oversized cargo detected.</p>
                        <p className="mt-1 text-sm text-red-700">
                          Standard loading meter calculations may not be valid.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Calculated loading meters
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                          {calculatedLoadingMeters.toFixed(2)} LM
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Truck utilization
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">
                          {utilizationPercent.toFixed(1)}%
                        </p>
                        <p className="text-xs text-slate-500">of {TRAILER_LOADING_METERS} m trailer</p>
                      </div>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-500 transition-all duration-300"
                        style={{ width: `${Math.min(100, utilizationPercent)}%` }}
                      />
                    </div>
                  </>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="loading_meters" className="label-text mb-0">
                      Loading meters (used for pricing)
                    </label>
                    {!cargoFit.isOversized && loadingMetersManual && (
                      <button
                        type="button"
                        onClick={() => {
                          setLoadingMetersManual(false);
                          setLoadingMeters(calculatedLoadingMeters.toFixed(2));
                        }}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        Reset to calculated
                      </button>
                    )}
                  </div>
                  <input
                    id="loading_meters"
                    type="number"
                    min="0"
                    step="0.1"
                    value={loadingMeters}
                    onChange={(e) => {
                      setLoadingMeters(e.target.value);
                      setLoadingMetersManual(true);
                    }}
                    className="input-field mt-1.5 max-w-xs"
                  />
                  {cargoFit.isOversized && (
                    <p className="mt-1 text-xs text-red-600">
                      Enter loading meters manually — automatic calculation unavailable for oversized cargo.
                    </p>
                  )}
                  {!cargoFit.isOversized && loadingMetersManual && (
                    <p className="mt-1 text-xs text-amber-600">Manual override active</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className={cn("btn-primary w-full sm:w-auto", !canSubmit && "opacity-50 cursor-not-allowed")}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating…
            </>
          ) : (
            "Calculate Freight Price"
          )}
        </button>
      </form>

      <div className="xl:col-span-2">
        <FreightResultPanel
          result={result}
          loading={isPending}
          lastRequest={lastRequest}
          origin={origin}
          destination={destination}
          routeCoordinates={routeCoordinates}
        />
      </div>
    </div>
  );
}

const FIT_STATUS_STYLES: Record<
  CargoFitStatus,
  { badge: string; Icon: typeof CheckCircle2 }
> = {
  fits: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    Icon: CheckCircle2,
  },
  restricted: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    Icon: AlertCircle,
  },
  special_transport: {
    badge: "border-red-200 bg-red-50 text-red-800",
    Icon: AlertTriangle,
  },
};

function CargoFitPanel({
  fit,
}: {
  fit: ReturnType<typeof validateCargoFit>;
}) {
  const styles = FIT_STATUS_STYLES[fit.status];
  const { Icon } = styles;

  return (
    <div className="rounded-xl border border-surface-border bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Cargo fit status
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
            styles.badge
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {fit.statusLabel}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        Standard EU trailer: {TRAILER_LOADING_METERS} m × {TRAILER_WIDTH_METERS} m ×{" "}
        {TRAILER_HEIGHT_CM / 100} m ({TRAILER_LENGTH_CM} × {TRUCK_WIDTH_CM} × {TRAILER_HEIGHT_CM} cm)
      </p>

      {fit.warnings.length > 0 && (
        <ul className="space-y-2">
          {fit.warnings.map((warning) => (
            <li
              key={warning.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                warning.id === "height"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-red-200 bg-red-50 text-red-900"
              )}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      )}

      {fit.status === "fits" && (
        <p className="text-sm text-emerald-700">
          Cargo dimensions fit within a standard European trailer.
        </p>
      )}
    </div>
  );
}

function FreightResultPanel({
  result,
  loading,
  lastRequest,
  origin,
  destination,
  routeCoordinates,
}: {
  result: FreightPriceResponse | null;
  loading: boolean;
  lastRequest: FreightPriceRequest | null;
  origin: ResolvedLocation | null;
  destination: ResolvedLocation | null;
  routeCoordinates?: [number, number][];
}) {
  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-surface-border bg-white p-6 shadow-sm">
        <div className="text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand-500" />
          Running freight intelligence model…
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div
        className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-surface-border bg-gradient-to-br from-slate-50 to-white p-8"
        data-screenshot="freight-empty"
      >
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Truck className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-slate-800">Ready to estimate freight</p>
          <p className="mt-2 text-sm text-slate-500">
            Enter pickup and delivery locations to receive:
          </p>
          <ul className="mt-4 space-y-2 text-left text-sm text-slate-600">
            {[
              "Estimated freight price",
              "Route distance",
              "Confidence score",
              "Historical lane intelligence",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (!result.success && result.detail) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h3 className="text-sm font-semibold text-red-800">Calculation failed</h3>
        <p className="mt-2 text-sm text-red-700">{result.detail}</p>
      </div>
    );
  }

  if (!lastRequest) return null;

  return (
    <FreightResultCard
      result={result}
      request={lastRequest}
      origin={origin}
      destination={destination}
      routeCoordinates={routeCoordinates}
    />
  );
}
