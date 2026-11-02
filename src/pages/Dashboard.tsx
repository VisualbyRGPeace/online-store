import { Link } from 'react-router-dom'
import { Plus, FolderPlus, Play, ExternalLink } from 'lucide-react'
import { PROVIDERS } from '../data/providers'
import { useAccounts } from '../accountsStore'
import { useProjects } from '../projectsStore'
import { browserManager } from '../lib/browserManager'

const Stat = ({ label, v }: { label: string; v: number }) => (
  <div className="card"><div className="text-2xl font-bold">{v}</div><div className="text-xs text-slate-500">{label}</div></div>
)

export default function Dashboard() {
  const accounts = useAccounts(s => s.accounts)
  const projects = useProjects(s => s.projects)
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
        Tài khoản AI lưu trong trình duyệt này (Offline Mode). Dự án cũng lưu tại đây; chưa có kết nối Supabase/GitHub.
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">AI Accounts</h2>
        <div className="mb-4 flex flex-wrap gap-3">
          {Object.values(PROVIDERS).map(p => (
            <div key={p.id} className="card flex items-center gap-3 py-3">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
              <b>{p.name}</b><span className="text-slate-500">{accounts.filter(a => a.providerId === p.id).length} accounts</span>
            </div>
          ))}
        </div>
        {accounts.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">Chưa có tài khoản. <Link className="text-brand underline" to="/accounts">Thêm tài khoản</Link></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map(a => { const p = PROVIDERS[a.providerId]; return (
              <div key={a.id} className="card">
                <div className="mb-1 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p?.color }} /><b>{a.displayName}</b></div>
                <div className="mb-3 text-xs text-slate-500">{p?.name} · {a.profile || 'Chưa đặt profile'}</div>
                <button className="btn" onClick={() => browserManager.openAccount(a)}><ExternalLink size={14} /> Open</button>
              </div>
            )})}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Projects</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Tổng" v={projects.length} />
          <Stat label="Đang hoạt động" v={projects.filter(p => p.status === 'active').length} />
          <Stat label="Hoàn thành" v={projects.filter(p => p.status === 'completed').length} />
        </div>
      </section>
      <section className="flex flex-wrap gap-3">
        <Link className="btn btn-primary" to="/projects"><FolderPlus size={16} /> New Project</Link>
        <Link className="btn" to="/accounts"><Plus size={16} /> Add AI Account</Link>
        <Link className="btn" to="/workspace"><Play size={16} /> Resume Project</Link>
      </section>
    </div>
  )
}
