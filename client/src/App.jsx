/**
 * App Component
 * Main application entry point with routing
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Chat from './pages/Chat.jsx';
import MoodAnalytics from './pages/MoodAnalytics.jsx';
import MentorConnect from './pages/MentorConnect.jsx';
import MentorOnboarding from './pages/MentorOnboarding.jsx';
import MeetingRoom from './pages/MeetingRoom.jsx';
import './index.css';

/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)' }}>
        <div style={{ textAlign:'center' }}>
          <div className="spinner" style={{ margin:'0 auto 16px' }} />
          <p className="f-ui" style={{ fontSize:15, color:'var(--text-muted)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (user?.role === 'mentor' && ['/home', '/chat', '/mood-analytics'].includes(location.pathname)) {
    return <Navigate to="/mentor-connect" replace />;
  }

  return children;
};

/**
 * Public Route Component
 * Redirects to home if user is already authenticated
 */
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)' }}>
        <div style={{ textAlign:'center' }}>
          <div className="spinner" style={{ margin:'0 auto 16px' }} />
          <p className="f-ui" style={{ fontSize:15, color:'var(--text-muted)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return children;
};

/**
 * Layout Component with Navbar
 */
const Layout = ({ children }) => {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
};

/**
 * Main App Component
 */
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route
            path="/"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            }
          />

          {/* Protected routes */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Layout>
                  <Chat />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Home route */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Layout>
                  <Home />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Mood Analytics route */}
          <Route
            path="/mood-analytics"
            element={
              <ProtectedRoute>
                <Layout>
                  <MoodAnalytics />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route path="/mentor-connect" element={<ProtectedRoute><Layout><MentorConnect /></Layout></ProtectedRoute>} />
          <Route path="/mentor/onboarding" element={<ProtectedRoute><Layout><MentorOnboarding /></Layout></ProtectedRoute>} />
          <Route path="/mentor/sessions/:sessionId/meeting" element={<ProtectedRoute><Layout><MeetingRoom /></Layout></ProtectedRoute>} />

          {/* Catch all - redirect to login */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
