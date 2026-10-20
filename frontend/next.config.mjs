/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // The commit this build is (block 42): Netlify sets COMMIT_REF during the
    // build; it ends up in <meta name="pw-build"> and /version.json.
    NEXT_PUBLIC_PW_BUILD: process.env.COMMIT_REF || process.env.NEXT_PUBLIC_PW_BUILD || 'local',
  },
};

export default nextConfig;
