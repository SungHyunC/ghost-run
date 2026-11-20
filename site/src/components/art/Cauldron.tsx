export function Cauldron() {
  return (
    <svg viewBox="0 0 160 126" aria-hidden="true">
      <g fill="#9be564">
        <circle className="bub" cx="58" cy="52" r="5" />
        <circle className="bub d2" cx="96" cy="50" r="6.5" />
        <circle className="bub d3" cx="78" cy="54" r="4" />
      </g>
      <g className="cauldron-boo">
        <svg x="54" y="0" width="52" height="56" viewBox="0 0 120 130">
          <use href="#boo" />
        </svg>
      </g>
      <path d="M24 62q0 52 56 52t56-52z" fill="#2b2140" />
      <ellipse cx="80" cy="60" rx="54" ry="11" fill="#9be564" />
      <ellipse cx="80" cy="60" rx="58" ry="12" fill="none" stroke="#45386a" strokeWidth="7" />
      <path d="M48 108l-8 14M112 108l8 14" stroke="#2b2140" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
