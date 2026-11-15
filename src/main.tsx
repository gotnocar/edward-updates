import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays,
  Bookmark, Check, ChevronDown, Clock3, Ellipsis, EyeOff, FileText, MapPin, Search, Settings2, Sparkles, X
} from 'lucide-react'
import { useFeed } from './feed'
import { readPersonal, subscribe, updatePersonal } from './storage'
import {
  displayDate, emptyPersonal, isProfile, localDate, readBackup, shiftDay, statuses, textKey, validUrl,
  type Application, type Event, type Job, type Opportunity, type Personal, type Profile, type Status
} from './model'
import './style.css'

type View = 'Jobs' | 'Events' | 'Saved'
const navigation = [{ name: 'Jobs', Icon: BriefcaseBusiness }, { name: 'Events', Icon: CalendarDays }, { name: 'Saved', Icon: Bookmark }] as const
const jobFilters = ['All Jobs', 'New Today', 'Top Picks', 'Saved', 'Applied'] as const
const eventFilters = ['All Upcoming', 'Today', 'Tomorrow', 'Next 7 Days', 'Saved'] as const
const number = new Intl.NumberFormat('en')
const lastUpdated = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' })
const LIST_SIZE = 100
const comingFirst = (a: Event, b: Event) => a.date.localeCompare(b.date) ||
  (a.time.match(/\d\d:\d\d/)?.[0] ?? '99:99').localeCompare(b.time.match(/\d\d:\d\d/)?.[0] ?? '99:99') || a.title.localeCompare(b.title)
