import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Home from '@/pages/Home'
import Workbooks from '@/pages/Workbooks'
import WorkbookDetail from '@/pages/WorkbookDetail'
import Study from '@/pages/Study'
import StudyReport from '@/pages/StudyReport'
import WeakModeReport from '@/pages/WeakModeReport'
import Review from '@/pages/Review'
import Stats from '@/pages/Stats'
import Settings from '@/pages/Settings'
import ImportFromImage from '@/pages/ImportFromImage'
import Trash from '@/pages/Trash'
import Debug from '@/pages/Debug'
import Explanations from '@/pages/Explanations'
import Login from '@/pages/Login'
import SignUp from '@/pages/SignUp'
import ForgotPassword from '@/pages/ForgotPassword'

export default function App() {
  return (
    <BrowserRouter basename="/benkyaku-noto">
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Protected routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/workbooks" element={<Workbooks />} />
                  <Route path="/workbooks/:id" element={<WorkbookDetail />} />
                  <Route path="/workbooks/import" element={<ImportFromImage />} />
                  <Route path="/study/:id" element={<Study />} />
                  <Route path="/study-report" element={<StudyReport />} />
                  <Route path="/weak-mode-report" element={<WeakModeReport />} />
                  <Route path="/review" element={<Review />} />
                  <Route path="/stats" element={<Stats />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/explanations" element={<Explanations />} />
                  <Route path="/trash" element={<Trash />} />
                  <Route path="/debug" element={<Debug />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
