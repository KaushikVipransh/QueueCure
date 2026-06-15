import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { SocketProvider } from '@/contexts/SocketContext';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Queue Cure — Smart Clinic Queue Management',
    template: '%s | Queue Cure',
  },
  description:
    'Real-time smart clinic queue management system. Eliminate waiting uncertainty with live token tracking, adaptive wait-time predictions, and instant notifications.',
  keywords: ['clinic queue', 'patient management', 'hospital queue', 'wait time', 'queue management'],
  authors: [{ name: 'Queue Cure' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    title: 'Queue Cure — Smart Clinic Queue Management',
    description: 'Real-time patient queue management with smart wait-time predictions.',
  },
};

export const viewport: Viewport = {
  themeColor: '#06b6d4',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-surface-800 text-slate-100 antialiased">
        <SocketProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#111827',
                color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                fontSize: '14px',
                padding: '12px 16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              },
              success: {
                iconTheme: { primary: '#34d399', secondary: '#111827' },
              },
              error: {
                iconTheme: { primary: '#fb7185', secondary: '#111827' },
              },
            }}
          />
        </SocketProvider>
      </body>
    </html>
  );
}
