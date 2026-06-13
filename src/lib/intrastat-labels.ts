/** UI label for route/cost portions outside the reporting country */
export const NON_REPORTING_LABEL = "Non-Reporting Countries";

export function reportingCountryLabel(country: string): string {
  return `Reporting Country (${country})`;
}
