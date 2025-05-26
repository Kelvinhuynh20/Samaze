'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../auth/AuthProvider';
import { getAnalysis, SearchResult } from '../../../services/analysisService';
import './finished.css';

interface PageProps {
  params: {
    id: string;
  };
}

export default function FinishedAnalysisPage({ params }: PageProps) {
  // Access the ID directly from params
  const { id } = params;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<'finished' | 'stopped'>('finished');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // Fetch analysis data
  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!user) return;
      
      try {
        const analysis = await getAnalysis(id);
        
        if (!analysis) {
          setError('Analysis not found');
          return;
        }
        
        if (analysis.userId !== user.uid) {
          setError('You do not have permission to view this analysis');
          return;
        }
        
        setQuery(analysis.query);
        setResults(analysis.results || []);
        setStatus(analysis.status as 'finished' | 'stopped');
      } catch (error) {
        console.error('Error fetching analysis:', error);
        setError('Failed to load analysis');
      } finally {
        setLoading(false);
      }
    };
    
    if (!authLoading) {
      if (!user) {
        router.push('/');
      } else {
        fetchAnalysis();
      }
    }
  }, [id, user, authLoading, router]);

  const handleNewSearch = () => {
    router.push('/analysis/new');
  };

  const getRelevanceColor = (relevance: number): string => {
    return relevance > 70 ? '#28a745' : 
           relevance > 40 ? '#ffc107' : '#dc3545';
  };

  const getBiasColor = (bias: number): string => {
    return bias < 30 ? '#28a745' : 
           bias < 60 ? '#ffc107' : '#dc3545';
  };

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading analysis results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button 
          onClick={handleNewSearch}
          className="back-button"
        >
          Back to Search
        </button>
      </div>
    );
  }

  return (
    <div className="finished-analysis-page">
      <div className="header">
        <h1>Analysis Results</h1>
        <div className="search-box">
          <div className="query-display">
            <span className="query-label">Query:</span>
            <span className="query-text">{query}</span>
            {status === 'stopped' ? (
              <span className="status-badge stopped">Search was stopped</span>
            ) : (
              <span className="status-badge finished">Search was done</span>
            )}
          </div>
          <button 
            onClick={handleNewSearch}
            className="new-search-button"
          >
            New Search
          </button>
        </div>
      </div>

      <div className="results-container">
        {results.length === 0 ? (
          <div className="no-results">
            <p>No results found. Try a different search query.</p>
          </div>
        ) : (
          results.filter(result => result.status === 'done').map((result, index) => (
            <div key={index} className="result-card">
              <div className="metrics-container">
                <div 
                  className="metric relevance"
                  style={{ backgroundColor: getRelevanceColor(result.relevance), color: 'white' }}
                >
                  {result.relevance}% Relevant
                </div>
                <div 
                  className="metric bias"
                  style={{ backgroundColor: getBiasColor(result.bias), color: 'white' }}
                >
                  {result.bias}% Bias
                </div>
              </div>
              <a href={result.link} className="url-title" target="_blank" rel="noopener noreferrer">
                {result.title}
              </a>
              <div className="bias-analysis">
                {result.biasAnalysis.split('-').map((point, idx) => 
                  point.trim() ? (
                    <div key={idx} className="bias-point">• {point.trim()}</div>
                  ) : null
                )}
              </div>
              <div className="summary">{result.summary}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} 