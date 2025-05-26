import { database } from '../firebase/config';
import { ref, set, get, remove, push, child, query, orderByChild, equalTo } from 'firebase/database';

export interface SearchResult {
  link: string;
  title: string;
  relevance: number;
  bias: number;
  biasAnalysis: string;
  summary: string;
  status: 'processing' | 'done' | 'error' | 'stopped';
  position: number;
  stopRequested?: boolean;
}

export interface AnalysisData {
  id: string;
  userId: string;
  query: string;
  results: SearchResult[];
  status: 'creating' | 'finished' | 'stopped';
  createdAt: number;
  finishedAt?: number;
  totalResults?: number;
  successfulResults?: number;
}

// Create a new analysis in 'creating' status
export const createAnalysis = async (userId: string, query: string): Promise<string> => {
  const analysisRef = push(ref(database, 'analyses'));
  const id = analysisRef.key as string;
  
  const analysis: AnalysisData = {
    id,
    userId,
    query,
    results: [],
    status: 'creating',
    createdAt: Date.now()
  };
  
  await set(analysisRef, analysis);
  return id;
};

// Update analysis with new results
export const updateAnalysisResults = async (id: string, results: SearchResult[]): Promise<void> => {
  try {
    console.log(`Updating analysis ${id} with ${results.length} results`);
    
    // Validate all results before saving to Firebase
    const validatedResults = results.map(result => {
      // Create a sanitized copy with default values for any undefined fields
      return {
        link: result.link || '',
        title: result.title || '',
        relevance: result.relevance || 0,
        bias: result.bias || 0,
        biasAnalysis: result.biasAnalysis || '',
        summary: result.summary || 'Processing...',
        status: result.status || 'processing',
        position: result.position || 0,
        stopRequested: result.stopRequested || false
      };
    });
    
    // Save the validated results
    const analysisRef = ref(database, `analyses/${id}`);
    await set(child(analysisRef, 'results'), validatedResults);
    console.log(`Successfully updated analysis ${id}`);
  } catch (error) {
    console.error(`Error updating analysis ${id}:`, error);
    throw error;
  }
};

