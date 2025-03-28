import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SessionProvider } from './context/SessionContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HookGPT - Uniswap V4 Hooks in Seconds',
  description: 'Create Uniswap V4 hooks from natural language descriptions in seconds',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    </SessionProvider>
  );
}
