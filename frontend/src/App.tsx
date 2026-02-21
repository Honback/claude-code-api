import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ChatWindow from './components/chat/ChatWindow';
import Dashboard from './components/admin/Dashboard';
import SettingsPage from './components/settings/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<ChatWindow />}>
          <Route path=":id" element={null} />
        </Route>
        <Route path="admin" element={<Dashboard />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
