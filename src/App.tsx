import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import ImportPage from '@/pages/ImportPage';
import DashboardPage from '@/pages/DashboardPage';
import JobDetailPage from '@/pages/JobDetailPage';
import DeductionsPage from '@/pages/DeductionsPage';
import ExportPage from '@/pages/ExportPage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ImportPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/job/:id" element={<JobDetailPage />} />
          <Route path="/deductions" element={<DeductionsPage />} />
          <Route path="/export" element={<ExportPage />} />
        </Route>
      </Routes>
    </Router>
  );
}