// User-facing display labels for invoice templates.
// Keys are the internal template_type values stored in the DB — do NOT change those
// (changing them would require migrating every existing invoice + all pricing/export logic).
// Only the label shown in the UI changes.
export const TEMPLATE_LABELS: Record<string, string> = {
  CH1:      'CH1',
  CH2:      'CH2 + CH3',
  ADM:      'ADM',
  CH1_AG3:  'VN_US_AG3',
  VNSI_AG3: 'KENHSI',
  MANUAL:   'MANUAL',
}

export function templateLabel(t: string | null | undefined): string {
  return t ? (TEMPLATE_LABELS[t] ?? t) : ''
}
