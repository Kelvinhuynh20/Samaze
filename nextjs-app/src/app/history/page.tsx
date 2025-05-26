'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth/AuthProvider';
import { getUserHistory, AnalysisData } from '../services/analysisService';
import Link from 'next/link';
import './history.css';

export default function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<AnalysisData[]>([]);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      
      try {
        const analyses = await getUserHistory(user.uid);
        setHistory(analyses);
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (!authLoading) {
      if (!user) {
        router.push('/');
      } else {
        fetchHistory();
      }
    }
  }, [user, authLoading, router]);

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    }).format(date);
  };

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading history...</p>
      </div>
    );
  }

  return (
    <div className="history-page">
      <h1>Search History</h1>
      
      {history.length === 0 ? (
        <div className="no-history">
          <p>You haven't completed any searches yet.</p>
          <Link href="/analysis/new" className="new-search-button">
            Start a New Search
          </Link>
        </div>
      ) : (
        <div className="history-list">
          {history.map((analysis) => (
            <Link 
              href={`/analysis/finished/${analysis.id}`}
              key={analysis.id}
              className="history-item"
            >
              <div className="history-item-content">
                <div className="history-header">
                  <h3 className="history-query">{analysis.query}</h3>
                  <span className={`history-status ${analysis.status}`}>
                    {analysis.status === 'finished' ? 'Completed' : 'Stopped'}
                  </span>
                </div>
                
                <div className="history-details">
                  <div className="history-date">
                    {formatDate(analysis.finishedAt || analysis.createdAt)}
                  </div>
                  
                  <div className="history-stats">
                    <span className="success-rate">
                      {analysis.successfulResults || 0}/{analysis.totalResults || 0} Results
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
} 