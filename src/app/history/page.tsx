'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth/AuthProvider';
import { getUserHistory, AnalysisData } from '../services/analysisService';
import { getUserSummaryHistory, SummaryData } from '../services/summarizeService';
import Link from 'next/link';
import './history.css';

export default function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'searches' | 'summaries'>('searches');
  const [searchHistory, setSearchHistory] = useState<AnalysisData[]>([]);
  const [summaryHistory, setSummaryHistory] = useState<SummaryData[]>([]);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        if (activeTab === 'searches') {
          const analyses = await getUserHistory(user.uid);
          setSearchHistory(analyses);
        } else {
          const summaries = await getUserSummaryHistory(user.uid);
          setSummaryHistory(summaries);
        }
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
  }, [user, authLoading, router, activeTab]);

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
      <div className="history-tabs">
        <button 
          className={`tab-button ${activeTab === 'searches' ? 'active' : ''}`}
          onClick={() => setActiveTab('searches')}
        >
          Search History
        </button>
        <button 
          className={`tab-button ${activeTab === 'summaries' ? 'active' : ''}`}
          onClick={() => setActiveTab('summaries')}
        >
          URL Summarizer History
        </button>
      </div>
      
      {activeTab === 'searches' ? (
        <>
          <h1>Search History</h1>
          
          {searchHistory.length === 0 ? (
            <div className="no-history">
              <p>You haven&apos;t completed any searches yet.</p>
              <Link href="/analysis/new" className="new-search-button">
                Start a New Search
              </Link>
            </div>
          ) : (
            <div className="history-list">
              {searchHistory.map((analysis) => (
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
        </>
      ) : (
        <>
          <h1>URL Summarizer History</h1>
          
          {summaryHistory.length === 0 ? (
            <div className="no-history">
              <p>You haven&apos;t completed any URL summaries yet.</p>
              <Link href="/analysis/summarize" className="new-search-button">
                Summarize a URL
              </Link>
            </div>
          ) : (
            <div className="history-list">
              {summaryHistory.map((summary) => (
                <Link 
                  href={`/analysis/summarize?url=${encodeURIComponent(summary.url)}/${summary.id}`}
                  key={summary.id}
                  className="history-item"
                >
                  <div className="history-item-content">
                    <div className="history-header">
                      <h3 className="history-query">{summary.url}</h3>
                      <span className={`history-status ${summary.status}`}>
                        {summary.status === 'finished' ? 'Completed' : 'Processing'}
                      </span>
                    </div>
                    
                    <div className="history-details">
                      <div className="history-date">
                        {formatDate(summary.updatedAt || summary.createdAt)}
                      </div>
                      
                      <div className="history-stats">
                        <span className="summary-info">
                          {summary.qaHistory?.length || 0} Q&A Items
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
} 