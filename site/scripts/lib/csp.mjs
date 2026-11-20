// The Content-Security-Policy of the Landing_Page, in one place (site-live Requirement 14,
// criteria 1 and 2). `vite.config.ts` reads the meta form, `headers.mjs` reads the header form,
// so the two cannot differ except by `frame-ancestors`, which a meta tag cannot set.

/** Ordered directives of the policy for `/` and `/index.html`. */
export const LANDING_CSP_PARTS = Object.freeze([
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
]);

/** @returns {string} the policy of the `_headers` blocks for `/` and `/index.html` */
export function landingHeaderPolicy() {
  return LANDING_CSP_PARTS.join('; ');
}

/** @returns {string} the same policy without `frame-ancestors`, for the meta tag */
export function landingMetaPolicy() {
  return LANDING_CSP_PARTS.filter((part) => !part.startsWith('frame-ancestors')).join('; ');
}
