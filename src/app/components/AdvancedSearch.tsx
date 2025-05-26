'use client';

import React, { useState, useRef, KeyboardEvent, useEffect } from 'react';
import Image from 'next/image';
import './AdvancedSearch.css';
import { SearchResult } from '../services/analysisService';

interface AdvancedSearchProps {
  initialQuery: string;
  onResultsUpdate: (results: SearchResult[]) => Promise<void>;
  onSearchComplete: (results: SearchResult[], status: 'finished' | 'stopped') => Promise<void>;
}

const AdvancedSearch: React.FC<AdvancedSearchProps> = ({ 
  initialQuery, 
  onResultsUpdate,
  onSearchComplete
}) => {
  const [query, setQuery] = useState<string>(initialQuery);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [processingCount, setProcessingCount] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(false);
  const displayedLinks = useRef<Set<string>>(new Set());
  const currentPage = useRef<number>(1);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const COHERE_API_KEY: string = 'ReLPxJpofFtyqSaiUdDaIGyDZkfNbs4MbADR1joi';
  const GOOGLE_API_KEY: string = 'AIzaSyA8Wo5HjCieYYbaVw9z3sGoQsirXg7ttqo';
  const GOOGLE_CX: string = 'f1bc77c2304554b5a';
  const maxPages: number = 10;

  // Start search automatically with the initial query
  useEffect(() => {
    if (initialQuery && !isSearching && !loading && results.length === 0) {
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        performSearch();
      }, 500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Update Firebase when results change
  useEffect(() => {
    if (results.length > 0) {
      onResultsUpdate(results).catch(error => {
        console.error('Error updating results:', error);
      });
    }
  }, [results, onResultsUpdate]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Add effect to detect when all processing is complete
  useEffect(() => {
    if (isSearching && processingCount === 0 && results.length > 0 && !isStopped) {
      // All processing is complete, trigger search completion
      const completeSearch = async () => {
        try {
          // Set flags first to prevent multiple calls
          setIsSearching(false);
          setLoading(false);
          
          console.log(`All processing complete with ${results.length} results. Updating Firebase...`);
          
          // Make sure we have the most up-to-date results
          // Validate and filter results first
          const completedResults = results.filter(result => 
            result.status === 'done' || result.status === 'error'
          );
          
          // Only update Firebase if we have completed results
          if (completedResults.length > 0) {
            try {
              await onResultsUpdate(completedResults);
              console.log(`Firebase updated with ${completedResults.length} completed results. Completing search...`);
            } catch (updateError) {
              console.error('Error updating results in Firebase:', updateError);
              // Continue anyway to try completing the search
            }
            
            // Then complete the search and redirect
            try {
              await onSearchComplete(completedResults, 'finished');
            } catch (completeError) {
              console.error('Error completing search:', completeError);
              alert(`Error: ${(completeError as Error).message}`);
            }
          } else {
            console.log('No completed results to save. Search may have been interrupted.');
            await onSearchComplete(results, 'stopped');
          }
        } catch (error) {
          console.error('Error during search completion:', error);
          // Even if there's an error, make sure we reset the UI state
          setIsSearching(false);
          setLoading(false);
          
          // Try to show an error to the user
          alert(`Error completing search: ${(error as Error).message}`);
        }
      };
      completeSearch();
    }
  }, [processingCount, isSearching, results, isStopped, onSearchComplete, onResultsUpdate]);

  const googleSearch = async (searchQuery: string, startIndex: number = 1): Promise<GoogleSearchResponse> => {
    try {
      // Check if stopped before making API call
      if (isStopped) {
        throw new Error('Search was stopped');
      }

    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(searchQuery)}&start=${startIndex}`;
      const response = await fetch(url, { 
        signal: abortControllerRef.current?.signal 
      });
      
      if (!response.ok) {
        throw new Error(`Google search error: ${response.status}`);
      }
      
    return await response.json();
    } catch (error) {
      console.error("Google search error:", error);
      // Return empty response instead of throwing
      return { items: [] };
    }
  };

  const fetchContent = async (url: string, snippet?: string): Promise<string> => {
    // Check if stopped before making API call
    if (isStopped) {
      throw new Error('Search was stopped');
    }
    
    // Always have a fallback content
    const fallbackContent = snippet || `Content for ${url} could not be retrieved`;
    
    // First attempt with Jina AI
    try {
    const data = JSON.stringify({
      url: url
    });

    const response = await fetch('https://r.jina.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DNT': '1',
        'X-Engine': 'browser',
        'X-No-Cache': 'true',
        'X-Return-Format': 'markdown',
        'X-With-Images-Summary': 'all',
        'X-With-Links-Summary': 'all',
      },
        body: data,
        signal: abortControllerRef.current?.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

      const content = await response.text();
      if (content && content.length > 0) {
        return content;
      } else {
        throw new Error('Empty content received');
      }
    } catch (error) {
      // Check if stopped after error
      if (isStopped) {
        throw new Error('Search was stopped');
      }
      
      console.warn(`Error with primary content fetching method: ${error}`);
      
      // If we have a snippet from Google, use it as fallback immediately
      if (snippet && snippet.length > 100) {
        return `[Using Google snippet]: ${snippet}`;
      }
      
      // Second attempt - using allorigins.win as CORS proxy
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
          signal: abortControllerRef.current?.signal
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error with allorigins proxy! status: ${response.status}`);
        }
        
        const html = await response.text();
        // Extract text content from HTML
        const textContent = html.replace(/<[^>]*>/g, ' ')
                               .replace(/\s+/g, ' ')
                               .trim();
        
        if (textContent && textContent.length > 0) {
          return textContent.substring(0, 3000); // Limit content length
        } else {
          throw new Error('Empty content received from proxy');
        }
      } catch {
        // Use url domain as a simple content source
        try {
          const domain = new URL(url).hostname;
          return `This is content from ${domain}. The site appears to be about ${domain.split('.')[0]}. Please visit the site directly for more information.`;
        } catch {
          // If all else fails, return the fallback
          return fallbackContent;
        }
      }
    }
  };

  const analyzeContent = async (searchQuery: string, content: string): Promise<string> => {
    // Check if stopped before making API call
    if (isStopped) {
      throw new Error('Search was stopped');
    }
    
    const prompt = `Analyze this content and provide:
    1. A relevance percentage (0-100) to the query: "${searchQuery}"
    2. A bias percentage (0-100) based on these factors:
       - Domain credibility (.gov, .edu = low bias, etc.)
       - Language tone (emotional vs neutral)
       - Source quality and citations
       - Information completeness
       - Funding/ownership transparency
       - Factual consistency
       - Target audience objectivity
       - Community engagement balance
       
    Format your response exactly like this:
    Relevance: X%
    Bias: Y%
    Bias Analysis:
    - Domain: [Brief analysis]
    - Language: [Brief analysis]
    - Sources: [Brief analysis]
    - Completeness: [Brief analysis]
    
    Summary: [Brief content summary, max 150 words]

    Content: ${content.substring(0, 2000)}`;

    try {
    const response = await fetch('https://api.cohere.ai/v1/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        model: 'command-r-08-2024',
        temperature: 0.7,
        }),
        signal: abortControllerRef.current?.signal
      });

      if (!response.ok) {
        console.error(`Cohere API error status: ${response.status}`);
        // Instead of throwing, provide a fallback analysis
        return generateFallbackAnalysis(content, searchQuery);
      }

    const data = await response.json();
      if (data.text && data.text.includes("Relevance:")) {
    return data.text;
      } else {
        console.error("Invalid API response format:", data);
        return generateFallbackAnalysis(content, searchQuery);
      }
    } catch (error) {
      // Check if stopped after error
      if (isStopped) {
        throw new Error('Search was stopped');
      }
      
      console.error(`Error with Cohere API: ${error}`);
      // Generate a fallback analysis
      return generateFallbackAnalysis(content, searchQuery);
    }
  };

  // Helper function to generate a fallback analysis when the API fails
  const generateFallbackAnalysis = (content: string, query: string): string => {
    // Simple keyword matching for relevance
    const relevanceScore = content.toLowerCase().includes(query.toLowerCase()) ? 70 : 50;
    
    // Extract domain from content if possible
    let domain = "Unknown";
    try {
      const urlMatch = content.match(/https?:\/\/([^\/\s]+)/);
      if (urlMatch) {
        domain = urlMatch[1];
      }
    } catch {
      // Ignore errors in domain extraction
    }
    
    // For summary generation
    const summary = content.length > 300 ? 
      content.substring(0, 300) + "..." : 
      content;
    
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    domain; // Use domain to prevent unused variable warning
    
    return `Relevance: ${relevanceScore}%
Bias: 50%
Bias Analysis:
- Domain: Analysis not available (using local evaluation)
- Language: Analysis not available (using local evaluation)
- Sources: Unable to analyze sources (using local evaluation)
- Completeness: Content may be incomplete (using local evaluation)

Summary: ${summary}`;
  };

  const processResult = async (result: GoogleSearchItem, searchQuery: string, position: number): Promise<void> => {
    // Check if already stopped before starting
    if (isStopped) {
      return;
    }
    
    try {
      // Check if this specific result has been flagged as stopped
      let isResultStopped = false;
      
      // First check if this result should be processed at all
      setResults(prev => {
        const existingResult = prev[position];
        isResultStopped = existingResult?.stopRequested === true;
        return prev;
      });
      
      if (isResultStopped) {
        return; // Skip processing if this result was already stopped
      }
      
      // Don't fetch content or analyze if we're already stopped
      if (isStopped) {
        return;
      }
      
      // Attempt to fetch and analyze content - API calls may still complete
      // even if the search is stopped during the process
      let content, analysis, relevance = 0, bias = 0, biasAnalysis = '', summary = '';
      
      try {
        // Update the result status to show it's being processed
        setResults(prev => {
          const newResults = [...prev];
          if (position < newResults.length) {
            newResults[position] = {
              ...newResults[position],
              status: 'processing',
              summary: 'Fetching content...'
            };
          }
          return newResults;
        });
        
        // Make sure to update Firebase with processing status
        await onResultsUpdate([...results]);
        
        content = await fetchContent(result.link, result.snippet);
        if (isStopped) return;
        
        // Update status after content fetch
        setResults(prev => {
          const newResults = [...prev];
          if (position < newResults.length) {
            newResults[position] = {
              ...newResults[position],
              status: 'processing',
              summary: 'Analyzing content...'
            };
          }
          return newResults;
        });
        
        // Make sure to update Firebase with intermediate status
        await onResultsUpdate([...results]);
        
        analysis = await analyzeContent(searchQuery, content);
        if (isStopped) return;
      
      // Extract percentages and analysis
      const relevanceMatch = analysis.match(/Relevance:\s*(\d+)%/);
      const biasMatch = analysis.match(/Bias:\s*(\d+)%/);
      
        relevance = relevanceMatch ? parseInt(relevanceMatch[1]) : 0;
        bias = biasMatch ? parseInt(biasMatch[1]) : 0;
      
      // Extract bias analysis sections
        biasAnalysis = analysis.split('Bias Analysis:')[1]?.split('Summary:')[0] || '';
      
      const summaryStart = analysis.indexOf('Summary:');
        summary = summaryStart !== -1 ? 
        analysis.slice(summaryStart).split('\n')[1] : 
        'No summary available';
      } catch (error) {
        console.error(`Error processing result ${result.link}:`, error);
        // Instead of showing an error, create a basic analysis
        const fallbackAnalysis = generateFallbackAnalysis(
          result.snippet || `Content from ${result.link}`,
          searchQuery
        );
        
        // Extract values from fallback
        const relevanceMatch = fallbackAnalysis.match(/Relevance:\s*(\d+)%/);
        const biasMatch = fallbackAnalysis.match(/Bias:\s*(\d+)%/);
        
        relevance = relevanceMatch ? parseInt(relevanceMatch[1]) : 50;
        bias = biasMatch ? parseInt(biasMatch[1]) : 50;
        
        biasAnalysis = fallbackAnalysis.split('Bias Analysis:')[1]?.split('Summary:')[0] || '';
        
        const summaryStart = fallbackAnalysis.indexOf('Summary:');
        summary = summaryStart !== -1 ? 
          fallbackAnalysis.slice(summaryStart).split('\n')[1] : 
          result.snippet || 'No summary available';
      }

      // Only update if we're not stopped and check current status of the result
      // to make sure we don't override a "stopped" status
      setResults(prev => {
        const newResults = [...prev];
        
        if (position < newResults.length) {
          const currentResult = newResults[position];
          
          // Only update if the result hasn't been marked as stopped
          if (currentResult.status !== 'stopped' && !currentResult.stopRequested) {
            newResults[position] = {
              ...currentResult,
        relevance,
        bias,
        biasAnalysis,
              summary,
              status: 'done',
      };
          }
        }
        
        return newResults;
      });
      
      // Update Firebase with the completed result
      await onResultsUpdate([...results]);
    } finally {
      // Always decrement the processing count when done
      if (!isStopped) {
        // Decrement the processing count
        setProcessingCount(count => {
          const newCount = count - 1;
          // Only set loading to false if there are no more items being processed
          if (newCount <= 0) {
            setLoading(false);
            // We'll let the useEffect handle setting isSearching to false
            // and triggering onSearchComplete
          }
          return newCount;
        });
      }
    }
  };

  const stopSearch = async (): Promise<void> => {
    // Set the stopped flag first
    setIsStopped(true);
    
    // Then abort any ongoing fetches
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Update status and filter results
    const updatedResults = [...results];
    
    // Flag to track if we've found a processing item
    let foundProcessing = false;
    let firstProcessingIndex = -1;
    
    // First pass: find the first processing item
    for (let i = 0; i < updatedResults.length; i++) {
      if (updatedResults[i].status === 'processing') {
        foundProcessing = true;
        firstProcessingIndex = i;
        break;
      }
    }
    
    // If we found a processing item, mark it as stopped and filter out later items
    if (foundProcessing && firstProcessingIndex >= 0) {
      // Update the first processing item to stopped
      updatedResults[firstProcessingIndex] = {
        ...updatedResults[firstProcessingIndex],
        status: 'stopped',
        summary: 'Search was stopped',
        stopRequested: true
      };
      
      // Keep only items up to and including the first processing item
      const filteredResults = updatedResults.slice(0, firstProcessingIndex + 1);
      setResults(filteredResults);
      
      // Notify parent about search completion with stopped status
      await onSearchComplete(filteredResults, 'stopped');
    } else {
      // If no processing items found, return all done/error items
      const filteredResults = updatedResults.filter(result => 
        result.status === 'done' || result.status === 'error'
      );
      setResults(filteredResults);
      
      // Notify parent about search completion with stopped status
      await onSearchComplete(filteredResults, 'stopped');
    }
    
    // Reset UI state
    setIsSearching(false);
    setLoading(false);
    setProcessingCount(0);
  };

  const performSearch = async (): Promise<void> => {
    if (!query.trim()) {
      alert('Vui lòng nhập nội dung tìm kiếm!');
      return;
    }

    // Reset the stopped flag for a new search
    setIsStopped(false);
    
    // Create a new AbortController for this search
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setIsSearching(true);
    
    // Only clear results if this is a new search
    if (currentPage.current === 1) {
      setResults([]);
      displayedLinks.current.clear();
    }

    try {
      const searchResults = await googleSearch(query, (currentPage.current - 1) * 10 + 1);
      
      // Check if stopped after getting search results
      if (isStopped) {
        return;
      }
      
      if (searchResults.items && searchResults.items.length > 0) {
        // Filter out already displayed links
        const newResults = searchResults.items.filter(item => !displayedLinks.current.has(item.link));
        
        if (newResults.length === 0) {
          console.log('No new results found. Try refining your search.');
          setLoading(false);
          setIsSearching(false);
          
          // Notify parent about search completion
          await onSearchComplete(results, 'finished');
          return;
        }
        
        // Set the initial processing count based on the number of results
        setProcessingCount(newResults.length);
        
        // Process results one by one
        for (let i = 0; i < newResults.length; i++) {
          // Check if stopped before adding next result
          if (isStopped) {
            break;
          }
          
          const result = newResults[i];
          displayedLinks.current.add(result.link);
          
          // Add a single placeholder result at a time
          const currentPosition = results.length + i;
          
          // Only add if not stopped
          if (!isStopped) {
            setResults(prev => {
              const newArray = [...prev];
              newArray.push({
                link: result.link,
                title: result.title,
                relevance: 0,
                bias: 0,
                biasAnalysis: '',
                summary: 'Processing...',
                status: 'processing',
                position: currentPosition
              });
              return newArray;
            });
            
            // Process the result immediately after adding it - don't increment the processing count here
            // since we already set it for all results at once
            await processResult(result, query, currentPosition);
            }
          
          // Check after each result is processed if we need to stop
          if (isStopped) {
            break;
          }
        }

        // Update pagination
        currentPage.current++;
        if (currentPage.current > maxPages) {
          currentPage.current = 1;
          
          // If we've reached the max pages and there's still more processing to do,
          // we'll set a flag that will be checked in the processing completion useEffect
          if (!isStopped) {
            console.log('Reached maximum pages. Search will complete when all results are processed.');
            
            // If all processing is already done, immediately complete the search
            if (processingCount === 0 && !isSearching) {
              console.log('All processing already complete. Completing search now.');
              
              // Only complete if we have results and haven't already started completion
              if (results.length > 0) {
                // Set searching state to prevent duplicate completion
                setIsSearching(true);
                
                // The processing useEffect will handle completion when it detects processingCount === 0
              }
            }
            // Otherwise, the useEffect will handle it when processingCount reaches 0
          }
        }
      } else {
        console.log('No results found.');
        if (!isStopped) {
          setLoading(false);
          setIsSearching(false);
          
          // Notify parent about search completion
          await onSearchComplete(results, 'finished');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
      alert(`Lỗi: ${(error as Error).message}`);
      }
      if (!isStopped) {
      setLoading(false);
        setIsSearching(false);
        
        // Notify parent about search completion with current results
        await onSearchComplete(results, 'finished');
      }
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !isSearching) {
      performSearch();
    }
  };

  const getRelevanceColor = (relevance: number): string => {
    return relevance > 70 ? '#28a745' : 
           relevance > 40 ? '#ffc107' : '#dc3545';
  };

  const getBiasColor = (bias: number): string => {
    return bias < 30 ? '#28a745' : 
           bias < 60 ? '#ffc107' : '#dc3545';
  };

  const getStatusIndicator = (status: string): React.ReactElement => {
    if (status === 'processing') {
      return <div className="status-indicator processing">Processing...</div>;
    } else if (status === 'error') {
      return <div className="status-indicator error">Error</div>;
    } else if (status === 'stopped') {
      return <div className="status-indicator stopped">Stopped</div>;
    } else {
      return <div className="status-indicator done">Done</div>;
    }
  };

  return (
    <div className="container">
      <h1>Analysis Results</h1>
      <div className="search-section">
        <div className="search-box">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Nhập nội dung cần tìm kiếm..."
            className={`search-input ${isSearching || loading || processingCount > 0 ? 'disabled' : ''}`}
            disabled={isSearching || loading || processingCount > 0}
          />
          {isSearching || loading || processingCount > 0 ? (
            <button onClick={stopSearch} className="stop-button">
              Dừng
            </button>
          ) : (
          <button onClick={performSearch} className="search-button">
            Tìm Kiếm
          </button>
          )}
        </div>
        {loading && (
          <div className="loading">
            <Image 
              src="https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif" 
              alt="Loading..." 
              width={100}
              height={100}
            />
          </div>
        )}
      </div>
      <div className="results-container">
        {results.map((result, index) => (
          <div key={index} className="result-card">
            <div className="metrics-container">
              {result.status === 'done' ? (
                <>
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
                </>
              ) : (
                <div className="metrics-placeholder">
                  {getStatusIndicator(result.status)}
                </div>
              )}
            </div>
            <a href={result.link} className="url-title" target="_blank" rel="noopener noreferrer">
              {result.title}
            </a>
            {result.status === 'done' ? (
              <>
            <div className="bias-analysis">
              {result.biasAnalysis.split('-').map((point, idx) => 
                point.trim() ? (
                  <div key={idx} className="bias-point">• {point.trim()}</div>
                ) : null
              )}
            </div>
            <div className="summary">{result.summary}</div>
              </>
            ) : (
              <div className="summary">{result.summary}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Add missing interfaces
interface GoogleSearchItem {
  link: string;
  title: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

export default AdvancedSearch;