import type { Project } from '../projectsStore'

const tasksMd = (p: Project) => {
  const done = p.tasks.filter(t => t.done).map(t => `- [x] ${t.text}`)
  const open = p.tasks.filter(t => !t.done).map(t => `- [ ] ${t.text}`)
  return `## Đã hoàn thành\n${done.join('\n') || '(chưa có)'}\n\n## Chưa hoàn thành\n${open.join('\n') || '(chưa có)'}`
}

export function buildContext(p: Project): string {
  const d = p.docs
  return [`# PROJECT\n${d.PROJECT || p.name}`, `# CONTEXT\n${d.CONTEXT || '(trống)'}`, `# TASKS\n${tasksMd(p)}`,
    `# DECISIONS\n${d.DECISIONS || '(trống)'}`, `# HANDOFF\n${d.HANDOFF || '(trống)'}`].join('\n\n')
}

export function buildResume(p: Project, aiName: string): string {
  return `Bạn là ${aiName}, tiếp tục dự án "${p.name}" từ nơi AI trước đã dừng. Hãy đọc kỹ toàn bộ bối cảnh bên dưới rồi trả lời:
1. Dự án đang xây dựng gì.
2. Những gì đã hoàn thành / chưa hoàn thành.
3. Những lỗi đang tồn tại (nếu có trong CONTEXT/HANDOFF).
4. Nhắc lại các quyết định trong DECISIONS — KHÔNG được tự ý thay đổi chúng.
5. Đề xuất nhiệm vụ tiếp theo, rồi chờ tôi xác nhận trước khi làm.

${buildContext(p)}`
}

export function handoffTemplate(p: Project, toAi: string): string {
  return `# HANDOFF — ${new Date().toLocaleString()}
Bàn giao cho: ${toAi}

${tasksMd(p)}

## Lỗi đang tồn tại
(điền vào)

## Quyết định không được thay đổi
${p.docs.DECISIONS || '(xem DECISIONS.md)'}

## Nhiệm vụ tiếp theo
${p.tasks.find(t => !t.done)?.text || '(điền vào)'}`
}

export const exportMarkdown = (p: Project) =>
  Object.entries(p.docs).map(([k, v]) => `<!-- ${k}.md -->\n${v}`).join('\n\n---\n\n') + `\n\n---\n\n<!-- TASKS.md -->\n${tasksMd(p)}`

export function download(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
