'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../auth/AuthProvider';
import './summarize.css';
import { createSummary, updateSummary, finishSummary, addQAItem, getSummary } from '../../services/summarizeService';

// Define interfaces for the summarizer
interface MetaInfo {
  urlHostname: string;
  analysisTime: string;
  biasRating: number;
  biasColor: string;
}

interface QAItem {
  id: string;
  question: string;
  answer: string;
  timestamp?: number;
}

interface WebsiteAnalysisSection {
  title: string;
  rating?: string;
  ratingColor?: string;
  details?: string[];
  content?: string; // For strengths/concerns
  type: 'detail' | 'strength-concern';
}

// Language options for the summarizer
const languageOptions = [
  { value: "en", label: "English" },
  { value: "vi", label: "Vietnamese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese (Simplified)" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
];

const getLanguageName = (code: string): string => {
  const lang = languageOptions.find(l => l.value === code);
  return lang ? lang.label : 'English';
};

export default function UrlSummarizerPage() {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSummaryContainer, setShowSummaryContainer] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [languageSelect, setLanguageSelect] = useState('en');
  const [shortSummaryLength, setShortSummaryLength] = useState('normal');
  const [sentenceCount, setSentenceCount] = useState(4);
  const [showCustomSentences, setShowCustomSentences] = useState(false);
  const [shortSummaryComplexity, setShortSummaryComplexity] = useState('normal');
  
  const [detailLevel, setDetailLevel] = useState('normal');
  const [detailComplexity, setDetailComplexity] = useState('normal');

  const [metaInfo, setMetaInfo] = useState<MetaInfo | null>(null);
  const [shortSummary, setShortSummary] = useState('');
  const [detailedSummary, setDetailedSummary] = useState('');
  const [keywords, setKeywords] = useState('');
  const [websiteAnalysisSections, setWebsiteAnalysisSections] = useState<WebsiteAnalysisSection[]>([]);

  const [questionInput, setQuestionInput] = useState('');
  const [qaHistory, setQaHistory] = useState<QAItem[]>([]);
  const [qaLanguageSelect, setQaLanguageSelect] = useState('en');
  const [currentArticleContent, setCurrentArticleContent] = useState('');
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);
  
  // Get URL from search params
  useEffect(() => {
    const urlParam = searchParams?.get('url');
    
    if (urlParam) {
      // Check if the URL contains a summary ID
      const lastSlashIndex = urlParam.lastIndexOf('/');
      
      if (lastSlashIndex !== -1 && lastSlashIndex < urlParam.length - 1) {
        // Extract the actual URL and the summary ID
        const actualUrl = urlParam.substring(0, lastSlashIndex);
        const summaryId = urlParam.substring(lastSlashIndex + 1);
        
        // Load existing summary data if it has an ID
        if (summaryId && summaryId.length > 5) {
          loadExistingSummary(summaryId);
        } else {
          // Set URL input and start analysis
          setUrlInput(actualUrl);
          handleAnalyzePage(actualUrl);
        }
      } else {
        // No summary ID, just set URL and start analysis
        setUrlInput(urlParam);
        handleAnalyzePage(urlParam);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    setShowCustomSentences(shortSummaryLength === 'custom');
  }, [shortSummaryLength]);

  const formatMarkdown = (text: string): string => {
    if (!text) return '';
    let html = text;
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>');
    
    // Fix the regex that was using 's' flag
    const listItemsRegex = /<li>.*<\/li>/;
    const listItemMatches = html.match(listItemsRegex);
    if (listItemMatches) {
      for (const match of listItemMatches) {
        html = html.replace(match, `<ul>${match}</ul>`);
      }
    }
    
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n(?![<])/g, '<br>');
    return html;
  };
  
  const showError = (message: string) => {
    setErrorMessage(message);
    setIsLoading(false);
    setTimeout(() => {
      setErrorMessage('');
    }, 5000);
  };

  const fetchContent = async (url: string): Promise<string> => {
    const readerUrl = `https://r.jina.ai/`;
    const response = await fetch(readerUrl, {
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
      body: JSON.stringify({ url })
    });
    
    if (!response.ok) {
      throw new Error('Không thể đọc nội dung từ URL này (Failed to fetch content from URL)');
    }
    return await response.text();
  };

  const cohereChat = async (prompt: string, model = 'command-r-08-2024', temperature = 0.7) => {
    const COHERE_API_KEY = 'DV8M9r9WJiT9odNdgqgp0Pirs51phdoAT5KeKGe5';
    
    if (!COHERE_API_KEY) {
      throw new Error('Cohere API key is not configured.');
    }
    
    const response = await fetch('https://api.cohere.ai/v1/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        model: model,
        temperature: temperature,
      })
    });
    
    const data = await response.json();
    if (!response.ok || data.text === undefined) {
      console.error("Cohere API Error:", data);
      throw new Error(data.message || 'Error calling Cohere API');
    }
    return data.text;
  };

  const generateShortSummary = async (content: string): Promise<string> => {
    const langInstruction = `You must respond in ${getLanguageName(languageSelect)} language only. `;
    let numSentences = "2-4";
    if (shortSummaryLength === 'simple') numSentences = "1-2";
    else if (shortSummaryLength === 'custom') numSentences = sentenceCount.toString();
    
    const prompt = `${langInstruction}Summarize the following content in ${numSentences} sentences. Use ${shortSummaryComplexity} level vocabulary:\n${content.substring(0, 2000)}`;
    return cohereChat(prompt);
  };

  const generateDetailedSummary = async (content: string): Promise<string> => {
    const langInstruction = `You must respond in ${getLanguageName(languageSelect)} language only. `;
    let detailPromptInstruction;
    switch(detailLevel) {
      case 'normal': detailPromptInstruction = "Create a detailed summary with 5-7 main points. Include key concepts and basic analysis."; break;
      case 'very': detailPromptInstruction = "Create a very detailed summary with 8-12 main points. Include thorough analysis, supporting evidence, and interconnections between points."; break;
      case 'super': detailPromptInstruction = "Create an extremely comprehensive summary with 15-20 main points. Include in-depth analysis, detailed examples, statistical data when available, cause-effect relationships, and broader implications."; break;
      case 'thinking': detailPromptInstruction = "Create an exhaustive analytical summary with 20+ points. Include critical analysis, expert perspectives, competing viewpoints, historical context, future implications, and detailed supporting evidence for each point."; break;
      default: detailPromptInstruction = "Create a detailed summary.";
    }
    const prompt = `${langInstruction}${detailPromptInstruction} Organize it into clear sections with headers. Use ${detailComplexity} level vocabulary. Format with markdown:\n${content.substring(0, 3000)}`;
    return cohereChat(prompt);
  };

  const extractKeywordsCohere = async (content: string): Promise<string> => {
    const prompt = `Extract the 5-7 most important keywords from the following content:\n${content.substring(0, 2000)}`;
    return cohereChat(prompt);
  };
  
  const analyzeBias = async (content: string, url: string): Promise<string> => {
    const prompt = `Analyze this content and provide:
A bias percentage (0-100) based on these factors:
- Domain credibility (.gov, .edu = low bias, etc.)
- Language tone (emotional vs neutral)
- Source quality and citations
- Information completeness
- Funding/ownership transparency
- Factual consistency
- Target audience objectivity
- Community engagement balance

Format your response exactly like this:
Bias: X%
Analysis:
- Domain: [Brief analysis of ${new URL(url).hostname}]
- Language: [Brief analysis]
- Sources: [Brief analysis]
- Completeness: [Brief analysis]

Content: ${content.substring(0, 2000)}`;
    return cohereChat(prompt);
  };

  const analyzeWebsiteDetails = async (url: string): Promise<string> => {
    const prompt = `Analyze this website (${url}) and provide information in this exact format:

Website Purpose & Niche: [Moderate/Good/Bad]
◆ Type: [News/Blog/E-commerce/etc]
◆ Topics: [Main topics covered]
◆ Audience: [Target audience description]
◆ Focus: [Content focus and style]

Ownership & Background: [Moderate/Good/Bad]
◆ Owner: [Individual/Organization name]
◆ Type: [Independent/Network/Corporate]
◆ Affiliations: [Known connections and partnerships]
◆ History: [Brief history and changes]

People & Team: [Moderate/Good/Bad]
◆ Key People: [Leaders and important team members]
◆ Experience: [Team background and expertise]
◆ Reputation: [Team's standing in industry]
◆ Transparency: [Level of team information available]

Content Quality: [Moderate/Good/Bad]
◆ Content Type: [Original/Curated/Mixed]
◆ Quality: [Content standards and consistency]
◆ Citations: [Source attribution practices]
◆ Fact-checking: [Verification processes]

Business Model: [Moderate/Good/Bad]
◆ Revenue: [How the site makes money]
◆ Funding: [Financial backing sources]
◆ Backing: [Support and sponsorships]
◆ Transparency: [Financial disclosure level]

Reputation: [Moderate/Good/Bad]
◆ Standing: [Position in industry]
◆ Feedback: [User/reader sentiment]
◆ Issues: [Known controversies]
◆ Trust: [Overall credibility]

External Relations: [Moderate/Good/Bad]
◆ Partners: [Key collaborations]
◆ Politics: [Political leanings if any]
◆ Influence: [Impact in field]
◆ Network: [Connections and reach]

Key Strengths:
• [First strength]
• [Second strength]
• [Third strength]

Key Concerns:
• [First concern]
• [Second concern]
• [Third concern]`;
    return cohereChat(prompt);
  };
  
  const parseWebsiteAnalysis = (analysisText: string): WebsiteAnalysisSection[] => {
    if (!analysisText) return [];
    const sectionsRaw = analysisText.split('\n\n');
    const parsedSections: WebsiteAnalysisSection[] = [];

    sectionsRaw.forEach(sectionStr => {
      if (!sectionStr.trim()) return;

      if (sectionStr.startsWith('Key Strengths:') || sectionStr.startsWith('Key Concerns:')) {
        parsedSections.push({
          title: sectionStr.startsWith('Key Strengths:') ? 'Key Strengths' : 'Key Concerns',
          content: sectionStr,
          type: 'strength-concern'
        });
      } else {
        const lines = sectionStr.split('\n');
        const titleLine = lines[0];
        const [titleText, ratingText] = titleLine.split(':');
        const rating = ratingText ? ratingText.trim().replace(/\[|\]/g, '') : 'Moderate';
        const ratingColor = rating.toLowerCase().includes('good') ? '#28a745' :
                            rating.toLowerCase().includes('moderate') ? '#ffc107' : '#dc3545';
        
        const details = lines.slice(1).map(line => line.trim()).filter(line => line.startsWith('◆') || line.startsWith('•'));

        parsedSections.push({
          title: titleText.trim(),
          rating,
          ratingColor,
          details,
          type: 'detail'
        });
      }
    });
    return parsedSections;
  };

  const handleAnalyzePage = async (urlToAnalyze: string = urlInput) => {
    if (!urlToAnalyze.trim()) {
      showError('Please enter a URL');
      return;
    }
    if (!urlToAnalyze.startsWith('http')) {
      showError('Please enter a valid URL starting with http:// or https://');
      return;
    }

    setIsLoading(true);
    setShowSummaryContainer(false);
    setErrorMessage('');
    setQaHistory([]); // Clear previous Q&A
    
    // Create new summary in Firebase
    let summaryId = '';
    try {
      // Only create a summary if we have a user
      if (user) {
        summaryId = await createSummary(user.uid, urlToAnalyze, languageSelect);
      }

      const content = await fetchContent(urlToAnalyze);
      if (!content) {
        throw new Error('No content found at this URL');
      }
      setCurrentArticleContent(content);

      const [
        shortSummaryRes, 
        detailedSummaryRes, 
        keywordsRes, 
        biasAnalysisRes,
        websiteAnalysisRes
      ] = await Promise.all([
        generateShortSummary(content),
        generateDetailedSummary(content),
        extractKeywordsCohere(content),
        analyzeBias(content, urlToAnalyze),
        analyzeWebsiteDetails(urlToAnalyze)
      ]);

      setShortSummary(shortSummaryRes);
      setDetailedSummary(detailedSummaryRes);
      setKeywords(keywordsRes);
      
      const biasMatch = biasAnalysisRes.match(/Bias:\s*(\d+)%/);
      const biasNum = biasMatch ? parseInt(biasMatch[1]) : 0;
      const biasClr = getBiasColor(biasNum);
      
      setMetaInfo({
        urlHostname: new URL(urlToAnalyze).hostname,
        analysisTime: new Date().toLocaleString(),
        biasRating: biasNum,
        biasColor: biasClr
      });
      
      const websiteAnalysisSections = parseWebsiteAnalysis(websiteAnalysisRes);
      setWebsiteAnalysisSections(websiteAnalysisSections);
      
      // If we have a user and created a summary, update it
      if (user && summaryId) {
        // Save options for future reference
        const options = {
          shortSummaryLength,
          shortSummaryComplexity,
          sentenceCount,
          detailLevel,
          detailComplexity
        };
        
        await finishSummary(summaryId, {
          userId: user.uid,
          shortSummary: shortSummaryRes,
          detailedSummary: detailedSummaryRes,
          keywords: keywordsRes,
          biasRating: biasNum,
          websiteAnalysis: websiteAnalysisSections,
          articleContent: content, // Store the article content for persistent conversations
          options
        });
        
        // Update the URL to include the summary ID
        router.push(`/analysis/summarize?url=${encodeURIComponent(urlToAnalyze)}/${summaryId}`);
      }

      setShowSummaryContainer(true);

    } catch (error: any) {
      console.error('Error:', error);
      showError(error.message || 'An error occurred while analyzing the content');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAskQuestion = async () => {
    if (!questionInput.trim()) {
      showError('Please enter a question');
      return;
    }
    if (!currentArticleContent) {
      showError('Please analyze an article first');
      return;
    }

    const currentTime = Date.now();
    const newQuestionId = currentTime.toString();
    const newQaItem: QAItem = { 
      id: newQuestionId,
      question: questionInput, 
      answer: 'Đang suy nghĩ... (Thinking...)',
      timestamp: currentTime
    };
    
    // Add the question to the state
    setQaHistory(prev => [newQaItem, ...prev]);
    const currentQuestionInput = questionInput;
    setQuestionInput('');

    try {
      // Get conversation history for context
      // Use all history if under 5 exchanges, otherwise use the 5 most recent
      // plus add a summary of older exchanges
      const historyLimit = 5; // Number of recent exchanges to include in full
      const historyToInclude = [...qaHistory]; // Create a copy of the history
      
      let contextPrompt = '';
      if (historyToInclude.length <= historyLimit) {
        // If we have few exchanges, include them all
        const fullHistory = historyToInclude.map(item => 
          `User: ${item.question}\nAI: ${item.answer}`
        ).join('\n\n');
        if (fullHistory) {
          contextPrompt = `Previous conversation:\n${fullHistory}\n\n`;
        }
      } else {
        // If we have many exchanges, include the recent ones plus a summary of older ones
        const recentHistory = historyToInclude.slice(0, historyLimit).map(item => 
          `User: ${item.question}\nAI: ${item.answer}`
        ).join('\n\n');
        
        const olderExchangeCount = historyToInclude.length - historyLimit;
        contextPrompt = `There have been ${historyToInclude.length} exchanges in this conversation.\n` +
          `Here is a summary of the ${olderExchangeCount} older exchanges: The user asked about ` +
          `${historyToInclude.slice(historyLimit).map(item => item.question.substring(0, 30) + '...').join(', ')}.\n\n` +
          `Most recent ${historyLimit} exchanges:\n${recentHistory}\n\n`;
      }

      const langInstruction = `You must respond in ${getLanguageName(qaLanguageSelect)} language only. `;
      const prompt = `${langInstruction}
You are a helpful assistant that ONLY answers questions based on the provided article content.
If the question cannot be answered using information from the article, respond with: "I apologize, but I cannot answer this question as it's not covered in the article content."
If the question is outside the scope of the article, respond with: "This question is outside the scope of the article content."

${contextPrompt}

Based on this article content ONLY, please answer this question: ${currentQuestionInput}

Article content:
${currentArticleContent}`;
      
      const answerText = await cohereChat(prompt);
      
      // Update the question with the answer
      const updatedQaItem = {
        ...newQaItem, 
        answer: answerText,
        timestamp: currentTime
      };
      setQaHistory(prev => prev.map(item => item.id === newQuestionId ? updatedQaItem : item));
      
      // If we have a URL in the search params, try to extract the summary ID
      const urlParam = searchParams?.get('url');
      if (user && urlParam) {
        const lastSlashIndex = urlParam.lastIndexOf('/');
        if (lastSlashIndex !== -1 && lastSlashIndex < urlParam.length - 1) {
          const summaryId = urlParam.substring(lastSlashIndex + 1);
          
          // Add the Q&A to the Firebase record
          if (summaryId) {
            try {
              await addQAItem(summaryId, currentQuestionInput, answerText);
            } catch (error) {
              console.error('Error saving Q&A to Firebase:', error);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error asking question:', error);
      setQaHistory(prev => prev.map(item => item.id === newQuestionId ? {...item, answer: 'Error: Could not get an answer.'} : item));
    }
  };

  const copyTextToClipboard = async (text: string) => {
    if (!text) return;
    try {
      // Create a temporary element to hold the text
      const tempElem = document.createElement('div');
      tempElem.innerHTML = text; // Use innerHTML to parse HTML entities if any
      await navigator.clipboard.writeText(tempElem.textContent || "");
      alert('Đã sao chép vào clipboard! (Copied to clipboard!)');
    } catch (err) {
      console.error('Không thể sao chép (Could not copy):', err);
      alert('Lỗi sao chép! (Copy error!)');
    }
  };
  
  const showMarkdownHelp = () => {
    const helpText = `
Markdown Formatting Guide:
- Headers: Use ## for section headers (e.g., "## Overview")
- Bold: Use ** around text (e.g., "**important text**")
- Bullet Points: Start lines with - (e.g., "- bullet point")
- Line Breaks: Use a blank line between paragraphs

Example:
## Section Title
**Bold text** for emphasis
- First bullet point
- Second bullet point
    `;
    alert(helpText);
  };

  const handleBackToSearch = () => {
    router.push('/analysis/new');
  };

  // Load an existing summary by ID
  const loadExistingSummary = async (summaryId: string) => {
    setIsLoading(true);
    try {
      const summary = await getSummary(summaryId);
      
      if (summary) {
        // Set all the state from the summary
        setUrlInput(summary.url);
        setLanguageSelect(summary.languageCode);
        setShortSummary(summary.shortSummary);
        setDetailedSummary(summary.detailedSummary);
        setKeywords(summary.keywords);
        
        // Load the stored article content if available, otherwise fetch it
        if (summary.articleContent) {
          console.log('Using stored article content');
          setCurrentArticleContent(summary.articleContent);
        } else {
          try {
            console.log('Fetching new article content');
            const content = await fetchContent(summary.url);
            setCurrentArticleContent(content);
            
            // Update the summary with the content for future use
            if (user) {
              await updateSummary(summaryId, { articleContent: content });
            }
          } catch (contentError) {
            console.error('Error fetching content for continued QA:', contentError);
            showError('Could not load article content for Q&A. Some features may be limited.');
          }
        }
        
        // Set metadata
        if (summary.websiteAnalysis) {
          try {
            const parsedSections = typeof summary.websiteAnalysis === 'string' 
              ? parseWebsiteAnalysis(summary.websiteAnalysis)
              : summary.websiteAnalysis;
            setWebsiteAnalysisSections(parsedSections);
          } catch (error) {
            console.error('Error parsing website analysis:', error);
          }
        }
        
        // Set bias info
        setMetaInfo({
          urlHostname: new URL(summary.url).hostname,
          analysisTime: new Date(summary.createdAt).toLocaleString(),
          biasRating: summary.biasRating || 0,
          biasColor: getBiasColor(summary.biasRating || 0)
        });
        
        // Set QA history if available
        if (summary.qaHistory && summary.qaHistory.length > 0) {
          // Make sure the QA history is sorted by timestamp (newest first)
          const sortedHistory = [...summary.qaHistory].sort((a, b) => 
            (b.timestamp || 0) - (a.timestamp || 0));
          setQaHistory(sortedHistory);
        }
        
        // Set options if available
        if (summary.options) {
          if (summary.options.shortSummaryLength) setShortSummaryLength(summary.options.shortSummaryLength);
          if (summary.options.shortSummaryComplexity) setShortSummaryComplexity(summary.options.shortSummaryComplexity);
          if (summary.options.sentenceCount) setSentenceCount(summary.options.sentenceCount);
          if (summary.options.detailLevel) setDetailLevel(summary.options.detailLevel);
          if (summary.options.detailComplexity) setDetailComplexity(summary.options.detailComplexity);
        }
        
        // Show the summary container
        setShowSummaryContainer(true);
      } else {
        showError('Summary not found');
      }
    } catch (error: any) {
      showError(`Error loading summary: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getBiasColor = (bias: number): string => {
    return bias < 30 ? '#28a745' : 
           bias < 60 ? '#ffc107' : '#dc3545';
  };

  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="summarizer-container">
      <button onClick={handleBackToSearch} className="back-button">
        Back to Search
      </button>
      
      <button onClick={showMarkdownHelp} className="markdown-help-button">
        Markdown Help
      </button>
      
      <h1>URL Content Summarizer</h1>
      
      <div className="input-section">
        <div className="language-selector">
          <select value={languageSelect} onChange={(e) => setLanguageSelect(e.target.value)}>
            {languageOptions.map(lang => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
          </select>
        </div>
        <div className="url-input">
          <input 
            type="url" 
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAnalyzePage()}
            placeholder="Nhập URL cần tóm tắt (Enter URL to summarize) (https://...)" 
          />
          <button 
            onClick={(e) => handleAnalyzePage()}
            disabled={isLoading}
            className={isLoading ? 'loading' : ''}>
            {isLoading ? 'Đang Phân Tích...' : 'Phân Tích (Analyze)'}
          </button>
        </div>
        {errorMessage && <div className="error-message">{errorMessage}</div>}
      </div>

      {isLoading && (
        <div className="loading">
          <img src="https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif" alt="Loading..." />
          <p>Đang phân tích nội dung... (Analyzing content...)</p>
        </div>
      )}

      {showSummaryContainer && metaInfo && (
        <div className="summary-container">
          <div className="meta-info">
            <div className="meta-item"><strong>URL:</strong> {metaInfo.urlHostname}</div>
            <div className="meta-item"><strong>Analysis Time:</strong> {metaInfo.analysisTime}</div>
            <div className="meta-item bias-indicator" style={{ backgroundColor: metaInfo.biasColor, color: 'white' }}>
              <strong>Bias Rating:</strong> {metaInfo.biasRating}%
            </div>
          </div>

          <div className="summary-section">
            <h3>Tóm Tắt Ngắn (Short Summary)</h3>
            <div className="controls">
              <select value={shortSummaryLength} onChange={(e) => setShortSummaryLength(e.target.value)}>
                <option value="simple">Tóm tắt đơn giản (1-2 câu) (Simple summary)</option>
                <option value="normal">Tóm tắt thường (2-4 câu) (Normal summary)</option>
                <option value="custom">Tóm tắt tùy chỉnh (Custom summary)</option>
              </select>
              {showCustomSentences && (
                <div id="customSentences" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px' }}>
                  <input 
                    type="number" 
                    value={sentenceCount}
                    onChange={(e) => setSentenceCount(parseInt(e.target.value))}
                    min="1" max="10" 
                    style={{ width: '60px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                  <label htmlFor="sentenceCount">câu (sentences)</label>
                </div>
              )}
              <select value={shortSummaryComplexity} onChange={(e) => setShortSummaryComplexity(e.target.value)}>
                <option value="simple">Từ ngữ đơn giản (Simple vocabulary)</option>
                <option value="normal">Từ ngữ thường (Normal vocabulary)</option>
                <option value="advanced">Từ ngữ nâng cao (Advanced vocabulary)</option>
              </select>
            </div>
            <div dangerouslySetInnerHTML={{ __html: formatMarkdown(shortSummary) }} />
            <button className="copy-button" onClick={() => copyTextToClipboard(shortSummary)}>Sao chép (Copy)</button>
          </div>

          <div className="summary-section">
            <h3>Tóm Tắt Chi Tiết (Detailed Summary)</h3>
            <div className="controls">
              <select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)}>
                <option value="normal">Chi tiết cơ bản (5-7 điểm chính) (Basic detail)</option>
                <option value="very">Rất chi tiết (8-12 điểm chính với phân tích) (Very detailed)</option>
                <option value="super">Siêu chi tiết (15-20 điểm với phân tích sâu) (Super detailed)</option>
                <option value="thinking">Phân tích chuyên sâu (20+ điểm với lập luận và ví dụ) (In-depth analysis)</option>
              </select>
              <select value={detailComplexity} onChange={(e) => setDetailComplexity(e.target.value)}>
                <option value="simple">Từ ngữ đơn giản (Simple vocabulary)</option>
                <option value="normal">Từ ngữ thường (Normal vocabulary)</option>
                <option value="advanced">Từ ngữ nâng cao (Advanced vocabulary)</option>
              </select>
            </div>
            <div dangerouslySetInnerHTML={{ __html: formatMarkdown(detailedSummary) }} />
            <button className="copy-button" onClick={() => copyTextToClipboard(detailedSummary)}>Sao chép (Copy)</button>
          </div>

          <div className="summary-section">
            <h3>Từ Khóa Chính (Main Keywords)</h3>
            <div dangerouslySetInnerHTML={{ __html: formatMarkdown(keywords) }} />
            <button className="copy-button" onClick={() => copyTextToClipboard(keywords)}>Sao chép (Copy)</button>
          </div>
          
          <div className="summary-section website-analysis">
            <h3>Website Analysis</h3>
            <div className="website-details">
              {websiteAnalysisSections.map((section, index) => (
                <div key={index} className="analysis-section">
                  {section.type === 'detail' && section.title && (
                    <h4>
                      {section.title}
                      {section.rating && (
                        <span className="rating-badge" style={{ backgroundColor: section.ratingColor }}>
                          {section.rating}
                        </span>
                      )}
                    </h4>
                  )}
                  {section.type === 'strength-concern' && section.content && (
                    <div dangerouslySetInnerHTML={{ __html: formatMarkdown(section.content) }} />
                  )}
                  {section.type === 'detail' && section.details && (
                    <ul>
                      {section.details.map((detail, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: formatMarkdown(detail) }} />
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="summary-section">
            <h3>Hỏi Đáp về Nội Dung (Q&A about Content)</h3>
            <div className="qa-container">
              <div className="qa-language-selector">
                <select value={qaLanguageSelect} onChange={(e) => setQaLanguageSelect(e.target.value)}>
                  {languageOptions.map(lang => <option key={`qa-${lang.value}`} value={lang.value}>{lang.label}</option>)}
                </select>
              </div>
              <div className="qa-input">
                <input 
                  type="text" 
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder={`Ask a question in ${getLanguageName(qaLanguageSelect)}...`}
                  className="question-input"
                  disabled={!currentArticleContent || isLoading}
                />
                <button 
                  onClick={handleAskQuestion} 
                  className="ask-button" 
                  disabled={!currentArticleContent || isLoading || !questionInput.trim()}
                >
                  Hỏi (Ask)
                </button>
              </div>
              {!currentArticleContent && (
                <div className="qa-notice">
                  Article content is not loaded. Please reanalyze the URL to enable Q&A functionality.
                </div>
              )}
              <div className="qa-history">
                {qaHistory.map((item, index) => (
                  <div key={item.id} className={`qa-item ${index === 0 ? 'latest' : ''}`}>
                    <div className="question">
                      <span className="qa-label">Q:</span> {item.question}
                      {item.timestamp && (
                        <span className="qa-timestamp">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="answer">
                      <span className="qa-label">A:</span>
                      <div className="answer-content" dangerouslySetInnerHTML={{ __html: formatMarkdown(item.answer) }} />
                    </div>
                  </div>
                ))}
                {qaHistory.length === 0 && (
                  <div className="no-qa">
                    No questions have been asked yet. Start by asking a question above.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="reanalyze-section">
            <button 
              onClick={(e) => {
                e.preventDefault();
                handleAnalyzePage();
              }}
              className="reanalyze-button">
              Phân Tích Lại Với Tùy Chọn Mới (Reanalyze with New Options)
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 