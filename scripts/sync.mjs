import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createSnapshot, importTab, isoDay, warsawDay } from './import.mjs'

const exec = promisify(execFile)
const previewFolder = process.argv[2]
const sources = {
  job: '19_-cFTKMgHJEVmUMDMzymeg6c_lDGUd1fHJckE3uwm0',
  event: '1dDfRSxGa9_XQdhg-yfVOL262wx_QZmGaJbJlSH3LGr0'
}
const today = process.env.SYNC_DATE || warsawDay()
if (!isoDay(today)) throw Error('Invalid synchronization date')

async function collect(kind, id) {
  const path = previewFolder && previewFolder + '/' + kind
  const tabs = path ? (await readdir(path)).filter(file => file.endsWith('.csv')).map(file => file.slice(0, -4)) :
    JSON.parse((await exec('python3', ['scripts/sheets.py', id], { timeout: 45_000 })).stdout)
  if (!path && !tabs.some(tab => isoDay(tab) === today)) throw Error('No current Warsaw-date tab for ' + kind)
  const selected = tabs.filter(tab => {
    const day = isoDay(tab)
    if (!day) return false
    if (path) return true
    const offset = (Date.parse(day) - Date.parse(today)) / 86_400_000
    return kind === 'job' ? offset <= 0 && offset >= -90 : offset >= 0 && offset <= 6
  }).sort((a, b) => isoDay(b).localeCompare(isoDay(a)))
  if (!selected.length) throw Error('Missing dated tabs for ' + kind)
  const records = []
  for (let offset = 0; offset < selected.length; offset += 5) {
    const batch = await Promise.all(selected.slice(offset, offset + 5).map(async tab => {
      const csv = path ? await readFile(path + '/' + tab + '.csv', 'utf8') : await download(id, tab)
      return importTab(kind, tab, csv, { omitNotes: true })
    }))
    records.push(...batch.flat())
  }
  return records
}
async function download(id, tab) {
  const url = new URL('https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq')
  url.search = new URLSearchParams({ tqx: 'out:csv', sheet: tab, headers: '1' }).toString()
  let failure
  for (const delay of [0, 1000, 3000]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(25_000) })
      if (!response.ok || !response.headers.get('content-type')?.includes('csv')) throw Error('CSV unavailable for ' + tab)
      return await response.text()
    } catch (error) { failure = error }
  }
  throw failure
}
const [jobs, events] = await Promise.all(Object.entries(sources).map(([kind, id]) => collect(kind, id)))
const root = previewFolder ? '.preview' : 'public/data'
if (!previewFolder && (!jobs.length || !events.length)) throw Error('Both feeds must contain listings')
const historyFile = 'scripts/first-seen.json'
const prior = previewFolder ? null : await readFile(historyFile, 'utf8').then(JSON.parse, error => {
  if (error.code !== 'ENOENT') throw error
  return null
})
const { snapshot, firstSeen } = createSnapshot({ jobs, events, prior, preview: !!previewFolder })
await mkdir(root, { recursive: true })
const previousFile = await readFile(root + '/latest.json', 'utf8').then(text => JSON.parse(text).file, error => {
  if (error.code !== 'ENOENT') throw error
  return ''
})
const filename = previewFolder ? 'snapshot-preview.json' : 'snapshot-' + randomUUID() + '.json'
async function write(path, data) {
  await writeFile(path + '.tmp', JSON.stringify(data) + '\n')
  await rename(path + '.tmp', path)
}
await write(root + '/' + filename, snapshot)
if (!previewFolder) await write(historyFile, { firstSeen })
await write(root + '/latest.json', { file: filename, updatedAt: snapshot.updatedAt, preview: snapshot.preview })
if (!previewFolder) {
  for (const file of await readdir(root)) {
    if (/^snapshot-[\w-]+\.json$/.test(file) && file !== previousFile && file !== filename) await unlink(root + '/' + file)
  }
}
console.log('Prepared %d jobs and %d events%s', snapshot.jobs.length, snapshot.events.length, previewFolder ? ' for local preview' : '')
