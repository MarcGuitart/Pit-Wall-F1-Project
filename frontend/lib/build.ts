/**
 * The commit this build was made from (block 42): Netlify's COMMIT_REF,
 * inlined at build time by next.config.mjs; "local" outside Netlify. Shown in
 * <meta name="pw-build"> and /version.json so a smoke test can tell which
 * build is live. Nothing else: no branch, no time, no environment.
 */
export const BUILD_COMMIT: string = process.env.NEXT_PUBLIC_PW_BUILD || 'local'

export function buildInfo(commit: string = BUILD_COMMIT): { commit: string; short: string } {
  return { commit, short: /^[0-9a-f]{7,40}$/.test(commit) ? commit.slice(0, 7) : commit }
}