// Remove duplicate analyses (those with same query and timestamps within 1 minute)
export const cleanupDuplicateAnalyses = async (userId: string): Promise<void> => {
  try {
    // Get all user analyses
    const analyses = await getUserHistory(userId);
    
    // Group analyses by query
    const analysesByQuery: Record<string, AnalysisData[]> = {};
    
    analyses.forEach(analysis => {
      if (!analysesByQuery[analysis.query]) {
        analysesByQuery[analysis.query] = [];
      }
      analysesByQuery[analysis.query].push(analysis);
    });
    
    // Find duplicates (analyses with same query created within 1 minute of each other)
    for (const query in analysesByQuery) {
      const group = analysesByQuery[query];
      
      // Skip if only one analysis with this query
      if (group.length <= 1) continue;
      
      // Sort by finishedAt, newest first
      group.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
      
      // Keep the first analysis (newest), consider others as potential duplicates
      const newest = group[0];
      
      for (let i = 1; i < group.length; i++) {
        const current = group[i];
        
        // If analyses are within 1 minute of each other, consider them duplicates
        const timeDiffMs = (newest.finishedAt || 0) - (current.finishedAt || 0);
        const isWithinOneMinute = timeDiffMs < 60000; // 60 seconds in milliseconds
        
        if (isWithinOneMinute) {
          console.log(`Found duplicate analysis: ${current.id} (duplicate of ${newest.id})`);
          
          // If the newest is "finished" and current is "stopped", or if newest has more results
          if ((newest.status === 'finished' && current.status === 'stopped') || 
              (newest.totalResults || 0) > (current.totalResults || 0)) {
            
            // Remove duplicate from history
            await removeFromHistory(userId, current.id);
            
            // Delete the analysis itself
            await remove(ref(database, `analyses/${current.id}`));
            console.log(`Deleted duplicate analysis: ${current.id}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up duplicate analyses:', error);
  }
};

// Remove analysis from user's history
export const removeFromHistory = async (userId: string, analysisId: string): Promise<void> => {
  const historyRef = ref(database, `users/${userId}/history/${analysisId}`);
  await remove(historyRef);
};

// Mark analysis as finished and create a finished copy
export const finishAnalysis = async (id: string, results: SearchResult[], status: 'finished' | 'stopped'): Promise<string> => {
  try {
    console.log(`Starting finishAnalysis for id: ${id} with ${results.length} results`);
    
    // Get the current analysis
    const analysisRef = ref(database, `analyses/${id}`);
    const snapshot = await get(analysisRef);
    
    if (!snapshot.exists()) {
      console.error(`Analysis with ID ${id} not found`);
      throw new Error('Analysis not found');
    }
    
    const analysis = snapshot.val() as AnalysisData;
    
    // Validate the analysis object
    if (!analysis) {
      console.error(`Analysis with ID ${id} exists but data is null`);
      throw new Error('Analysis data is null');
    }
    
    // Get the current user ID from Firebase Auth
    let userId = analysis.userId;
    
    // Ensure userId exists - if not, try to fix it
    if (!userId) {
      console.warn(`Analysis with ID ${id} has no userId, attempting to recover`);
      
      // See if we can determine the user from other properties
      // This is a fallback mechanism
      try {
        // Firebase might have an auth object we can use
        const auth = require('firebase/auth').getAuth();
        if (auth.currentUser && auth.currentUser.uid) {
          console.log(`Using current authenticated user: ${auth.currentUser.uid}`);
          userId = auth.currentUser.uid;
          
          // Update the original analysis with the correct userId
          await set(child(analysisRef, 'userId'), userId);
        } else {
          console.error('No authenticated user found');
          throw new Error('Cannot determine user ID for this analysis');
        }
      } catch (authError) {
        console.error('Error retrieving current user:', authError);
        throw new Error('Analysis has no userId and no current user available');
      }
    }
    
    console.log(`Analysis found with userId: ${userId}, query: ${analysis.query}`);
    
    // Filter out any incomplete or empty results
    const validResults = results.filter(result => {
      // Keep results that are done, have errors, or were explicitly stopped
      return result.status === 'done' || result.status === 'error' || result.status === 'stopped';
    });
    
    // If we have no valid results, create at least one placeholder result
    if (validResults.length === 0) {
      // Create a placeholder result with the original query
      validResults.push({
        link: '',
        title: status === 'finished' ? 'Search was done' : 'Search was stopped',
        relevance: 0,
        bias: 0,
        biasAnalysis: '',
        summary: status === 'finished' 
          ? `Search for "${analysis.query || 'unknown query'}" was completed successfully.`
          : `Search for "${analysis.query || 'unknown query'}" was stopped before any results could be processed.`,
        status: status === 'finished' ? 'done' : 'stopped',
        position: 0
      });
    }
    
    // Count successful results
    const totalResults = validResults.length;
    const successfulResults = validResults.filter(r => r.status === 'done').length;
    
    // Create a new finished analysis
    const finishedAnalysisRef = push(ref(database, 'analyses'));
    const finishedId = finishedAnalysisRef.key as string;
    
    const finishedAnalysis: AnalysisData = {
      id: finishedId,
      userId: userId,
      query: analysis.query || '',
      results: validResults,
      status,
      createdAt: analysis.createdAt || Date.now(),
      finishedAt: Date.now(),
      totalResults,
      successfulResults
    };
    
    // Log for debugging
    console.log(`Finishing analysis ${id} with ${validResults.length} valid results (${successfulResults} successful)`);
    
    // Save the finished analysis
    await set(finishedAnalysisRef, finishedAnalysis);
    
    // Add to user's history
    await addToHistory(userId, finishedId);
    
    // Delete the creating analysis
    await remove(analysisRef);
    
    // Clean up any duplicate analyses
    try {
      await cleanupDuplicateAnalyses(userId);
    } catch (cleanupError) {
      console.error('Error cleaning up duplicates:', cleanupError);
      // Continue anyway as the main operation succeeded
    }
    
    return finishedId;
  } catch (error) {
    console.error('Error in finishAnalysis:', error);
    throw error;
  }
};

// Add analysis to user's history
export const addToHistory = async (userId: string, analysisId: string): Promise<void> => {
  const historyRef = ref(database, `users/${userId}/history/${analysisId}`);
  await set(historyRef, Date.now());
};

// Get user's history
export const getUserHistory = async (userId: string): Promise<AnalysisData[]> => {
  // Get history IDs
  const historyRef = ref(database, `users/${userId}/history`);
  const historySnapshot = await get(historyRef);
  
  if (!historySnapshot.exists()) {
    return [];
  }
  
  const historyIds = Object.keys(historySnapshot.val());
  
  // Get analysis data for each history item
  const analyses: AnalysisData[] = [];
  
  for (const id of historyIds) {
    const analysisRef = ref(database, `analyses/${id}`);
    const snapshot = await get(analysisRef);
    
    if (snapshot.exists()) {
      analyses.push(snapshot.val() as AnalysisData);
    }
  }
  
  // Sort by finishedAt, newest first
  return analyses.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
};

// Get analysis by ID
export const getAnalysis = async (id: string): Promise<AnalysisData | null> => {
  const analysisRef = ref(database, `analyses/${id}`);
  const snapshot = await get(analysisRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return snapshot.val() as AnalysisData;
};

// Check if an analysis exists
export const analysisExists = async (id: string): Promise<boolean> => {
  const analysisRef = ref(database, `analyses/${id}`);
  const snapshot = await get(analysisRef);
  return snapshot.exists();
}; 