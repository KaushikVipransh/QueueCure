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
  themeColor: '#0A1931',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased" style={{ background: '#F6FAFD', color: '#0A1931' }}>
        <SocketProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#FFFFFF',
                color: '#0A1931',
                border: '1px solid #D4E4F0',
                borderRadius: '12px',
                fontSize: '13px',
                padding: '12px 16px',
                boxShadow: '0 8px 24px rgba(10,25,49,0.12)',
              },
              success: {
                iconTheme: { primary: '#0f9b6e', secondary: '#FFFFFF' },
              },
              error: {
                iconTheme: { primary: '#c93636', secondary: '#FFFFFF' },
              },
            }}
          />
        </SocketProvider>
      </body>
    </html>
  );
}
