import type { ReactElement } from 'react';
import type { PartIconId } from '../copy';

/** Original 40x40 icons for the six kit parts. Decorative. */
export function PartIcon({ id, className }: { id: PartIconId; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      {ICONS[id]}
    </svg>
  );
}

const ICONS: Record<PartIconId, ReactElement> = {
  mirror: (
    <>
      <ellipse cx="20" cy="16" rx="11" ry="13" fill="#cfe9ff" stroke="#b48cff" strokeWidth="3.2" />
      <path d="M15 9q-3 4-2 9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <rect x="17.3" y="29" width="5.4" height="10" rx="2.7" fill="#b48cff" />
    </>
  ),
  candle: (
    <>
      <rect x="13" y="16" width="14" height="21" rx="3.5" fill="#fff1d6" />
      <path d="M13 21q3 3.2 6 0" stroke="#efd9ad" strokeWidth="2" fill="none" />
      <path d="M20 3q6.5 6 0 11.5q-6.5-5.5 0-11.5z" fill="#ffb347" />
      <circle cx="17.5" cy="25.5" r="1.3" fill="#2a1b3d" />
      <circle cx="22.5" cy="25.5" r="1.3" fill="#2a1b3d" />
      <path d="M18 29q2 1.6 4 0" stroke="#2a1b3d" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </>
  ),
  blacklight: (
    <>
      <path d="M16 21L38 8v27z" fill="#b48cff" opacity=".5" />
      <rect x="2" y="16" width="14" height="10" rx="3" fill="#6b4bd6" />
      <rect x="14.5" y="14" width="4.5" height="14" rx="1.6" fill="#8a6cf0" />
      <circle cx="29" cy="21.5" r="2.4" fill="#fff" />
    </>
  ),
  thread: (
    <>
      <circle cx="9" cy="10" r="4.5" fill="#ff6b7a" />
      <circle cx="31" cy="30" r="4.5" fill="#ff6b7a" />
      <path d="M9 10C22 10 14 30 31 30" stroke="#ff6b7a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1.6" fill="#fff" />
      <circle cx="31" cy="30" r="1.6" fill="#fff" />
    </>
  ),
  tomb: (
    <>
      <path d="M9 36V17a11 11 0 0 1 22 0v19z" fill="#9a93b3" />
      <rect x="5" y="34.5" width="30" height="4.5" rx="2.2" fill="#5d8a3a" />
      <path d="M20 14v10M15 18h10" stroke="#2a1b3d" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  bulb: (
    <>
      <path d="M20 4a11 11 0 0 0-6.5 19.9c1.4 1 2 2.3 2 3.8V30h9v-2.3c0-1.5.6-2.8 2-3.8A11 11 0 0 0 20 4z" fill="#ffd36b" />
      <rect x="15" y="31" width="10" height="3.5" rx="1.5" fill="#cdbf9f" />
      <rect x="16.5" y="35" width="7" height="3" rx="1.5" fill="#a99a78" />
      <path d="M15 13q2-5 7-5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".8" />
    </>
  ),
};
