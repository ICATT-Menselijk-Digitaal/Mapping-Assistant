// The app is only used in the Netherlands, so timestamps are stored and
// exported as the browser's local (= Amsterdam) time in a form people can
// read: "2026-10-21 14:18:12".
const pad = (n: number) => String(n).padStart(2, '0')

export function formatAmsterdamTime(date: Date = new Date()): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${day} ${time}`
}

// Turns a stored timestamp back into a Date, e.g. for "18 minuten geleden".
// With the space swapped for a "T", Date reads it as local time. ISO values
// saved before this format ("2026-10-21T12:18:12.348Z") are read as they are.
export function parseAmsterdamTime(timestamp: string): Date {
  return new Date(timestamp.replace(' ', 'T'))
}
