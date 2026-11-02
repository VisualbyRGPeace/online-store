import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, Copy, Download, Pencil, Plus, Trash2, Upload, X, ArrowRight } from 'lucide-react'
import { PROVIDERS } from '../data/providers'
import { isProjectLike, useProjects, type ProjectInput } from '../projectsStore'
import { download } from '../lib/handoff'
import { toast } from '../toastStore'

const EMPTY: ProjectInput = { name: '', description: '', status: 'active', providerId: 'claude', repoUrl: '' }

export default function Projects() {
  const { projects, add, update, remove, duplicate, importAll } = useProjects()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<ProjectInput>(EMPTY)
  const [err, setErr] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const list = useMemo(() => projects.filter(p => p.name.toLowerCase().includes(q.toLowerCase())), [projects, q])
  const input = 'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700'

  const openForm = (id: string | 'new') => {
    const p = projects.find(x => x.id === id)
    setForm(p ? { name: p.name, description: p.description, status: p.status, providerId: p.providerId, repoUrl: p.repoUrl } : EMPTY)
    setErr(null); setEditing(id)
  }
  const save = () => {
    if (!form.name.trim()) return setErr('Vui lòng nhập tên dự án.')
    if (form.repoUrl) { try { if (new URL(form.repoUrl).protocol !== 'https:') throw 0 } catch { return setErr('Repository URL phải là https://…') } }
    const clean = { ...form, name: form.name.trim() }
    if (editing === 'new') { const id = add(clean); toast.success('Đã tạo dự án.'); setEditing(null); nav(`/workspace/${id}`); return }
    if (editing) { update(editing, clean); toast.success('Đã cập nhật dự án.') }
    setEditing(null)
  }
  const onImport = async (f?: File) => {
    if (!f) return
    try {
      const data = JSON.parse(await f.text())
      const arr = (Array.isArray(data) ? data : []).filter(isProjectLike)
      if (!arr.length) return toast.error('File không hợp lệ.')
      toast.success(`Đã nhập ${importAll(arr)} dự án mới.`)
    } catch { toast.error('Không đọc được file JSON.') }
    if (file.current) file.current.value = ''
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Projects</h1>
        <input className={`${input} max-w-[200px]`} placeholder="Tìm dự án…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" onClick={() => projects.length ? download('ai-hub-projects.json', JSON.stringify(projects, null, 2), 'application/json') : toast.error('Chưa có dự án để xuất.')}><Download size={16} /> Export</button>
        <button className="btn" onClick={() => file.current?.click()}><Upload size={16} /> Import</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={e => onImport(e.target.files?.[0])} />
        <button className="btn btn-primary" onClick={() => openForm('new')}><Plus size={16} /> New Project</button>
      </div>
      <p className="text-xs text-slate-500">Offline Mode: dự án chỉ lưu trong trình duyệt này. Hãy Export để sao lưu.</p>

      {projects.length === 0 ? (
        <div className="card py-10 text-center"><p className="mb-3 text-slate-500">Chưa có dự án nào.</p>
          <button className="btn btn-primary" onClick={() => openForm('new')}><Plus size={16} /> Tạo dự án đầu tiên</button></div>
      ) : list.length === 0 ? <div className="card text-center text-slate-500">Không có kết quả.</div> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(p => (
            <div key={p.id} className={`card ${p.status === 'archived' ? 'opacity-60' : ''}`}>
              <div className="mb-1 flex items-center gap-2"><b className="truncate">{p.name}</b>
                <span className="rounded bg-slate-500/15 px-1.5 text-xs">{p.status}</span></div>
              <p className="mb-1 line-clamp-2 text-xs text-slate-500">{p.description || 'Chưa có mô tả'}</p>
              <p className="mb-3 text-xs text-slate-500">{PROVIDERS[p.providerId]?.name} · {new Date(p.updatedAt).toLocaleDateString()}</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={() => nav(`/workspace/${p.id}`)}><ArrowRight size={14} /> Resume</button>
                <button className="btn" onClick={() => openForm(p.id)} aria-label="Sửa"><Pencil size={14} /></button>
                <button className="btn" onClick={() => { duplicate(p.id); toast.success('Đã nhân bản.') }} aria-label="Nhân bản"><Copy size={14} /></button>
                <button className="btn" onClick={() => { update(p.id, { status: p.status === 'archived' ? 'active' : 'archived' }); toast.success(p.status === 'archived' ? 'Đã khôi phục.' : 'Đã lưu trữ.') }} aria-label="Lưu trữ"><Archive size={14} /></button>
                <button className="btn" onClick={() => { if (confirm(`Xóa "${p.name}"?`)) { remove(p.id); toast.success('Đã xóa dự án.') } }} aria-label="Xóa"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="card w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex"><b className="mr-auto">{editing === 'new' ? 'Dự án mới' : 'Sửa dự án'}</b><button onClick={() => setEditing(null)} aria-label="Đóng"><X size={18} /></button></div>
            <input className={input} placeholder="Tên dự án" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <textarea className={input} rows={3} placeholder="Mô tả" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="flex gap-2">
              <select className={`${input} dark:bg-slate-900`} value={form.providerId} onChange={e => setForm({ ...form, providerId: e.target.value })}>
                {Object.values(PROVIDERS).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <select className={`${input} dark:bg-slate-900`} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ProjectInput['status'] })}>
                <option value="active">active</option><option value="completed">completed</option><option value="archived">archived</option></select>
            </div>
            <input className={input} placeholder="Repository URL (tùy chọn, https://…)" value={form.repoUrl} onChange={e => setForm({ ...form, repoUrl: e.target.value })} />
            {err && <p className="text-sm text-red-500">{err}</p>}
            <div className="flex justify-end gap-2"><button className="btn" onClick={() => setEditing(null)}>Hủy</button><button className="btn btn-primary" onClick={save}>Lưu</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
