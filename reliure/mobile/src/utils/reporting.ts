export const REPORT_REASONS = [
  { label: 'Spam', value: 'spam' },
  { label: 'Harcèlement', value: 'harassment' },
  { label: 'Haine', value: 'hate' },
  { label: 'Violence', value: 'violence' },
  { label: 'Sexuel', value: 'sexual' },
  { label: 'Autre', value: 'other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];
