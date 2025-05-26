'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../auth/AuthProvider';
import './Sidebar.css';

const Sidebar = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const isCreatingAnalysis = pathname?.includes('/analysis/create/');

  const handleHomeClick = (e: React.MouseEvent) => {
    if (isCreatingAnalysis) {
      e.preventDefault();
      if (window.confirm('You have an analysis in progress. Leaving now will save your current results and stop the analysis. Continue?')) {
        // Trigger a visibilitychange event to attempt auto-save before navigating
        document.dispatchEvent(new Event('visibilitychange'));
        
        // Give a small delay to allow auto-save to complete
        setTimeout(() => {
          router.push('/analysis/new');
        }, 500);
      }
    }
  };

  // Also handle history and settings navigation
  const handleNavigation = (e: React.MouseEvent, path: string) => {
    if (isCreatingAnalysis) {
      e.preventDefault();
      if (window.confirm('You have an analysis in progress. Leaving now will save your current results and stop the analysis. Continue?')) {
        // Trigger a visibilitychange event to attempt auto-save before navigating
        document.dispatchEvent(new Event('visibilitychange'));
        
        // Give a small delay to allow auto-save to complete
        setTimeout(() => {
          router.push(path);
        }, 500);
      }
    }
  };

  return (
    <div className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="toggle-button" onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? '◀' : '▶'}
      </div>
      
      <div className="sidebar-content">
        <div className="user-info">
          {user && (
            <>
              <div className="avatar">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} />
                ) : (
                  <div className="avatar-placeholder">
                    {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
                  </div>
                )}
              </div>
              {isExpanded && (
                <div className="user-name">
                  {user.displayName || user.email}
                </div>
              )}
            </>
          )}
        </div>
        
        <nav className="sidebar-nav">
          <Link 
            href="/analysis/new" 
            className={`nav-item ${pathname === '/analysis/new' ? 'active' : ''}`}
            onClick={handleHomeClick}
          >
            <span className="icon">🏠</span>
            {isExpanded && <span className="label">Home</span>}
          </Link>
          
          <Link 
            href="/history" 
            className={`nav-item ${pathname === '/history' ? 'active' : ''}`}
            onClick={(e) => handleNavigation(e, '/history')}
          >
            <span className="icon">📜</span>
            {isExpanded && <span className="label">History</span>}
          </Link>
          
          <Link 
            href="/settings" 
            className={`nav-item ${pathname === '/settings' ? 'active' : ''}`}
            onClick={(e) => handleNavigation(e, '/settings')}
          >
            <span className="icon">⚙️</span>
            {isExpanded && <span className="label">Settings</span>}
          </Link>
        </nav>
        
        <div className="sidebar-footer">
          <button 
            onClick={signOut} 
            className="sign-out-button"
          >
            <span className="icon">🚪</span>
            {isExpanded && <span className="label">Sign Out</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar; 