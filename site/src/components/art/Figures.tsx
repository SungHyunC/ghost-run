// The three costume figures of section 2. Markup copied from docs/design/landing-mockup.html.
// All three sit over the same <use href="#bones"/> so the skeletons are identical.

export function ShellFigure() {
  return (
    <svg className="fig" viewBox="0 -10 120 182" aria-hidden="true">
      <path className="costume" d="M19 54a41 43 0 0 1 82 0v32q-41 11-82 0z" fill="#6b4bd6" />
      <use href="#bones" />
      <g className="costume">
        <path d="M37 86h46q10 0 12 11l5 37q-40 9-80 0l5-37q2-11 12-11z" fill="#7c5cf0" />
        <path d="M48 93L37 113M72 93L83 113" stroke="#7c5cf0" strokeWidth="13" strokeLinecap="round" />
        <rect x="48" y="101" width="24" height="16" rx="4.5" fill="#1b1230" />
        <text
          x="60"
          y="113"
          textAnchor="middle"
          fontSize="10"
          fontFamily="ui-monospace,Menlo,monospace"
          fill="#aef5df"
          fontWeight="700"
        >
          &gt;_
        </text>
        <path d="M54 88v7M66 88v7" stroke="#d9cbff" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function HandFigure() {
  return (
    <svg className="fig" viewBox="0 -10 120 182" aria-hidden="true">
      <use href="#bones" />
      <g className="costume">
        <path d="M60 10V-1" stroke="#a9b2c6" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="60" cy="-3" r="4.5" fill="#ff6b7a" />
        <circle cx="24.5" cy="46" r="6.5" fill="#a9b2c6" stroke="#7d869b" strokeWidth="2" />
        <circle cx="95.5" cy="46" r="6.5" fill="#a9b2c6" stroke="#7d869b" strokeWidth="2" />
        <rect x="35" y="86" width="50" height="52" rx="11" fill="#b4bccd" stroke="#7d869b" strokeWidth="2.5" />
        <circle cx="49" cy="100" r="3.6" fill="#9be564" />
        <circle cx="60" cy="100" r="3.6" fill="#ffd36b" />
        <circle cx="71" cy="100" r="3.6" fill="#ff6b7a" />
        <path d="M46 114h28M46 121h28M46 128h28" stroke="#8b94a8" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M47 94L35 114M73 94L85 114" stroke="#b4bccd" strokeWidth="12" strokeLinecap="round" />
        <path d="M86 117l8 9M86 117l-1 12" stroke="#7d869b" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function CloudFigure() {
  return (
    <svg className="fig" viewBox="0 -10 120 182" aria-hidden="true">
      <use href="#bones" />
      <g className="costume">
        <path d="M39 17h42l-6-17h-30z" fill="#ffb057" />
        <ellipse cx="60" cy="17" rx="29" ry="5.5" fill="#ff8a3d" />
        <text x="60" y="12" textAnchor="middle" fontSize="8" fontWeight="700" fill="#2a1b3d" fontFamily="Fredoka,system-ui">
          S3
        </text>
        <g fill="#eef3ff" stroke="#c9d6f2" strokeWidth="1.5">
          <circle cx="41" cy="108" r="15" />
          <circle cx="79" cy="108" r="15" />
          <circle cx="60" cy="99" r="18" />
          <circle cx="48" cy="124" r="14" />
          <circle cx="72" cy="124" r="14" />
          <circle cx="60" cy="117" r="16" />
        </g>
        <path d="M47 112q3 3 6 0M67 112q3 3 6 0" stroke="#9fb3dc" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
