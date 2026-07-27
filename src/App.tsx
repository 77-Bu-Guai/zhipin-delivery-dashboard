import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import DashboardPage from '@/pages/DashboardPage';
import JobDetailPage from '@/pages/JobDetailPage';
import DeductionsPage from '@/pages/DeductionsPage';
import JobCategoryPage from '@/pages/JobCategoryPage';
import TodayPage from '@/pages/TodayPage';
import ExportPage from '@/pages/ExportPage';
import PromptOptimizationPage from '@/pages/PromptOptimizationPage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/job/:id" element={<JobDetailPage />} />
          <Route path="/deductions" element={<DeductionsPage />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/categories" element={<JobCategoryPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/optimize" element={<PromptOptimizationPage />} />
        </Route>
      </Routes>
    </Router>
  );
}