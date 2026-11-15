import { useEffect, useRef, useState } from 'react'
import { isObject, isOpportunity, localDate, type Snapshot } from './model'
import { readSnapshot, storeSnapshot } from './storage'

const BASE = import.meta.env.BASE_URL
type Manifest = { file: string; updatedAt: string | null; preview?: boolean }
export function useFeed(editing: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [pending, setPending] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const current = useRef<Snapshot | null>(null)
  useEffect(() => {
    if (!editing && pending) { setSnapshot(pending); setPending(null) }
  }, [editing, pending])
  useEffect(() => {
    let active = true
    let checking = false
    const sessionDay = localDate()
    let checkedDay = sessionDay
    const check = async () => {
      if (checking) return
      checking = true
      try {
        let folder = BASE + (import.meta.env.DEV ? 'preview/' : 'data/')
        let response = await fetch(folder + 'latest.json', { cache: 'no-store' })
        if (import.meta.env.DEV && !response.ok && folder.endsWith('preview/')) {
          folder = BASE + 'data/'
          response = await fetch(folder + 'latest.json', { cache: 'no-store' })
        }
        if (!response.ok) throw Error('Feed unavailable')
        const manifest: Manifest = await response.json()
        if (!/^snapshot(?:-[\w-]+)?\.json$/.test(manifest.file)) throw Error('Invalid version')
        if (!manifest.preview && current.current && manifest.updatedAt === current.current.updatedAt && !!manifest.preview === !!current.current.preview) {
          if (active) setUnavailable(false)
          return
        }
        const file = await fetch(folder + manifest.file, manifest.preview ? { cache: 'no-store' } : undefined)
        if (!file.ok) throw Error('Snapshot unavailable')
        const data: unknown = await file.json()
        if (!isObject(data) || data.updatedAt !== manifest.updatedAt || !Array.isArray(data.jobs) || !Array.isArray(data.events) ||
          !data.jobs.every(item => isOpportunity(item) && item.kind === 'job') ||
          !data.events.every(item => isOpportunity(item) && item.kind === 'event')) throw Error('Invalid snapshot')
        if (!active) return
        current.current = data as Snapshot
        setPending(current.current)
        void storeSnapshot(current.current).catch(() => {})
      } catch {
        if (active) setUnavailable(true)
        return
      } finally {
        checking = false
        if (active) setLoading(false)
      }
      if (active) setUnavailable(false)
    }
    void readSnapshot().then(cached => {
      if (active && cached) { current.current = cached; setSnapshot(cached); setLoading(false) }
    }).catch(() => {}).finally(() => { if (active) void check() })
    const onVisible = () => {
      const now = new Date()
      const day = localDate(now)
      const time = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(now)
      if (document.visibilityState === 'visible' && day > checkedDay && time >= '07:05' && !checking) {
        checkedDay = day
        void check()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
  return { snapshot, loading, unavailable }
}
