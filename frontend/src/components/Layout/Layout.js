import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 768) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="layout">
      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content" style={{ marginLeft: sidebarOpen && window.innerWidth > 768 ? 'var(--sidebar-width)' : 0, transition: 'margin-left 0.25s ease' }}>
        {children}
      </main>
      <footer className="app-footer" style={{ marginLeft: sidebarOpen && window.innerWidth > 768 ? 'var(--sidebar-width)' : 0, transition: 'margin-left 0.25s ease' }}>
        <span>© {new Date().getFullYear()} PT Cisarua Mountain Dairy, Tbk — Plant Sentul</span>
        <span className="footer-divider">|</span>
        <span>Powered by Digital Transformation</span>
      </footer>
    </div>
  );
}

export default Layout;