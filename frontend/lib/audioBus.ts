/**
 * One audio playing at a time across the whole app. Every RadioClipPlayer
 * calls `claim(el)` right before playing; the previously claimed element is
 * paused. No Web Audio, no fetch — the F1 CDN sends no CORS headers, so only
 * the media element itself may touch the file.
 */
let current: HTMLAudioElement | null = null

export function claimAudio(el: HTMLAudioElement): void {
  if (current && current !== el && !current.paused) current.pause()
  current = el
}

export function releaseAudio(el: HTMLAudioElement): void {
  if (current === el) current = null
}
