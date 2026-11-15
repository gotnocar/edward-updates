import { test } from 'node:test'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { createSnapshot, importTab, isoDay, normalizeTime, warsawDay } from './import.mjs'

const jobHeader = ['⭐','Вакансія','Категорія','Компанія','Опис','Зарплата','Зайнятість','Адреса','Карта','Посилання','Дата публікації','Примітки']
const job = ['⭐','Technical Support','IT','Example Company','Line one, “text”\nLine two','','','Warsaw','','https://example.com/jobs','15.11.2026','Internal note']
const jobs = (...rows) => importTab('job', '15.11.2026', Papa.unparse([jobHeader, ...rows]), { omitNotes: true })

test('parses quoted multiline fields, normalizes dates and preserves top picks', () => {
  const [record] = jobs(job)
  assert.equal(record.description, job[4])
  assert.equal(record.notes, '')
  assert.equal(record.published, '2026-11-15')
  assert.equal(record.top, true)
  assert.equal(jobs([...job.slice(0,4), 'Support role. Edward is a strong fit.', ...job.slice(5)])[0].description, 'Support role.')
})

test('fails closed on invalid CSV rather than returning a partial snapshot', () => {
  assert.throws(() => importTab('job', '15.11.2026', 'bad,headers\nhello,world'), /Invalid/)
  assert.throws(() => importTab('job', '15.11.2026', Papa.unparse([jobHeader, ['', '', 'wrong row']])), /Invalid/)
})
test('distinct jobs may share an aggregator URL, and duplicate jobs keep their discovery date', () => {
  const second = [...job]
  second[1] = 'IT Analyst'
  const updated = [...job]
  updated[4] = 'Updated description'
  updated[9] = 'https://example.com/jobs/new-link'
  const day1 = createSnapshot({ jobs: jobs(job, job, second), events: [], now: new Date('2026-11-15T05:55:00Z') })
  assert.equal(day1.snapshot.jobs.length, 2)
  const day2 = createSnapshot({ jobs: [], events: [], prior: day1, now: new Date('2026-11-16T05:55:00Z') })
  const day3 = createSnapshot({ jobs: jobs(updated), events: [], prior: day2, now: new Date('2026-11-17T05:55:00Z') })
  assert.equal(day3.snapshot.jobs[0].id, day1.snapshot.jobs[0].id)
  assert.equal(day3.snapshot.jobs[0].firstSeen, '2026-11-15')
})
test('derives event dates from the sheet and normalizes spreadsheet time encoding', () => {
  const eventHeader = ['Emoji','Подія','Категорія','Топ','Тип','Час','Місце','Адреса','Час в дорозі (з Охоти)','Ціна','Посилання','Як дістатись (з Охоти)','Примітки','Деталі','Зображення']
  const row = ['🎵', 'Concert', 'Music', '⭐', '', '0.625', 'Library', '', '', 'Free', 'https://example.com/', '', '', 'Live music', '']
  const [event] = importTab('event', '16.11.2026', Papa.unparse([eventHeader,row]))
  assert.equal(event.date, '2026-11-16')
  assert.equal(event.time, '15:00')
  assert.equal(event.emoji, '🎵')
  assert.equal(event.top, true)
  assert.equal(normalizeTime('9:30:00–11:00'), '09:30–11:00')
  assert.equal(isoDay('31.02.2026'), '')
})
test('Warsaw dates follow daylight saving time boundaries', () => {
  assert.equal(warsawDay(new Date('2026-07-01T22:05:00Z')), '2026-07-02')
  assert.equal(warsawDay(new Date('2026-01-01T22:05:00Z')), '2026-01-01')
  assert.equal(warsawDay(new Date('2026-01-01T23:05:00Z')), '2026-01-02')
})
