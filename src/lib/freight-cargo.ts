export type CargoType = "euro" | "industrial" | "custom";

export const TRAILER_LOADING_METERS = 13.6;
/** Standard European trailer width used for LM conversion (2.4 m = 240 cm) */
export const TRAILER_WIDTH_METERS = 2.4;
export const TRUCK_WIDTH_CM = 240;
/** Standard EU trailer internal dimensions (cm) */
export const TRAILER_LENGTH_CM = 1360;
export const TRAILER_HEIGHT_CM = 270;

export type CargoFitStatus = "fits" | "restricted" | "special_transport";

export interface CargoFitWarning {
  id: "width" | "length" | "height";
  message: string;
}

export interface CargoFitValidation {
  status: CargoFitStatus;
  statusLabel: string;
  isOversized: boolean;
  warnings: CargoFitWarning[];
  dimensions: { lengthCm: number; widthCm: number; heightCm?: number };
}

export const PALLET_DIMENSIONS_CM: Record<
  Exclude<CargoType, "custom">,
  { length: number; width: number }
> = {
  euro: { length: 120, width: 80 },
  industrial: { length: 120, width: 100 },
};

export const CARGO_TYPE_OPTIONS: Array<{
  id: CargoType;
  label: string;
  description: string;
}> = [
  {
    id: "euro",
    label: "Euro Pallet (120×80 cm)",
    description: "Floor area 0.96 m² → 0.4 LM per pallet",
  },
  {
    id: "industrial",
    label: "Industrial Pallet (120×100 cm)",
    description: "Floor area 1.20 m² → 0.5 LM per pallet",
  },
  {
    id: "custom",
    label: "Custom Dimensions",
    description: "LM = floor area (m²) ÷ 2.4 trailer width",
  },
];

/** Cargo floor area in m² = (L cm / 100) × (W cm / 100) × quantity */
export function calculateCargoFloorAreaM2(
  lengthCm: number,
  widthCm: number,
  quantity: number
): number {
  const lengthM = Math.max(0, lengthCm) / 100;
  const widthM = Math.max(0, widthCm) / 100;
  const qty = Math.max(0, quantity);
  return lengthM * widthM * qty;
}

/** Standard EU road freight: LM = floor area (m²) / 2.4 */
export function calculateLoadingMetersFromFloorArea(floorAreaM2: number): number {
  if (floorAreaM2 <= 0) return 0;
  return roundLm(floorAreaM2 / TRAILER_WIDTH_METERS);
}

export function calculateLoadingMetersFromDimensions(
  lengthCm: number,
  widthCm: number,
  quantity: number
): number {
  return calculateLoadingMetersFromFloorArea(
    calculateCargoFloorAreaM2(lengthCm, widthCm, quantity)
  );
}

export function calculatePalletLoadingMeters(
  cargoType: Exclude<CargoType, "custom">,
  palletCount: number
): number {
  const dims = PALLET_DIMENSIONS_CM[cargoType];
  return calculateLoadingMetersFromDimensions(dims.length, dims.width, palletCount);
}

export function truckUtilizationPercent(loadingMeters: number): number {
  if (loadingMeters <= 0) return 0;
  return Math.round((loadingMeters / TRAILER_LOADING_METERS) * 1000) / 10;
}

function roundLm(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CargoDimensionInput {
  cargoType: CargoType;
  pallets: number;
  customLengthCm: number;
  customWidthCm: number;
  customQuantity: number;
}

export function calculateCargoLoadingMeters(input: CargoDimensionInput): number {
  if (input.cargoType === "custom") {
    return calculateLoadingMetersFromDimensions(
      input.customLengthCm,
      input.customWidthCm,
      input.customQuantity
    );
  }
  return calculatePalletLoadingMeters(input.cargoType, input.pallets);
}

export interface CargoFitInput extends CargoDimensionInput {
  customHeightCm?: number;
}

export function getCargoUnitDimensions(input: CargoFitInput): {
  lengthCm: number;
  widthCm: number;
  heightCm?: number;
} {
  if (input.cargoType === "custom") {
    return {
      lengthCm: Math.max(0, input.customLengthCm),
      widthCm: Math.max(0, input.customWidthCm),
      heightCm: Math.max(0, input.customHeightCm ?? 0),
    };
  }
  const dims = PALLET_DIMENSIONS_CM[input.cargoType];
  return { lengthCm: dims.length, widthCm: dims.width };
}

const FIT_STATUS_LABELS: Record<CargoFitStatus, string> = {
  fits: "Fits standard trailer",
  restricted: "Potential loading restrictions",
  special_transport: "Special transport required",
};

/** Validate single-unit cargo against standard EU trailer dimensions */
export function validateCargoFit(input: CargoFitInput): CargoFitValidation {
  const dimensions = getCargoUnitDimensions(input);
  const warnings: CargoFitWarning[] = [];

  const widthExceeded = dimensions.widthCm > TRUCK_WIDTH_CM;
  const lengthExceeded = dimensions.lengthCm > TRAILER_LENGTH_CM;
  const heightExceeded =
    dimensions.heightCm != null && dimensions.heightCm > TRAILER_HEIGHT_CM;

  if (widthExceeded) {
    warnings.push({
      id: "width",
      message:
        "Cargo width exceeds standard trailer width. Special transport may be required.",
    });
  }

  if (lengthExceeded) {
    warnings.push({
      id: "length",
      message:
        "Cargo length exceeds standard trailer length. Special transport may be required.",
    });
  }

  if (heightExceeded) {
    warnings.push({
      id: "height",
      message: "Cargo height exceeds standard trailer internal height.",
    });
  }

  const isOversized = widthExceeded || lengthExceeded;

  let status: CargoFitStatus = "fits";
  if (isOversized) {
    status = "special_transport";
  } else if (heightExceeded) {
    status = "restricted";
  }

  return {
    status,
    statusLabel: FIT_STATUS_LABELS[status],
    isOversized,
    warnings,
    dimensions,
  };
}
