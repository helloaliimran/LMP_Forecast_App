import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import WelcomePage from './pages/WelcomePage'
import UsersPage from './pages/UsersPage'
import UploadsPage from './pages/UploadsPage'
import AnalysisPage from './pages/AnalysisPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<WelcomePage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route element={<RequireAuth roles={['SuperAdmin', 'Admin']} />}>
            <Route path="uploads" element={<UploadsPage />} />
          </Route>
          <Route element={<RequireAuth roles={['SuperAdmin']} />}>
            <Route path="admin/users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
