'use client';

import React, { useEffect } from 'react';
import { useAuth } from './auth/AuthProvider';
import { useRouter } from 'next/navigation';
import './login.css';

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/analysis/new');
    }
  }, [user, loading, router]);

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Analysis Results</h1>
        <p>You must sign in with Google to use this application</p>
        <button 
          className="google-signin-button" 
          onClick={signInWithGoogle}
          disabled={loading}
        >
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" 
            alt="Google logo" 
            className="google-logo" 
          />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}