import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import PipelinePage from "./pages/PipelinePage";
import SchedulerPage from "./pages/SchedulerPage";
import SheetsPage from "./pages/SheetsPage";
import LeadsPage from "./pages/LeadsPage";
import SettingsPage from "./pages/SettingsPage";
import IcpPage from "./pages/IcpPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="scheduler" element={<SchedulerPage />} />
        <Route path="icp" element={<IcpPage />} />
        <Route path="sheets" element={<SheetsPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