const isApplied = (application?: Application) => !!application?.appliedAt || ['Applied', 'Interview', 'Rejected', 'Offer'].includes(application?.status ?? '')
const known = (value: string) => value && !/^(?:не вказано|невідомо|n\/a|—|-)(?:$|\s*\()/i.test(value) ? value : ''

function App() {
  const [view, setView] = useState<View>('Jobs')
  const [personal, setPersonal] = useState<Personal>(emptyPersonal)
  const [storageReady, setStorageReady] = useState(false)
  const [jobFilter, setJobFilter] = useState<typeof jobFilters[number]>('All Jobs')
  const [eventFilter, setEventFilter] = useState<typeof eventFilters[number]>('All Upcoming')
  const [savedTab, setSavedTab] = useState<'job' | 'event' | 'hidden'>('job')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [page, setPage] = useState(1)
  const [settings, setSettings] = useState(false)
  const [note, setNote] = useState<Job>()
  const [cv, setCV] = useState<Job>()
  const [feedback, setFeedback] = useState('')
  const [today, setToday] = useState(localDate)
  const [includeProfile, setIncludeProfile] = useState(false)
  const { snapshot, loading, unavailable } = useFeed(!!note || !!cv)
  useEffect(() => {
    const refresh = () => {
      void readPersonal().then(value => { setPersonal(value); setStorageReady(true) }).catch(() => setFeedback('Browser storage is unavailable.'))
    }
    refresh()
    return subscribe(refresh)
  }, [])
  useEffect(() => {
    const refresh = () => setToday(localDate())
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(''), 4200)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const commit = async (update: (current: Personal) => Personal) => {
    try { setPersonal(await updatePersonal(update)); return true }
    catch { setFeedback('Couldn’t save to this browser.'); return false }
  }
  const save = (record: Opportunity) => void commit(current => {
    const saved = { ...current.saved }
    if (saved[record.id]) delete saved[record.id]
    else saved[record.id] = record
    return { ...current, saved }
  })
  const updateJob = (job: Job, change: Partial<Application>) => commit(current => {
    const previous = current.applications[job.id] as Application | undefined
    const application: Application = { ...(previous ?? { status: 'Not Applied', note: '' }), ...change, job }
    if (change.status === 'Applied' && !application.appliedAt) application.appliedAt = new Date().toISOString()
    if (change.status === 'Not Applied' || change.status === 'Interested') delete application.appliedAt
    return { ...current, applications: { ...current.applications, [job.id]: application } }
  })
  const switchTo = (next: View) => { setView(next); setPage(1); window.scrollTo(0, 0) }
  const importFile = async (event: ChangeEvent<HTMLInputElement>, profile: boolean) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const value: unknown = JSON.parse(await file.text())
      if (profile) {
        if (!isProfile(value)) throw Error('Choose a valid CV profile JSON file.')
        if (await commit(current => ({ ...current, profile: value }))) setFeedback('CV profile imported.')
      } else {
        const restored = readBackup(value)
        if (await commit(current => ({
          saved: { ...current.saved, ...restored.saved },
          applications: { ...current.applications, ...restored.applications },
          profile: restored.profile ?? current.profile
        }))) setFeedback('Backup restored.')
      }
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Couldn’t read this file.') }
  }
  const saved = Object.values(personal.saved)
  const savedJobs = saved.filter(item => item.kind === 'job')
  const savedEvents = saved.filter(item => item.kind === 'event').sort(comingFirst)
  const allJobs = snapshot?.jobs ?? []
  const jobs = allJobs.filter(job => !personal.applications[job.id]?.hidden)
  const events = (snapshot?.events ?? []).filter(event => event.date >= today).sort(comingFirst)
  const applied = Object.values(personal.applications).filter(isApplied)
  const jobPool = jobFilter === 'Saved' ? savedJobs : jobFilter === 'Applied' ?
    Array.from(new Map([...applied.map(item => item.job), ...jobs.filter(job => isApplied(personal.applications[job.id]))].map(job => [job.id, job])).values()) : jobs
  const searchTerms = textKey(search).trim().split(/\s+/).filter(Boolean)
  const filteredJobs = jobPool.filter(job => {
    if (personal.applications[job.id]?.hidden) return false
    if (jobFilter === 'New Today' && job.firstSeen !== today) return false
    if (jobFilter === 'Top Picks' && !job.top) return false
    const text = textKey([job.title, job.company, job.description, job.location, job.category, job.employment].join(' '))
    return searchTerms.every(term => text.includes(term))
  }).sort((a, b) => {
    if ((a.firstSeen === today) !== (b.firstSeen === today)) return a.firstSeen === today ? -1 : 1
    const order = sort === 'new' ? -1 : 1
    const recent = (job: Job) => /^\d{4}-\d{2}-\d{2}$/.test(job.published) ? job.published : job.firstSeen
    return order * (a.firstSeen.localeCompare(b.firstSeen) || recent(a).localeCompare(recent(b)))
  })
  const pages = Math.max(1, Math.ceil(filteredJobs.length / LIST_SIZE))
  const currentPage = Math.min(page, pages)
  const visibleJobs = filteredJobs.slice((currentPage - 1) * LIST_SIZE, currentPage * LIST_SIZE)
  const matchingEvents = eventFilter === 'Saved' ? savedEvents : events.filter(event => {
    if (eventFilter === 'Today') return event.date === today
    if (eventFilter === 'Tomorrow') return event.date === shiftDay(today, 1)
    return eventFilter !== 'Next 7 Days' || event.date <= shiftDay(today, 6)
  })
  const savedItems = savedTab === 'hidden' ? Object.values(personal.applications).filter(item => item.hidden).map(item => allJobs.find(job => job.id === item.job.id) ?? item.job) : savedTab === 'job' ? savedJobs : savedEvents
  const stats = [
    { label: 'New today', count: jobs.filter(job => job.firstSeen === today).length, Icon: Sparkles, color: 'mint', action: () => { setJobFilter('New Today'); switchTo('Jobs') } },
    { label: 'Available jobs', count: jobs.length, Icon: BriefcaseBusiness, color: 'blue', action: () => { setJobFilter('All Jobs'); switchTo('Jobs') } },
    { label: 'Saved jobs', count: savedJobs.length, Icon: Bookmark, color: 'purple', action: () => { setSavedTab('job'); switchTo('Saved') } },
    { label: 'Applied jobs', count: applied.length, Icon: Check, color: 'sand', action: () => { setJobFilter('Applied'); switchTo('Jobs') } },
    { label: 'Upcoming events', count: events.length, Icon: CalendarDays, color: 'rose', action: () => { setEventFilter('All Upcoming'); switchTo('Events') } }
  ]
  const card = (record: Opportunity) => <OpportunityCard key={record.id} record={record} today={today}
    saved={!!personal.saved[record.id]} application={personal.applications[record.id]} storageReady={storageReady}
    onSave={() => save(record)} onCV={setCV} onNote={setNote} onUpdate={updateJob} />

  return <>
    <header className="topbar">
      <div className="top-inner">
        <button className="brand" onClick={() => switchTo('Jobs')} aria-label="Edward Updates 😎 home">
          <span className="brand-mark"><Sparkles size={19} strokeWidth={2.3} /></span>
          <span>Edward Updates 😎</span>
        </button>
        <nav className="navigation" aria-label="Main navigation">
          {navigation.map(({ name, Icon }) => <button key={name} onClick={() => switchTo(name)} aria-current={view === name ? 'page' : undefined}>
            <Icon size={17} /><span>{name}</span>
          </button>)}
        </nav>
        <button className="settings-button" aria-label="Settings" title="Settings" onClick={() => setSettings(true)}><Settings2 size={19} /></button>
      </div>
    </header>
    <main className="shell">
      <section className="intro">
        <div>
          <div className="city"><MapPin size={14} /> Warsaw, Poland</div>
          <h1>Edward Updates 😎</h1>
          <p>Your daily opportunities in Warsaw</p>
        </div>
        <div className="feed-state"><span className={snapshot?.updatedAt ? 'online' : ''} />
          {snapshot?.updatedAt ? 'Last updated: ' + lastUpdated.format(new Date(snapshot.updatedAt)) + ' Warsaw time' :
            snapshot?.preview ? 'Local preview · spreadsheet export' : 'Awaiting first daily sync'}
        </div>
      </section>
      {unavailable && <div className="notice" role="status">{snapshot ? 'Showing the last available snapshot.' : 'The opportunity feed is currently unavailable.'}</div>}
      <section className="stats" aria-label="Opportunity statistics">
        {stats.map(({ label, count, Icon, color, action }) => <button key={label} className="stat" onClick={action}>
          <span className={'stat-icon ' + color}><Icon size={17} /></span>
          <span className="stat-info"><strong>{number.format(count)}</strong><span>{label}</span></span>
        </button>)}
      </section>
      <section aria-labelledby="section-title" className="listing">
        <div className="section-top">
          <div><h2 id="section-title">{{ Jobs: 'Job opportunities', Events: 'Events in Warsaw', Saved: 'Saved opportunities' }[view]}</h2>
          <p>{{ Jobs: 'Browse and track roles that match your interests.', Events: 'Find something to do in the city.', Saved: 'Keep track of the opportunities you want to revisit.' }[view]}</p></div>
          {view === 'Jobs' && <label className="search"><Search size={17} /><input type="search" placeholder="Search jobs..." aria-label="Search jobs" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></label>}
        </div>
        <div className="filterbar">
          <div className="filters" aria-label={view + ' filters'}>
            {view === 'Jobs' && jobFilters.map(filter => <button key={filter} aria-pressed={filter === jobFilter} onClick={() => { setJobFilter(filter); setPage(1) }}>{filter}</button>)}
            {view === 'Events' && eventFilters.map(filter => <button key={filter} aria-pressed={filter === eventFilter} onClick={() => setEventFilter(filter)}>{filter}</button>)}
            {view === 'Saved' && ([['job', 'Saved Jobs'], ['event', 'Saved Events'], ['hidden', 'Hidden Jobs']] as const).map(([filter, label]) => <button key={filter} aria-pressed={filter === savedTab} onClick={() => setSavedTab(filter)}>{label}</button>)}
          </div>
          {view === 'Jobs' && <label className="sort"><ArrowDown size={15} /><select aria-label="Sort jobs" value={sort} onChange={event => { setSort(event.target.value as 'new' | 'old'); setPage(1) }}>
            <option value="new">Newest first</option><option value="old">Oldest first</option>
          </select><ChevronDown size={13} /></label>}
        </div>
        {view === 'Jobs' && (visibleJobs.length ? <>
          {([['New Today', true], ['Previous Opportunities', false]] as const).map(([label, fresh]) => {
            const group = visibleJobs.filter(job => (job.firstSeen === today) === fresh)
            return group.length > 0 && <div key={label} className="group"><h3>{label} <span>{group.length}</span></h3><div className="cards">{group.map(card)}</div></div>
          })}
          <div className="pagination"><span>{filteredJobs.length} jobs · Page {currentPage} of {pages}</span>
            <button disabled={currentPage <= 1} onClick={() => { setPage(currentPage - 1); document.querySelector('.listing')?.scrollIntoView() }}><ArrowLeft size={16} /> Previous</button>
            <button disabled={currentPage >= pages} onClick={() => { setPage(currentPage + 1); document.querySelector('.listing')?.scrollIntoView() }}>Next <ArrowRight size={16} /></button>
          </div>
        </> : <Empty icon={<BriefcaseBusiness />} title={loading ? 'Loading jobs…' : 'No jobs match this view'} detail={search ? 'Try a different search or filter.' : 'New listings appear after the daily update.'} />)}
        {view === 'Events' && (matchingEvents.length ? <div className="cards spaced">{matchingEvents.map(card)}</div> : <Empty icon={<CalendarDays />} title={loading ? 'Loading events…' : 'No events in this view'} detail={eventFilter === 'Saved' ? 'Save an event to find it here later.' : 'Try another date filter.'} />)}
        {view === 'Saved' && (savedItems.length ? <div className="cards spaced">{savedItems.map(card)}</div> : <Empty icon={savedTab === 'hidden' ? <EyeOff /> : <Bookmark />} title={savedTab === 'hidden' ? 'No hidden jobs' : savedTab === 'job' ? 'No saved jobs yet' : 'No saved events yet'} detail={savedTab === 'hidden' ? 'Jobs you hide can be restored from this view.' : 'Tap Save on an opportunity to keep a copy here.'} />)}
      </section>
    </main>
    {feedback && <div className="toast" role="status">{feedback}</div>}
    {settings && <Modal title="Settings" close={() => setSettings(false)}>
      <section className="modal-section"><h3>Browser data</h3><p>Saves, application history, and notes are stored on this browser and device. Clearing site data can remove them.</p>
        <label className="check"><input type="checkbox" checked={includeProfile} onChange={event => setIncludeProfile(event.target.checked)} /> Include the CV profile in this backup</label>
        <div className="modal-actions">
          <button className="primary" disabled={!storageReady} onClick={() => {
            const { saved, applications, profile } = personal
            downloadJson({ version: 1, saved, applications, ...(includeProfile && profile && { profile }) }, 'edward-backup-' + today + '.json')
          }}><ArrowDownToLine size={16} /> Export Backup</button>
          <label className="button file-button">Import Backup<input type="file" accept=".json,application/json" disabled={!storageReady} onChange={event => void importFile(event, false)} /></label>
        </div>
        <p>Import merges your records. Matching items use the backup’s version.</p>
      </section>
      <section className="modal-section"><h3>CV profile</h3><p>{personal.profile ? 'A CV profile is stored on this device.' : 'Load your private CV profile to generate tailored CVs.'}</p>
        <div className="modal-actions"><label className="button file-button"><FileText size={16} /> Import CV profile<input type="file" accept=".json,application/json" disabled={!storageReady} onChange={event => void importFile(event, true)} /></label>
          {personal.profile && <button className="button" onClick={() => void commit(current => ({ ...current, profile: undefined }))}>Remove profile</button>}
        </div>
      </section>
    </Modal>}
    {note && <NoteDialog job={note} application={personal.applications[note.id]} close={() => setNote(undefined)} update={updateJob} />}
    {cv && <CVDialog job={cv} profile={personal.profile} close={() => setCV(undefined)} onImport={event => void importFile(event, true)} />}
  </>
}

function Empty({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="empty"><span>{icon}</span><h3>{title}</h3><p>{detail}</p></div>
}
function OpportunityCard({ record, today, saved, application, storageReady, onSave, onCV, onNote, onUpdate }: {
  record: Opportunity; today: string; saved: boolean; application?: Application; storageReady: boolean
  onSave: () => void; onCV: (job: Job) => void; onNote: (job: Job) => void
  onUpdate: (job: Job, change: Partial<Application>) => Promise<boolean>
}) {
  const job = record.kind === 'job' ? record : undefined
  const event = record.kind === 'event' ? record : undefined
  const source = validUrl(record.url)
  const map = validUrl(job?.map ?? event?.directions ?? '')
  const Icon = job ? BriefcaseBusiness : CalendarDays
  const meta = job ? [known(job.company), known(job.employment)] : [event?.date && displayDate(event.date), event?.time, event?.eventType]
  return <article className="card">
    <div className="card-main">
      <span className={job ? 'card-icon blue' : 'card-icon mint'}>{event?.emoji || <Icon size={21} />}</span>
      <div className="card-content">
        <div className="card-title"><h3>{record.title}</h3>
          {record.top && <span className="badge top"><Sparkles size={12} /> Top Pick</span>}
          {job?.firstSeen === today && <span className="badge fresh">New</span>}
        </div>
        <div className="meta">{meta.filter(Boolean).map((item, index) => <span key={index}>{item}</span>)}</div>
        <div className="details">
          {known(record.location) && <span><MapPin size={14} />{map ? <a href={map} target="_blank" rel="noreferrer">{record.location}</a> : record.location}</span>}
          {event?.address && <span>{event.address}</span>}
          {event?.travel && <span><Clock3 size={14} />{event.travel}</span>}
          {known(job?.salary ?? event?.price ?? '') && <span className="price">{job?.salary || event?.price}</span>}
        </div>
        {record.description && <p className="description">{record.description}</p>}
        {record.notes && <p className="source-note">{record.notes}</p>}
        <div className="record-labels">
          {record.category && <span>{record.category}</span>}
          {job?.published && <span>{/^\d{4}-\d{2}-\d{2}$/.test(job.published) ? 'Published ' : ''}{job.published}</span>}
          {job?.firstSeen && <span>Discovered {job.firstSeen}</span>}
          {application?.status && application.status !== 'Not Applied' && <span className="applied-label">{application.status}{application.appliedAt && ' · ' + localDate(new Date(application.appliedAt))}</span>}
        </div>
      </div>
    </div>
    <div className="card-actions">
      {source && <a className="primary" href={source} target="_blank" rel="noreferrer">{job ? 'View Job' : 'View Event'} <ArrowUpRight size={15} /></a>}
      <button className="button" disabled={!storageReady} onClick={onSave} aria-pressed={saved}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}</button>
      {job && <>
        <button className="button" disabled={!storageReady} onClick={() => onCV(job)}><FileText size={15} /> Generate CV</button>
        <button className="button" disabled={!storageReady || isApplied(application)} onClick={() => void onUpdate(job, { status: 'Applied' })}><Check size={15} /> {isApplied(application) ? 'Applied' : 'Mark as Applied'}</button>
        <button className="overflow button" aria-label={'Application details for ' + job.title} title="Status, notes, and visibility" disabled={!storageReady} onClick={() => onNote(job)}><Ellipsis size={20} /></button>
      </>}
    </div>
  </article>
}
function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  useEffect(() => {
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [dialog])
  return <dialog ref={setDialog} className={wide ? 'wide' : ''} onCancel={event => { event.preventDefault(); close() }} aria-labelledby="dialog-title">
    <div className="dialog-top"><h2 id="dialog-title">{title}</h2><button className="settings-button" aria-label="Close dialog" onClick={close}><X size={20} /></button></div>
    {children}
  </dialog>
}
function NoteDialog({ job, application, close, update }: { job: Job; application?: Application; close: () => void; update: (job: Job, change: Partial<Application>) => Promise<boolean> }) {
  const [status, setStatus] = useState(application?.status ?? 'Not Applied')
  const [note, setNote] = useState(application?.note ?? '')
  const [hidden, setHidden] = useState(!!application?.hidden)
  const [busy, setBusy] = useState(false)
  return <Modal title="Application details" close={close}>
    <p className="dialog-subtitle">{job.title}</p>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); if (await update(job, { status, note, hidden })) close(); else setBusy(false) }}>
      <label className="field">Status<select value={status} onChange={event => setStatus(event.target.value as Status)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="field">Notes<textarea rows={5} value={note} onChange={event => setNote(event.target.value)} placeholder="Add a private note…" /></label>
      <label className="check"><input type="checkbox" checked={hidden} onChange={event => setHidden(event.target.checked)} /> Hide from the jobs list</label>
      <div className="modal-actions"><button className="primary" disabled={busy} type="submit">Save details</button></div>
    </form>
  </Modal>
}
function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}
function CVDialog({ job, profile, close, onImport }: { job: Job; profile?: Profile; close: () => void; onImport: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [attachedProfile, setAttachedProfile] = useState<Profile>()
  const [loadingAttached, setLoadingAttached] = useState(import.meta.env.DEV)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const controller = new AbortController()
    void fetch(import.meta.env.BASE_URL + 'preview/cv-profile.json', {
      headers: { 'X-Edward-Preview': 'cv' }, signal: controller.signal
    }).then(async response => {
      if (!response.ok) return
      const value: unknown = await response.json()
      if (isProfile(value) && !controller.signal.aborted) setAttachedProfile(value)
    }).catch(() => {}).finally(() => {
      if (!controller.signal.aborted) setLoadingAttached(false)
    })
    return () => controller.abort()
  }, [])
  const source = attachedProfile ?? profile
  return <Modal title="Generate CV" close={close} wide>
    <p className="dialog-subtitle">{job.title}{known(job.company) && ' · ' + job.company}</p>
    {loadingAttached ? <p role="status">Loading attached CVs…</p> : source ? <CVEditor job={job} profile={source} /> : <div className="modal-section">
      <p>Import your private CV profile to tailor a CV for this opening.</p>
      <label className="button file-button"><FileText size={16} /> Import CV profile<input type="file" accept=".json,application/json" onChange={onImport} /></label>
    </div>}
  </Modal>
}
function CVEditor({ job, profile }: { job: Job; profile: Profile }) {
  const defaultLanguage = profile.pl ? 'pl' : 'en'
  const [language, setLanguage] = useState<'en' | 'pl'>(defaultLanguage)
  const [template, setTemplate] = useState<'classic' | 'compact'>('classic')
  const [drafts, setDrafts] = useState<Partial<Record<'en' | 'pl', { heading: string; body: string }>>>({})
  const draft = drafts[language] ?? makeCV(profile, job, language)
  return <>
    <div className="cv-controls">
      <label className="field">Language<select value={language} onChange={event => setLanguage(event.target.value as 'en' | 'pl')}>
        {profile.pl && <option value="pl">Polish</option>}
        {profile.en && <option value="en">English</option>}
      </select></label>
      <label className="field">Template<select value={template} onChange={event => setTemplate(event.target.value as 'classic' | 'compact')}>
        <option value="classic">Classic</option><option value="compact">Compact</option>
      </select></label>
    </div>
    <label className="field">Heading<textarea rows={2} value={draft.heading} onChange={event => setDrafts({ ...drafts, [language]: { ...draft, heading: event.target.value } })} /></label>
    <label className="field">CV text<textarea rows={12} value={draft.body} onChange={event => setDrafts({ ...drafts, [language]: { ...draft, body: event.target.value } })} /></label>
    <div className="modal-actions"><button type="button" className="primary" onClick={() => window.print()}><ArrowDownToLine size={16} /> Export PDF</button></div>
    <p className="print-hint">Choose “Save as PDF” in the print dialog.</p>
    <div className={'print-cv ' + template}>{draft.heading.split('\n').map((line, index) => index === 0 ? <h1 key={index}>{line}</h1> : <p key={index}>{line}</p>)}
      {draft.body.split(/\n\n+/).map((block, index) => {
        const [first, ...lines] = block.split('\n')
        return /^(PROFILE|SKILLS|EXPERIENCE|EDUCATION|LANGUAGES|PROFIL|UMIEJĘTNOŚCI|DOŚWIADCZENIE|WYKSZTAŁCENIE|JĘZYKI)$/.test(first) ?
          <section key={index}><h2>{first}</h2><p>{lines.join('\n')}</p></section> : <p key={index}>{block}</p>
      })}
    </div>
  </>
}
function makeCV(profile: Profile, job: Job, language: 'en' | 'pl') {
  const source = profile[language]!
  const tokens = (text: string) => textKey(text).match(/[\p{L}\p{N}]+/gu) ?? []
  const jobText = ' ' + tokens([job.title, job.description, job.category].join(' ')).join(' ') + ' '
  const score = (phrases: string[]) => phrases.reduce((total, phrase) => {
    const sequence = tokens(phrase).join(' ')
    return total + Number(sequence.length > 1 && jobText.includes(' ' + sequence + ' '))
  }, 0)
  const headings = language === 'en' ? ['PROFILE', 'SKILLS', 'EXPERIENCE', 'EDUCATION', 'LANGUAGES'] :
    ['PROFIL', 'UMIEJĘTNOŚCI', 'DOŚWIADCZENIE', 'WYKSZTAŁCENIE', 'JĘZYKI']
  const skills = [...source.skills].sort((a, b) => score([b]) - score([a]))
  const experience = [...source.experience].sort((a, b) => score(b.keywords) - score(a.keywords))
  const experienceLines = experience.map(item => [item.heading, item.detail, ...item.bullets.map(bullet => '• ' + bullet)].filter(Boolean).join('\n'))
  const sections = [source.summary, skills.join(' · '), experienceLines.join('\n\n'), source.education.join('\n'), source.languages.join('\n')]
  return { heading: [profile.name, profile.contact].filter(Boolean).join('\n'), body: sections.map((section, i) => section && headings[i] + '\n' + section).filter(Boolean).join('\n\n') }
}
createRoot(document.getElementById('root')!).render(<App />)
