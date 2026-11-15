import { emptyPersonal, type Personal, type Snapshot } from './model'

const database = new Promise<IDBDatabase>((resolve, reject) => {
  // Isolate installations when more than one Pages project uses the same domain.
  const request = indexedDB.open('edward-updates:' + new URL(import.meta.env.BASE_URL, location.href).pathname, 1)
  request.onupgradeneeded = () => request.result.createObjectStore('data')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
async function read<T>(key: string, fallback: T): Promise<T> {
  const db = await database
  return new Promise((resolve, reject) => {
    const request = db.transaction('data').objectStore('data').get(key)
    request.onsuccess = () => resolve(request.result ?? fallback)
    request.onerror = () => reject(request.error)
  })
}
export const readPersonal = () => read('personal', emptyPersonal)
export const readSnapshot = () => read<Snapshot | null>('snapshot', null)
export async function storeSnapshot(snapshot: Snapshot) {
  const db = await database
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite')
    tx.objectStore('data').put(snapshot, 'snapshot')
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })
}
const changes = new BroadcastChannel('edward-updates:' + new URL(import.meta.env.BASE_URL, location.href).pathname)
export function subscribe(callback: () => void) {
  changes.addEventListener('message', callback)
  return () => changes.removeEventListener('message', callback)
}
export async function updatePersonal(update: (current: Personal) => Personal) {
  const db = await database
  return new Promise<Personal>((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite')
    const store = tx.objectStore('data')
    const request = store.get('personal')
    let next: Personal
    request.onsuccess = () => {
      next = update(request.result ?? emptyPersonal)
      store.put(next, 'personal')
    }
    tx.oncomplete = () => { changes.postMessage('personal'); resolve(next) }
    tx.onabort = () => reject(tx.error)
  })
}
