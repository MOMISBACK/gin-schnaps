import React from 'react';

/** Supplemental conventions only. Errors and data-loss warnings stay outside. */
export function HelpDetails({ label = 'Details', children }: {
  label?: string; children: React.ReactNode;
}) {
  return <details className="context-help"><summary>{label}</summary><div>{children}</div></details>;
}
