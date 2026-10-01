const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY

// Dutch relative-time phrasing (e.g. "18 minuten geleden"), falling back to
// an absolute date beyond a month so a comment's age never reads as vague.
export function formatRelativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)

  if (seconds < MINUTE) return 'zojuist'
  if (seconds < HOUR) {
    const minutes = Math.floor(seconds / MINUTE)
    return `${minutes} ${minutes === 1 ? 'minuut' : 'minuten'} geleden`
  }
  if (seconds < DAY) {
    const hours = Math.floor(seconds / HOUR)
    return `${hours} uur geleden`
  }
  if (seconds < MONTH) {
    const days = Math.floor(seconds / DAY)
    return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`
  }
  return new Date(iso).toLocaleDateString('nl-NL')
}
