// The one SVG sprite sheet. Mounted once, before any <use>. Path data and
// viewBoxes are copied unchanged from docs/design/landing-mockup.html.

export const SYMBOL_IDS = [
  'boo',
  'bones',
  'pumpkin',
  'bat',
  'i-mirror',
  'i-ward',
  'i-candle',
  'i-blacklight',
  'i-tomb',
  'i-hook',
  'i-hat',
  'i-folder',
  'i-file',
  'i-db',
  'i-bucket',
  'i-lock',
] as const;

export type SymbolId = (typeof SYMBOL_IDS)[number];

export function Sprite() {
  return (
    <svg width={0} height={0} className="sprite" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="boo" viewBox="0 0 120 130">
          <path
            d="M62 8C88 8 106 28 106 56C106 78 103 96 95 109C91 116 84 117 80 111C76 118 66 120 61 113C55 121 44 120 39 112C32 119 20 125 8 121C19 114 23 104 23 92C21 76 19 64 19 54C19 27 38 8 62 8Z"
            fill="#fbf8ff"
          />
          <ellipse cx="69" cy="50" rx="6.4" ry="10.5" fill="#1b1030" />
          <ellipse cx="89" cy="50" rx="6.4" ry="10.5" fill="#1b1030" />
          <circle cx="71.3" cy="45" r="2.4" fill="#fff" />
          <circle cx="91.3" cy="45" r="2.4" fill="#fff" />
          <ellipse cx="58.5" cy="67" rx="6.5" ry="3.6" fill="#ff9ec7" opacity=".85" />
          <ellipse cx="98.5" cy="67" rx="4.8" ry="3.2" fill="#ff9ec7" opacity=".85" />
          <path
            d="M75 66q4.5 4.6 9 0"
            stroke="#1b1030"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="bones" viewBox="0 -10 120 182">
          <g className="bs" strokeWidth="6.5" strokeLinecap="round" fill="none">
            <path d="M60 84V136" />
            <path d="M42 96q18 12 36 0" />
            <path d="M44.5 107.5q15.5 10 31 0" />
            <path d="M47 119q13 8.5 26 0" />
            <path d="M45 137q15 11 30 0" />
            <path d="M50 90L33 118" />
            <path d="M70 90L87 118" />
            <path d="M53 142L47 163" />
            <path d="M67 142L73 163" />
          </g>
          <g className="bf">
            <circle cx="32.5" cy="120" r="5.5" />
            <circle cx="87.5" cy="120" r="5.5" />
            <ellipse cx="45" cy="165" rx="8" ry="4.5" />
            <ellipse cx="75" cy="165" rx="8" ry="4.5" />
            <circle cx="60" cy="44" r="34" />
            <rect x="42" y="63" width="36" height="21" rx="9.5" />
          </g>
          <ellipse cx="47" cy="45" rx="9.5" ry="11.5" fill="#2a1b3d" />
          <ellipse cx="73" cy="45" rx="9.5" ry="11.5" fill="#2a1b3d" />
          <circle cx="50.5" cy="40" r="3.2" fill="#fff" />
          <circle cx="76.5" cy="40" r="3.2" fill="#fff" />
          <path d="M57 57.5h6l-3 5z" fill="#2a1b3d" />
          <path
            d="M50 70.5v8M55 70.5v9M60 70.5v9M65 70.5v9M70 70.5v8"
            stroke="#cdbb92"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <ellipse cx="35.5" cy="60" rx="6.5" ry="3.4" fill="#ff9ec7" opacity=".85" />
          <ellipse cx="84.5" cy="60" rx="6.5" ry="3.4" fill="#ff9ec7" opacity=".85" />
        </symbol>
        <symbol id="pumpkin" viewBox="0 0 64 58">
          <path
            d="M31 12q1-8 8-10"
            stroke="#5d8a3a"
            strokeWidth="4.5"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="32" cy="35" rx="29" ry="21.5" fill="#ff8a3d" />
          <ellipse
            cx="32"
            cy="35"
            rx="12"
            ry="21.5"
            fill="none"
            stroke="#e46d1e"
            strokeWidth="2.6"
          />
          <ellipse
            cx="32"
            cy="35"
            rx="21"
            ry="21.5"
            fill="none"
            stroke="#e46d1e"
            strokeWidth="2"
            opacity=".55"
          />
          <path d="M19 32l5.5-7 5.5 7zM34 32l5.5-7 5.5 7z" fill="#ffd36b" />
          <path
            d="M20 39q12 11 24 0q-3 1-5 0l-2.5 3-2.5-3-3 3-2.5-3-2.5 3-2.5-3q-2 1-3.5 0z"
            fill="#ffd36b"
          />
        </symbol>
        <symbol id="bat" viewBox="0 0 60 30">
          <path
            d="M30 10C27 5 24 6 23 9C17 3 8 3 2 7C7 9 8 13 8 16C11 14 14 14 16 17C18 14 21 15 22 18C25 16 28 17 30 22C32 17 35 16 38 18C39 15 42 14 44 17C46 14 49 14 52 16C52 13 53 9 58 7C52 3 43 3 37 9C36 6 33 5 30 10Z"
            fill="#3a2363"
          />
          <circle cx="28.4" cy="12.4" r=".9" fill="#ffd36b" />
          <circle cx="31.6" cy="12.4" r=".9" fill="#ffd36b" />
        </symbol>
        <symbol id="i-mirror" viewBox="0 0 40 40">
          <ellipse
            cx="20"
            cy="16"
            rx="11"
            ry="13"
            fill="#cfe9ff"
            stroke="#b48cff"
            strokeWidth="3.2"
          />
          <path
            d="M15 9q-3 4-2 9"
            stroke="#fff"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <rect x="17.3" y="29" width="5.4" height="10" rx="2.7" fill="#b48cff" />
        </symbol>
        <symbol id="i-ward" viewBox="0 0 40 40">
          <path d="M20 3l14 5v10c0 9-6 16-14 19C12 34 6 27 6 18V8z" fill="#b48cff" />
          <path
            d="M20 11l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
            fill="#ffd36b"
          />
        </symbol>
        <symbol id="i-candle" viewBox="0 0 40 40">
          <rect x="13" y="16" width="14" height="21" rx="3.5" fill="#fff1d6" />
          <path d="M13 21q3 3.2 6 0" stroke="#efd9ad" strokeWidth="2" fill="none" />
          <path d="M20 3q6.5 6 0 11.5q-6.5-5.5 0-11.5z" fill="#ffb347" />
          <circle cx="17.5" cy="25.5" r="1.3" fill="#2a1b3d" />
          <circle cx="22.5" cy="25.5" r="1.3" fill="#2a1b3d" />
          <path
            d="M18 29q2 1.6 4 0"
            stroke="#2a1b3d"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="i-blacklight" viewBox="0 0 40 40">
          <path d="M16 21L38 8v27z" fill="#b48cff" opacity=".5" />
          <rect x="2" y="16" width="14" height="10" rx="3" fill="#6b4bd6" />
          <rect x="14.5" y="14" width="4.5" height="14" rx="1.6" fill="#8a6cf0" />
          <text
            x="29"
            y="25.5"
            fontSize="10"
            textAnchor="middle"
            fill="#fff"
            fontWeight="700"
            fontFamily="Fredoka,system-ui"
          >
            !
          </text>
        </symbol>
        <symbol id="i-tomb" viewBox="0 0 40 40">
          <path d="M9 36V17a11 11 0 0 1 22 0v19z" fill="#9a93b3" />
          <rect x="5" y="34.5" width="30" height="4.5" rx="2.2" fill="#5d8a3a" />
          <text
            x="20"
            y="25"
            fontSize="7.5"
            textAnchor="middle"
            fill="#2a1b3d"
            fontWeight="700"
            fontFamily="Fredoka,system-ui"
          >
            RIP
          </text>
        </symbol>
        <symbol id="i-hook" viewBox="0 0 40 40">
          <path
            d="M24 6v18a8 8 0 1 1-16 0"
            stroke="#9be564"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M8 24l-3-5.5" stroke="#9be564" strokeWidth="4" strokeLinecap="round" />
          <circle cx="24" cy="6" r="4" fill="#9be564" />
        </symbol>
        <symbol id="i-hat" viewBox="0 0 40 40">
          <path d="M21 3l8 24H11z" fill="#6b4bd6" />
          <path
            d="M21 3q7 2 10-2"
            stroke="#6b4bd6"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="20" cy="28" rx="17" ry="5" fill="#8a6cf0" />
          <rect x="12.5" y="22" width="15" height="4" rx="1" fill="#ffb057" />
          <path
            d="M21 11l1.4 2.9 3.2.4-2.3 2.2.6 3.1-2.9-1.5-2.9 1.5.6-3.1-2.3-2.2 3.2-.4z"
            fill="#ffd36b"
          />
        </symbol>
        <symbol id="i-folder" viewBox="0 0 24 24">
          <path
            d="M2 6.5A2.5 2.5 0 0 1 4.5 4H9l2 2.2h8.5A2.5 2.5 0 0 1 22 8.7v9.8a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5z"
            fill="#ffb057"
          />
        </symbol>
        <symbol id="i-file" viewBox="0 0 24 24">
          <path
            d="M6.5 2.5h7.5l5 5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20.5v-16.5a1.5 1.5 0 0 1 1.5-1.5z"
            fill="#efe9fb"
            stroke="#b9acd9"
          />
          <path d="M14 2.5v5h5" fill="#cfc4ea" />
        </symbol>
        <symbol id="i-db" viewBox="0 0 24 24">
          <ellipse cx="12" cy="5.5" rx="8" ry="3" fill="#b48cff" />
          <path
            d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13c0 1.7-3.6 3-8 3s-8-1.3-8-3z"
            fill="#8a6cf0"
          />
          <path
            d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"
            stroke="#c7a9ff"
            strokeWidth="1.5"
            fill="none"
          />
        </symbol>
        <symbol id="i-bucket" viewBox="0 0 40 40">
          <path d="M8.5 13q11.5-15 23 0" stroke="#8b94a8" strokeWidth="2" fill="none" />
          <path d="M8 13h24l-3 22a3 3 0 0 1-3 2.6H14A3 3 0 0 1 11 35z" fill="#ffb057" />
          <ellipse cx="20" cy="13" rx="12" ry="4" fill="#ff8a3d" />
          <ellipse cx="20" cy="13" rx="9" ry="2.6" fill="#7a3d12" />
        </symbol>
        <symbol id="i-lock" viewBox="0 0 16 16">
          <path
            d="M8 1l6 2.2v4.3c0 3.7-2.5 6.2-6 7.5C4.5 13.7 2 11.2 2 7.5V3.2z"
            fill="#b48cff"
          />
          <path
            d="M5.5 8l1.8 1.8L10.8 6"
            stroke="#fff"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}
