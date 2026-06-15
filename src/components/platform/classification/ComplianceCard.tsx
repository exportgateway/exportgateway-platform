interface ComplianceCardProps {
  visible: boolean;
}

export function ComplianceCard({ visible }: ComplianceCardProps) {
  if (!visible) return null;

  return (
    <aside
      className="rounded-xl border border-amber-300/80 bg-amber-50/90 p-5 sm:p-6"
      role="note"
      data-testid="compliance-notice"
    >
      <p className="text-sm font-bold text-amber-950">Suggested classification — verify before filing</p>
      <p className="mt-2 text-sm leading-relaxed text-amber-950/85">
        This result is based on historical AES data, validated knowledge, AI analysis and product
        research where applicable. ExportGateway provides indicative guidance only — not Binding
        Tariff Information, Binding Origin Information, or official customs decisions.
      </p>
      <p className="mt-2 text-sm text-amber-950/85">
        Final customs classification and customs filing remain the responsibility of the exporter or
        customs declarant.
      </p>
    </aside>
  );
}
