import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import AuthProvider from './auth/AuthProvider';
import Sidebar from './components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Analysis Results',
  description: 'Search and analyze web content with AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <Sidebar />
          <main className="main-content">
        {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
