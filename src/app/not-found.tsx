'use client';

import React from 'react';
import Link from 'next/link';
import './not-found.css';

export default function NotFound() {
  return (
    <div className="not-found-container">
      <div className="not-found-content">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The analysis you're looking for doesn't exist or has been deleted.</p>
        <Link href="/analysis/new" className="back-button">
          Start New Analysis
        </Link>
      </div>
    </div>
  );
} 