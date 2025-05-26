'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../auth/AuthProvider';
import { createAnalysis } from '../../services/analysisService';
import './new.css';

export default function NewAnalysisPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Redirect to login if not authenticated
  if (!authLoading && !user) {
    router.push('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim() || !user) return;
    
    setLoading(true);
    try {
      // Create a new analysis in Firebase
      const id = await createAnalysis(user.uid, query);
      
      // Redirect to the create page
      router.push(`/analysis/create/${id}`);
    } catch (error) {
      console.error('Error creating analysis:', error);
      setLoading(false);
    }
  };

  return (
    <div className="new-analysis-container">
      <div className="new-analysis-card">
        <h1>Start New Analysis</h1>
        <p>Enter your search query to begin the AI-powered analysis</p>
        
        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your search query..."
            className="search-input"
            disabled={loading}
            required
          />
          <button 
            type="submit" 
            className="search-button"
            disabled={loading || !query.trim()}
          >
            {loading ? 'Creating...' : 'Start Analysis'}
          </button>
        </form>
      </div>
    </div>
  );
} 