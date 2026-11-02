import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const DOC_KEYS = ['PROJECT', 'CONTEXT', 'DECISIONS', 'CHANGELOG', 'HANDOFF'] as const
export type DocKey = (typeof DOC_KEYS)[number]
export interface Task { id: string; text: string; done: boolean }
export interface Project {
  id: string; name: string; description: string; status: 'active' | 'completed' | 'archived'
  providerId: string; repoUrl: string; createdAt: string; updatedAt: string
  docs: Record<DocKey, string>; tasks: Task[]
}
export type ProjectInput = Pick<Project, 'name' | 'description' | 'status' | 'providerId' | 'repoUrl'>

interface S {
  projects: Project[]
  add: (i: ProjectInput) => string
  update: (id: string, patch: Partial<Project>) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  setDoc: (id: string, k: DocKey, v: string) => void
  addTask: (id: string, text: string) => void
  toggleTask: (id: string, taskId: string) => void
  removeTask: (id: string, taskId: string) => void
  logProgress: (id: string, summary: string) => void
  importAll: (list: Project[]) => number
}

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const emptyDocs = (): Record<DocKey, string> => ({ PROJECT: '', CONTEXT: '', DECISIONS: '', CHANGELOG: '', HANDOFF: '' })

// Offline Mode: lưu trong localStorage của trình duyệt này, không phải cloud.
export const useProjects = create<S>()(persist((set, get) => {
  const patch = (id: string, fn: (p: Project) => Partial<Project>) =>
    set({ projects: get().projects.map(p => (p.id === id ? { ...p, ...fn(p), updatedAt: now() } : p)) })
  return {
    projects: [],
    add: i => {
      const p: Project = { ...i, id: uid(), createdAt: now(), updatedAt: now(), docs: emptyDocs(), tasks: [] }
      p.docs.PROJECT = `# ${i.name}\n\n${i.description}`
      set({ projects: [p, ...get().projects] })
      return p.id
    },
    update: (id, pt) => patch(id, () => pt),
    remove: id => set({ projects: get().projects.filter(p => p.id !== id) }),
    duplicate: id => {
      const p = get().projects.find(x => x.id === id)
      if (p) set({ projects: [{ ...p, id: uid(), name: `${p.name} (bản sao)`, createdAt: now(), updatedAt: now(), tasks: p.tasks.map(t => ({ ...t, id: uid() })) }, ...get().projects] })
    },
    setDoc: (id, k, v) => patch(id, p => ({ docs: { ...p.docs, [k]: v } })),
    addTask: (id, text) => patch(id, p => ({ tasks: [...p.tasks, { id: uid(), text, done: false }] })),
    toggleTask: (id, tid) => patch(id, p => ({ tasks: p.tasks.map(t => (t.id === tid ? { ...t, done: !t.done } : t)) })),
    removeTask: (id, tid) => patch(id, p => ({ tasks: p.tasks.filter(t => t.id !== tid) })),
    logProgress: (id, s) => patch(id, p => ({ docs: { ...p.docs, CHANGELOG: `${p.docs.CHANGELOG}\n- ${new Date().toLocaleString()}: ${s}`.trim() } })),
    importAll: list => {
      const ids = new Set(get().projects.map(p => p.id))
      const fresh = list.filter(p => !ids.has(p.id))
      set({ projects: [...fresh, ...get().projects] })
      return fresh.length
    },
  }
}, { name: 'aihub:projects' }))

export function isProjectLike(x: unknown): x is Project {
  const p = x as Project
  return !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.docs === 'object' && Array.isArray(p.tasks)
}
