/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // The commit this build is (block 42): Netlify sets COMMIT_REF during the
    // build; it ends up in <meta name="pw-build"> and /version.json.
    NEXT_PUBLIC_PW_BUILD: process.env.COMMIT_REF || process.env.NEXT_PUBLIC_PW_BUILD || 'local',
    // Always a literal, also when unset (block 52b): an undefined NEXT_PUBLIC_
    // variable is left as a runtime lookup, so the bundler could not drop the
    // payment code behind the flag (lib/paymentsFlag.ts) from shared chunks.
    NEXT_PUBLIC_PAYMENTS_ENABLED: process.env.NEXT_PUBLIC_PAYMENTS_ENABLED || '',
    // The same for the telemetry files' base URL (block 52b): unset, it would be
    // a runtime process.env lookup, which pulls Node's
    // process polyfill into the shared bundle. '' means the API only.
    NEXT_PUBLIC_TELEMETRY_URL: process.env.NEXT_PUBLIC_TELEMETRY_URL || '',
  },
  // The redesign prototype is the site now: /preview and everything under it
  // go home. Temporary (307), so the decision can be undone without browsers
  // having cached a permanent answer.
  async redirects() {
    return [
      { source: '/preview', destination: '/', permanent: false },
      { source: '/preview/:path*', destination: '/', permanent: false },
    ];
  },
};

export default nextConfig;
