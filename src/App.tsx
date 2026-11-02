import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Toasts from './components/Toasts'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Projects from './pages/Projects'
import Workspace from './pages/Workspace'
import Placeholder from './pages/Placeholder'

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="projects" element={<Projects />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="workspace/:id" element={<Workspace />} />
          <Route path="files" element={<Placeholder title="File Manager" phase={3} />} />
          <Route path="activity" element={<Placeholder title="Activity History" phase={3} />} />
          <Route path="settings" element={<Placeholder title="Settings" phase={5} />} />
          <Route path="*" element={<Placeholder title="Không tìm thấy trang" phase={1} />} />
        </Route>
      </Routes>
      <Toasts />
    </>
  )
}
