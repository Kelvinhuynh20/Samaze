'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../auth/AuthProvider';
import { getAnalysis, updateAnalysisResults, finishAnalysis, SearchResult } from '../../../services/analysisService';
import AdvancedSearch from '../../../components/AdvancedSearch';
import './analysis.css';

interface PageProps {
  params: {
    id: string;
  };
}

export default function AnalysisPage({ params }: PageProps) {
  // Access the ID directly from params
  const { id } = params;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // Refs to keep track of current results for the beforeunload handler
  const currentResultsRef = useRef<SearchResult[]>([]);
  const savedRef = useRef<boolean>(false);
  const originalQueryRef = useRef<string>('');

  // Handler for automatically saving results when the page is unloaded
  const handleAutoSave = async () => {
    if (savedRef.current || !user) {
      return;
    }
    
    try {
      // Only save if we have results to save
      if (currentResultsRef.current.length > 0) {
        console.log(`Auto-saving analysis with ${currentResultsRef.current.length} results`);
        
        // Filter out any "processing" results since they're incomplete
        const completedResults = currentResultsRef.current.filter(
          result => result.status === 'done' || result.status === 'error' || result.status === 'stopped'
        );
        
        if (completedResults.length > 0) {
          savedRef.current = true;
          const finishedId = await finishAnalysis(id, completedResults, 'stopped');
          console.log('Auto-saved analysis:', finishedId);
        } else {
          console.log('No completed results to save');
        }
      }
    } catch (error) {
      console.error('Error auto-saving analysis:', error);
    }
  };

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
        
        // If analysis is already finished, redirect to the finished page
        if (analysis.status !== 'creating') {
          router.push(`/analysis/finished/${analysis.id}`);
          return;
        }
        
        setQuery(analysis.query);
        originalQueryRef.current = analysis.query;
        console.log(`Original query stored: ${analysis.query}`);
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
    
    // Add navigation warning
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!savedRef.current && currentResultsRef.current.length > 0) {
        e.preventDefault();
        e.returnValue = 'You have an analysis in progress. Are you sure you want to leave?';
        
        // Attempt auto-save, but this may not complete in time for beforeunload
        handleAutoSave();
        
        return e.returnValue;
      }
    };
    
    // Handle visibility change to catch tab closing or switching
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Create a separate async function to handle the auto-save
        const performAutoSave = async () => {
          try {
            await handleAutoSave();
            console.log('Auto-save completed on visibility change');
          } catch (error) {
            console.error('Error during auto-save on visibility change:', error);
          }
        };
        
        // Execute the auto-save without waiting
        performAutoSave();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup event listeners
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Auto-save on component unmount if not already saved
      if (!savedRef.current && currentResultsRef.current.length > 0) {
        console.log('Component unmounting, attempting to save results...');
        
        // Create a synchronous version that will block unmounting briefly
        const saveResults = async () => {
          try {
            // Filter out any processing results as they're incomplete
            const completedResults = currentResultsRef.current.filter(
              result => result.status === 'done' || result.status === 'error' || result.status === 'stopped'
            );
            
            if (completedResults.length > 0) {
              savedRef.current = true;
              const finishedId = await finishAnalysis(id, completedResults, 'stopped');
              console.log('Saved on unmount:', finishedId);
            }
          } catch (error) {
            console.error('Error saving on unmount:', error);
          }
        };
        
        // Execute save but don't wait for it to complete
        saveResults();
      }
    };
  }, [id, user, authLoading, router]);

  // Handle search results update
  const handleResultsUpdate = async (results: SearchResult[]) => {
    if (!user) return;
    
    // Update ref for auto-save functionality
    currentResultsRef.current = results;
    
    try {
      await updateAnalysisResults(id, results);
    } catch (error) {
      console.error('Error updating results:', error);
    }
  };

  // Handle search completion
  const handleSearchComplete = async (results: SearchResult[], status: 'finished' | 'stopped') => {
    if (!user) {
      console.error('No user found in handleSearchComplete');
      return;
    }
    
    // Mark as saved
    savedRef.current = true;
    
    try {
      console.log(`Completing analysis with status: ${status} and ${results.length} results`);
      
      // Only validate user ID if it doesn't exist
      if (!user.uid) {
        console.error('User is authenticated but UID is missing');
        throw new Error('User ID is undefined');
      }
      
      // Filter out any processing results as they're incomplete
      const completedResults = results.filter(
        result => result.status === 'done' || result.status === 'error' || result.status === 'stopped'
      );
      
      console.log(`Found ${completedResults.length} completed results to save`);
      
      // Create a finished copy and get the new ID
      const finishedId = await finishAnalysis(id, completedResults, status);
      console.log(`Analysis finished with ID: ${finishedId}`);
      
      // Force navigation with direct window.location change to ensure it works
      // This is more reliable than router.push in some cases
      window.location.href = `/analysis/finished/${finishedId}?from=${id}`;
    } catch (error) {
      console.error('Error finishing analysis:', error);
      
      // Only show emergency save for specific errors
      if ((error as Error).message.includes('userId') || (error as Error).message.includes('ID')) {
        tryEmergencySave(results, status);
      } else {
        // For other errors, just show the error message
        alert(`Error saving results: ${(error as Error).message}. Your results may not be saved.`);
        
        // Even if there's an error, try to navigate to avoid being stuck
        setTimeout(() => {
          window.location.href = '/analysis/new';
        }, 2000); // Short delay to show the alert
      }
    }
  };
  
  // Separate function for emergency save to improve code organization
  const tryEmergencySave = async (results: SearchResult[], status: 'finished' | 'stopped') => {
    try {
      alert('Attempting emergency save of your search results...');
      
      // Try to directly recreate the analysis with the current user
      const auth = await import('firebase/auth');
      const currentUser = auth.getAuth().currentUser;
      
      if (currentUser && currentUser.uid) {
        // Manually create an analysis in Firebase
        const { push, ref, set } = await import('firebase/database');
        const { database } = await import('../../../firebase/config');
        
        // Filter for completed results only
        const validResults = results.filter(
          result => result.status === 'done' || result.status === 'error'
        );
        
        // Create an emergency analysis entry
        const emergencyRef = push(ref(database, 'analyses'));
        const emergencyId = emergencyRef.key;
        
        if (emergencyId) {
          // Use the stored original query or a default
          const searchQuery = originalQueryRef.current || 'Search results';
          console.log(`Using query for emergency save: ${searchQuery}`);
          
          await set(emergencyRef, {
            id: emergencyId,
            userId: currentUser.uid,
            query: searchQuery,
            results: validResults,
            status,
            createdAt: Date.now(),
            finishedAt: Date.now(),
            totalResults: validResults.length,
            successfulResults: validResults.filter(r => r.status === 'done').length
          });
          
          // Add to user's history
          const historyRef = ref(database, `users/${currentUser.uid}/history/${emergencyId}`);
          await set(historyRef, Date.now());
          
          alert('Your search results have been saved!');
          window.location.href = `/analysis/finished/${emergencyId}`;
          return;
        }
      }
    } catch (emergencyError) {
      console.error('Emergency save failed:', emergencyError);
      alert(`Emergency save failed: ${(emergencyError as Error).message}`);
      
      // Navigate to new search page
      window.location.href = '/analysis/new';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading analysis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button 
          onClick={() => router.push('/analysis/new')}
          className="back-button"
        >
          Back to Search
        </button>
      </div>
    );
  }

  return (
    <div className="analysis-page">
      <AdvancedSearch 
        initialQuery={query}
        analysisId={id}
        onResultsUpdate={handleResultsUpdate}
        onSearchComplete={handleSearchComplete}
      />
    </div>
  );
} 