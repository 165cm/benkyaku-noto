import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import DataMigrationPrompt from '@/components/DataMigrationPrompt'
import ErrorBoundary from '@/components/ErrorBoundary'
import LoadingSpinner from '@/components/LoadingSpinner'


// Code Splitting: 各ページコンポーネントを遅延読み込み
const Home = lazy(() => import('@/pages/Home'))
const Workbooks = lazy(() => import('@/pages/Workbooks'))
const WorkbookDetail = lazy(() => import('@/pages/WorkbookDetail'))
const Study = lazy(() => import('@/pages/Study'))
const StudyReport = lazy(() => import('@/pages/StudyReport'))
const WeakModeReport = lazy(() => import('@/pages/WeakModeReport'))
const Review = lazy(() => import('@/pages/Review'))
const Stats = lazy(() => import('@/pages/Stats'))
const Settings = lazy(() => import('@/pages/Settings'))
const ImportFromImage = lazy(() => import('@/pages/ImportFromImage'))
const Trash = lazy(() => import('@/pages/Trash'))
const Debug = lazy(() => import('@/pages/Debug'))
const Explanations = lazy(() => import('@/pages/Explanations'))
const ImageExplanation = lazy(() => import('@/pages/ImageExplanation'))
const Login = lazy(() => import('@/pages/Login'))
const SignUp = lazy(() => import('@/pages/SignUp'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))

// ローディングコンポーネント
function LoadingFallback() {
  return <LoadingSpinner fullScreen message="ページを読み込み中..." />
}

export default function App() {
  // ページロード時の自動同期


  return (
    <ErrorBoundary>
      <BrowserRouter basename="/benkyaku-noto">
        <Suspense fallback={<LoadingFallback />}>
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
                  <>
                    <DataMigrationPrompt />
                    <Layout>
                      <Suspense fallback={<LoadingFallback />}>
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
                          <Route path="/explanations/image-upload" element={<ImageExplanation />} />
                          <Route path="/trash" element={<Trash />} />
                          <Route path="/debug" element={<Debug />} />
                        </Routes>
                      </Suspense>
                    </Layout>
                  </>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
