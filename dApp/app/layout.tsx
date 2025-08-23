import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GiveHub dApp',
  description: 'Secure dApp API with Atlas Data API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 dark:bg-neutral-950 dark:text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
