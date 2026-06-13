import type { IntrastatResponse } from "@/lib/platform-api";
import { NON_REPORTING_LABEL, reportingCountryLabel } from "@/lib/intrastat-labels";

export interface IntrastatExportContext {
  routeLabel: string;
  reportingCountry: string;
  totalCost: number;
  calculatedAt: Date;
}

function formatEuro(value: number): string {
  return `€${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

export function exportIntrastatCsv(
  result: IntrastatResponse,
  ctx: IntrastatExportContext
): void {
  const reportingLabel = reportingCountryLabel(ctx.reportingCountry);

  const rows = [
    ["ExportGateway Intrastat Allocation Report"],
    ["Calculation Date", ctx.calculatedAt.toLocaleString("de-DE")],
    ["Route", ctx.routeLabel],
    ["Reporting Country", ctx.reportingCountry],
    ["Total Freight Cost", ctx.totalCost.toFixed(2)],
    [],
    ["Metric", "Value"],
    ["Total Route (km)", result.total_km?.toFixed(0) ?? ""],
    [`${reportingLabel} Distance (km)`, result.domestic_km?.toFixed(0) ?? ""],
    [`${NON_REPORTING_LABEL} Distance (km)`, result.foreign_km?.toFixed(0) ?? ""],
    [`${reportingLabel} Share`, formatPercent(result.domestic_percent)],
    [`${NON_REPORTING_LABEL} Share`, formatPercent(result.foreign_percent)],
    [`${reportingLabel} Amount (EUR)`, result.domestic_cost?.toFixed(2) ?? ""],
    [`${NON_REPORTING_LABEL} Amount (EUR)`, result.foreign_cost?.toFixed(2) ?? ""],
    [],
    ["Disclaimer", "Estimate based on route analysis. Verify with customs broker or tax advisor."],
  ];

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `intrastat-allocation-${dateStamp()}.csv`);
}

export function exportIntrastatPdf(
  result: IntrastatResponse,
  ctx: IntrastatExportContext
): void {
  const reportingLabel = reportingCountryLabel(ctx.reportingCountry);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Intrastat Allocation Report</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 40px; line-height: 1.5; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 24px; }
    .hero { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center; }
    .hero-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #047857; font-weight: 700; }
    .hero-value { font-size: 36px; font-weight: 800; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
    th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .section { margin-top: 24px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .disclaimer { margin-top: 28px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; }
    .brand { font-size: 11px; color: #94a3b8; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>Intrastat Allocation Report</h1>
  <p class="meta">ExportGateway · ${ctx.calculatedAt.toLocaleString("de-DE")}</p>

  <table>
    <tr><th>Route</th><td>${escapeHtml(ctx.routeLabel)}</td></tr>
    <tr><th>Reporting Country</th><td>${escapeHtml(ctx.reportingCountry)}</td></tr>
    <tr><th>Total Freight Cost</th><td>${formatEuro(ctx.totalCost)}</td></tr>
    <tr><th>Total Route</th><td>${Math.round(result.total_km ?? 0)} km</td></tr>
  </table>

  <div class="hero">
    <div class="hero-label">Reporting Country Transport Value</div>
    <div class="hero-value">${formatEuro(result.domestic_cost ?? 0)}</div>
    <div>Used for Intrastat Reporting · ${formatPercent(result.domestic_percent)} of total cost</div>
  </div>

  <p class="section">Distance Allocation</p>
  <table>
    <tr><th>Portion</th><th>Distance</th><th>Share</th></tr>
    <tr>
      <td>${reportingLabel}</td>
      <td>${Math.round(result.domestic_km ?? 0)} km</td>
      <td>${formatPercent(result.domestic_percent)}</td>
    </tr>
    <tr>
      <td>${NON_REPORTING_LABEL}</td>
      <td>${Math.round(result.foreign_km ?? 0)} km</td>
      <td>${formatPercent(result.foreign_percent)}</td>
    </tr>
    <tr>
      <td><strong>Total Route</strong></td>
      <td><strong>${Math.round(result.total_km ?? 0)} km</strong></td>
      <td><strong>100%</strong></td>
    </tr>
  </table>

  <p class="section">Cost Allocation</p>
  <table>
    <tr><th>Portion</th><th>Amount</th><th>Share</th></tr>
    <tr>
      <td>${reportingLabel}</td>
      <td>${formatEuro(result.domestic_cost ?? 0)}</td>
      <td>${formatPercent(result.domestic_percent)}</td>
    </tr>
    <tr>
      <td>${NON_REPORTING_LABEL}</td>
      <td>${formatEuro(result.foreign_cost ?? 0)}</td>
      <td>${formatPercent(result.foreign_percent)}</td>
    </tr>
    <tr>
      <td><strong>Total Freight Cost</strong></td>
      <td><strong>${formatEuro(ctx.totalCost)}</strong></td>
      <td><strong>100%</strong></td>
    </tr>
  </table>

  <p class="disclaimer">
    Allocation based on actual route distance and country segmentation using Mapbox routing.
    Always verify reporting requirements with your customs broker, tax advisor, or competent authority.
  </p>
  <p class="brand">Powered by ExportGateway Intrastat Intelligence</p>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
