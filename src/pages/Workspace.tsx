import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExternalLink, ClipboardCopy, Save, FileText, Play, Trash2, Download } from 'lucide-react'
import { PROVIDERS } from '../data/providers'
import { DOC_KEYS, useProjects } from '../projectsStore'
import { useAccounts } from '../accountsStore'
import { browserManager } from '../lib/browserManager'
import { buildContext, buildResume, copy, download, exportMarkdown, handoffTemplate } from '../lib/handoff'
import { toast } from '../toastStore'

type Tab = (typeof DOC_KEYS)[number] | 'TASKS'

export default function Workspace() {
  const { id } = useParams()
  const { projects, setDoc, addTask, toggleTask, removeTask, logProgress, update } = useProjects()
  const accounts = useAccounts(s => s.accounts)
  const [tab, setTab] = useState<Tab>('CONTEXT')
  const [next, setNext] = useState('')
  const [accId, setAccId] = useState('')
  const [summary, setSummary] = useState('')
  const [task, setTask] = useState('')
  const p = projects.find(x => x.id === id)

  if (!id) return (
    <div className="space-y-3"><h1 className="text-xl font-semibold">Workspace</h1>
      {projects.length === 0 ? <div className="card text-center text-slate-500">Chưa có dự án. <Link className="text-brand underline" to="/projects">Tạo dự án</Link></div> :
        projects.filter(x => x.status !== 'archived').map(x => <Link key={x.id} to={`/workspace/${x.id}`} className="card block hover:border-brand">{x.name}</Link>)}
    </div>)
  if (!p) return <div className="card text-center text-slate-500">Không tìm thấy dự án. <Link className="text-brand underline" to="/projects">Quay lại</Link></div>

  const nextId = next || p.providerId
  const candidates = accounts.filter(a => a.providerId === p.providerId)
  const chosen = candidates.find(a => a.id === accId) || candidates.find(a => a.isDefault) || candidates[0]
  const doCopy = async (text: string, ok: string) => (await copy(text)) ? toast.success(ok) : toast.error('Không copy được. Hãy thử lại hoặc copy thủ công.')
  const input = 'rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">{p.name}</h1>
        <select className={input} value={p.providerId} onChange={e => update(p.id, { providerId: e.target.value })}>
          {Object.values(PROVIDERS).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {candidates.length > 0 && <select className={input} value={chosen?.id} onChange={e => setAccId(e.target.value)}>
          {candidates.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select>}
        <button className="btn btn-primary" onClick={() => chosen ? browserManager.openAccount(chosen) : window.open(PROVIDERS[p.providerId].website, '_blank', 'noopener,noreferrer')}><ExternalLink size={14} /> OPEN AI</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => doCopy(buildContext(p), 'Đã copy context.')}><ClipboardCopy size={14} /> Copy Context</button>
        <button className="btn" onClick={() => doCopy(buildResume(p, PROVIDERS[nextId].name), 'Đã copy prompt tiếp tục.')}><Play size={14} /> Resume Project</button>
        <select className={input} value={nextId} onChange={e => setNext(e.target.value)} aria-label="AI tiếp theo">
          {Object.values(PROVIDERS).map(x => <option key={x.id} value={x.id}>Bàn giao cho {x.name}</option>)}</select>
        <button className="btn" onClick={() => { setDoc(p.id, 'HANDOFF', handoffTemplate(p, PROVIDERS[nextId].name)); setTab('HANDOFF'); toast.success('Đã tạo HANDOFF.') }}><FileText size={14} /> Generate Handoff</button>
        <button className="btn" onClick={() => { download(`${p.name}.md`, exportMarkdown(p)); }}><Download size={14} /> Export .md</button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {([...DOC_KEYS.slice(0, 2), 'TASKS', ...DOC_KEYS.slice(2)] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-brand font-medium text-brand' : 'text-slate-500'}`}>{t}.md</button>))}
      </div>

      {tab === 'TASKS' ? (
        <div className="card space-y-2">
          {p.tasks.length === 0 && <p className="text-sm text-slate-500">Chưa có công việc.</p>}
          {p.tasks.map(t => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(p.id, t.id)} />
              <span className={`mr-auto ${t.done ? 'text-slate-500 line-through' : ''}`}>{t.text}</span>
              <button onClick={() => removeTask(p.id, t.id)} aria-label="Xóa"><Trash2 size={14} /></button>
            </div>))}
          <div className="flex gap-2 pt-2">
            <input className={`${input} flex-1`} placeholder="Thêm công việc…" value={task} onChange={e => setTask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && task.trim()) { addTask(p.id, task.trim()); setTask('') } }} />
            <button className="btn" onClick={() => { if (task.trim()) { addTask(p.id, task.trim()); setTask('') } }}>Thêm</button>
          </div>
        </div>
      ) : (
        <textarea className={`${input} min-h-[320px] w-full font-mono`} value={p.docs[tab]} placeholder={`Nội dung ${tab}.md (tự động lưu)`}
          onChange={e => setDoc(p.id, tab, e.target.value)} />
      )}

      <div className="card space-y-2">
        <b className="text-sm">Tóm tắt phiên làm việc</b>
        <textarea className={`${input} w-full`} rows={2} placeholder="Phiên này đã làm gì? Sẽ được ghi vào CHANGELOG.md" value={summary} onChange={e => setSummary(e.target.value)} />
        <button className="btn" onClick={() => { if (!summary.trim()) return toast.error('Hãy nhập tóm tắt.'); logProgress(p.id, summary.trim()); setSummary(''); toast.success('Đã lưu tiến độ.') }}><Save size={14} /> Save Progress</button>
      </div>
    </div>
  )
}
