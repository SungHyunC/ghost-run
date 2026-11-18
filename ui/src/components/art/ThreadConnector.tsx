/** Decorative red thread line between the two ends of a found thread. */
export function ThreadConnector() {
  return (
    <svg className="gk-thread-line" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M2 12C40 2 80 22 118 12" />
      <circle className="gk-thread-dot" cx="2" cy="12" r="3" />
      <circle className="gk-thread-dot" cx="118" cy="12" r="3" />
    </svg>
  );
}
