import { database } from '../firebase/config';
import { ref, set, get, push, child } from 'firebase/database';

export interface QAItem {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
}

export interface WebsiteAnalysisSection {
  title: string;
  rating?: string;
  ratingColor?: string;
  details?: string[];
  content?: string;
  type: 'detail' | 'strength-concern';
}

export interface SummaryData {
  id: string;
  userId: string;
  url: string;
  shortSummary: string;
  detailedSummary: string;
  keywords: string;
  biasRating: number;
  websiteAnalysis: WebsiteAnalysisSection[] | string;
  qaHistory: QAItem[];
  languageCode: string;
  createdAt: number;
  updatedAt: number;
  status: 'processing' | 'finished';
  articleContent?: string;
  options?: {
    shortSummaryLength?: string;
    shortSummaryComplexity?: string;
    sentenceCount?: number;
    detailLevel?: string;
    detailComplexity?: string;
  };
}

// Create a new URL summary
export const createSummary = async (userId: string, url: string, language: string = 'en'): Promise<string> => {
  const summaryRef = push(ref(database, 'summaries'));
  const id = summaryRef.key as string;
  
  const summary: SummaryData = {
    id,
    userId,
    url,
    shortSummary: '',
    detailedSummary: '',
    keywords: '',
    biasRating: 0,
    websiteAnalysis: [],
    qaHistory: [],
    languageCode: language,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'processing'
  };
  
  await set(summaryRef, summary);
  return id;
};

// Update a summary with new data
export const updateSummary = async (id: string, data: Partial<SummaryData>): Promise<void> => {
  try {
    const summaryRef = ref(database, `summaries/${id}`);
    
    // Update the timestamp
    data.updatedAt = Date.now();
    
    // Update only the provided fields
    for (const [key, value] of Object.entries(data)) {
      await set(child(summaryRef, key), value);
    }
  } catch (error) {
    console.error(`Error updating summary ${id}:`, error);
    throw error;
  }
};

// Mark a summary as finished
export const finishSummary = async (id: string, data: Partial<SummaryData>): Promise<void> => {
  try {
    await updateSummary(id, {
      ...data,
      status: 'finished'
    });
    
    // Add to user's history
    if (data.userId) {
      await addToHistory(data.userId, id);
    }
  } catch (error) {
    console.error(`Error finishing summary ${id}:`, error);
    throw error;
  }
};

// Add a Q&A item to the summary
export const addQAItem = async (summaryId: string, question: string, answer: string): Promise<string> => {
  try {
    const summaryRef = ref(database, `summaries/${summaryId}`);
    const snapshot = await get(summaryRef);
    
    if (!snapshot.exists()) {
      throw new Error('Summary not found');
    }
    
    const summary = snapshot.val() as SummaryData;
    const qaHistory = summary.qaHistory || [];
    
    const qaItem: QAItem = {
      id: Date.now().toString(),
      question,
      answer,
      timestamp: Date.now()
    };
    
    qaHistory.push(qaItem);
    
    // Sort the qaHistory by timestamp in descending order before saving
    qaHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    await set(child(summaryRef, 'qaHistory'), qaHistory);
    await set(child(summaryRef, 'updatedAt'), Date.now());
    
    return qaItem.id;
  } catch (error) {
    console.error(`Error adding QA item to summary ${summaryId}:`, error);
    throw error;
  }
};

// Add summary to user's history
export const addToHistory = async (userId: string, summaryId: string): Promise<void> => {
  const historyRef = ref(database, `users/${userId}/summaryHistory/${summaryId}`);
  await set(historyRef, Date.now());
};

// Get user's summary history
export const getUserSummaryHistory = async (userId: string): Promise<SummaryData[]> => {
  // Get history IDs
  const historyRef = ref(database, `users/${userId}/summaryHistory`);
  const historySnapshot = await get(historyRef);
  
  if (!historySnapshot.exists()) {
    return [];
  }
  
  const historyIds = Object.keys(historySnapshot.val());
  
  // Get summary data for each history item
  const summaries: SummaryData[] = [];
  
  for (const id of historyIds) {
    const summaryRef = ref(database, `summaries/${id}`);
    const snapshot = await get(summaryRef);
    
    if (snapshot.exists()) {
      summaries.push(snapshot.val() as SummaryData);
    }
  }
  
  // Sort by updatedAt, newest first
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
};

// Get summary by ID
export const getSummary = async (id: string): Promise<SummaryData | null> => {
  const summaryRef = ref(database, `summaries/${id}`);
  const snapshot = await get(summaryRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return snapshot.val() as SummaryData;
};

// Check if a summary exists
export const summaryExists = async (id: string): Promise<boolean> => {
  const summaryRef = ref(database, `summaries/${id}`);
  const snapshot = await get(summaryRef);
  return snapshot.exists();
}; 