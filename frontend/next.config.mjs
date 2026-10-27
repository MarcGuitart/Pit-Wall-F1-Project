/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // The commit this build is (block 42): Netlify sets COMMIT_REF during the
    // build; it ends up in <meta name="pw-build"> and /version.json.
    NEXT_PUBLIC_PW_BUILD: process.env.COMMIT_REF || process.env.NEXT_PUBLIC_PW_BUILD || 'local',
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
