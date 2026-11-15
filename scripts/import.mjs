import { createHash } from 'node:crypto'
import Papa from 'papaparse'

const JOB = {
  top: '⭐', title: 'Вакансія', category: 'Категорія', company: 'Компанія',
  description: 'Опис', salary: 'Зарплата', employment: 'Зайнятість', location: 'Адреса',
  map: 'Карта', url: 'Посилання', published: 'Дата публікації', notes: 'Примітки'
}
const EVENT = {
  emoji: 'Emoji', title: 'Подія', category: 'Категорія', top: 'Топ', eventType: 'Тип', time: 'Час',
  location: 'Місце', address: 'Адреса', travel: 'Час в дорозі (з Охоти)', price: 'Ціна',
  url: 'Посилання', directions: 'Як дістатись (з Охоти)', notes: 'Примітки', description: 'Деталі'
}
export const warsawDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
export function isoDay(value) {
  const parts = /^(\d\d)\.(\d\d)\.(\d{4})$/.exec(value)
  const day = parts ? [parts[3], parts[2], parts[1]].join('-') : value
  const parsed = new Date(day + 'T12:00:00Z')
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === day ? day : ''
}
export function httpUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const key = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const idFor = (kind, parts) => kind + '-' + createHash('sha256').update(JSON.stringify(parts.map(key))).digest('hex').slice(0, 24)
export function normalizeTime(value) {
  const cleaned = value.trim()
  if (/^0?(?:\.\d+)?$/.test(cleaned) && cleaned) {
    const minutes = Math.min(1439, Math.round(Number(cleaned) * 1440))
    return [Math.floor(minutes / 60), minutes % 60].map(part => String(part).padStart(2, '0')).join(':')
  }
  return cleaned.replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?/g, (_, hour, minutes) => hour.padStart(2, '0') + ':' + minutes)
}
export function importTab(kind, tab, csv, options = {}) {
  const day = isoDay(tab)
  if (!day) throw Error('Invalid worksheet date: ' + tab)
  const fields = kind === 'job' ? JOB : EVENT
  const result = Papa.parse(csv, { delimiter: ',', skipEmptyLines: 'greedy' })
  const [header, ...rows] = result.data
  if (result.errors.length || !header || !Object.values(fields).every(name => header.some(column => column.trim() === name))) {
    throw Error('Invalid ' + kind + ' CSV headers or quoting in ' + tab)
  }
  const columns = Object.entries(fields).map(([key, name]) => [key, header.findIndex(column => column.trim() === name)])
  return rows.map((row, index) => {
    const record = Object.fromEntries(columns.map(([field, column]) => [field, (row[column] || '').trim()]))
    if (!record.title || row.length > header.length) throw Error('Invalid ' + kind + ' row ' + (index + 2) + ' in ' + tab)
    record.top = record.top.includes('⭐')
    if (options.omitNotes) {
      record.notes = ''
      // Some descriptions include editorial remarks about the applicant.
      record.description = record.description.replace(/[^.!?\n]*(?:Edward|Едвард|Perelyhin|Перел[ие]г[іи]н)[^.!?\n]*[.!?]?/giu, '').trim()
    }
    record.kind = kind
    record.url = httpUrl(record.url)
    if (kind === 'job') {
      record.map = httpUrl(record.map)
      record.published = isoDay(record.published) || record.published
      record.id = idFor(kind, [record.title, record.company, record.location])
    } else {
      record.directions = httpUrl(record.directions)
      record.time = normalizeTime(record.time)
      record.date = day
      record.id = idFor(kind, [record.title, record.date, record.location || record.address])
    }
    return record
  })
}
export function createSnapshot({ jobs, events, prior, now = new Date(), preview = false }) {
  const date = warsawDay(now)
  const history = { ...(prior?.firstSeen || {}) }
  const distinct = records => {
    const found = new Map()
    for (const record of records) {
      const existing = found.get(record.id)
      if (!existing) { found.set(record.id, record); continue }
      const merged = { ...existing }
      for (const [field, value] of Object.entries(record)) if (!merged[field] && value) merged[field] = value
      found.set(record.id, merged)
    }
    return [...found.values()]
  }
  return {
    firstSeen: history,
    snapshot: {
      updatedAt: preview ? null : now.toISOString(),
      ...(preview && { preview: true }),
      jobs: distinct(jobs).map(job => ({ ...job, firstSeen: history[job.id] ||= date })),
      events: distinct(events)
    }
  }
}
