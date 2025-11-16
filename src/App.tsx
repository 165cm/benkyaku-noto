import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Workbooks from '@/pages/Workbooks'
import WorkbookDetail from '@/pages/WorkbookDetail'
import Study from '@/pages/Study'
import Review from '@/pages/Review'
import Stats from '@/pages/Stats'
import Settings from '@/pages/Settings'
import ImportFromImage from '@/pages/ImportFromImage'

export default function App() {
  return (
    <BrowserRouter basename="/benkyaku-noto">
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/workbooks" element={<Workbooks />} />
          <Route path="/workbooks/:id" element={<WorkbookDetail />} />
          <Route path="/workbooks/import" element={<ImportFromImage />} />
          <Route path="/study/:id" element={<Study />} />
          <Route path="/review" element={<Review />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
