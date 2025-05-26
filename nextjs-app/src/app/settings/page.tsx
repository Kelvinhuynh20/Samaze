'use client';

import React from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useRouter } from 'next/navigation';
import './settings.css';

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  if (!user) {
    router.push('/');
    return null;
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      
      <div className="settings-section">
        <h2>Account Information</h2>
        <div className="account-info">
          <div className="account-avatar">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'User'} />
            ) : (
              <div className="avatar-placeholder">
                {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
              </div>
            )}
          </div>
          <div className="account-details">
            <div className="account-name">{user.displayName || 'Anonymous User'}</div>
            <div className="account-email">{user.email}</div>
          </div>
        </div>
      </div>
      
      <div className="settings-section">
        <h2>Actions</h2>
        <button 
          className="signout-button" 
          onClick={signOut}
        >
          Sign Out
        </button>
      </div>
      
      <div className="settings-section">
        <h2>About</h2>
        <p className="about-text">
          This application provides AI-powered search analysis using multiple APIs, 
          including Google Search, content extraction, and Cohere AI for analysis.
          Your search history is saved to your account for future reference.
        </p>
      </div>
    </div>
  );
} 