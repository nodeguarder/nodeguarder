import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import ServerDetail from './pages/ServerDetail';
import Servers from './pages/Servers';
import Configuration from './pages/Configuration';
import Settings from './pages/Settings';
import AgentDistribution from './pages/AgentDistribution';
import LicenseGenerator from './pages/LicenseGenerator';
import Health from './pages/Health';
import CronJobs from './pages/CronJobs';
import DriftDetection from './pages/DriftDetection';
import Notifications from './pages/Notifications';
import Sidebar from './components/Sidebar';


function RequireAuth({ children }) {
  const token = localStorage.getItem('auth_token');
  return token ? children : <Navigate to="/login" />;
}

function PrivateLayout() {
  const token = localStorage.getItem('auth_token');
  const passwordChanged = localStorage.getItem('password_changed') === 'true';

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (!passwordChanged) {
    return <Navigate to="/change-password" />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="ml-[260px] flex-1">
        <Outlet />
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/change-password",
    element: (
      <RequireAuth>
        <ChangePassword />
      </RequireAuth>
    ),
  },
  {
    path: "/",
    element: <PrivateLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: "health",
        element: <Health />,
      },
      {
        path: "cron-jobs",
        element: <CronJobs />,
      },
      {
        path: "drift-detection",
        element: <DriftDetection />,
      },
      {
        path: "servers/:id",
        element: <ServerDetail />,
      },
      {
        path: "nodes",
        element: <Servers />,
      },
      {
        path: "agent-distribution",
        element: <AgentDistribution />,
      },
      {
        path: "notifications",
        element: <Notifications />,
      },
      {
        path: "configuration",
        element: <Configuration />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
      ...(__INCLUDE_LICENSE_GENERATOR__ ? [{
        path: "license-generator",
        element: <LicenseGenerator />,
      }] : []),
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" />,
  }
]);

function App() {
  return (
    <RouterProvider router={router} />
  );
}

export default App;
