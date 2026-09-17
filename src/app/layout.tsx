import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import '../../design-tokens.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Convertdoc — Word to PDF & PDF to Word',
  description: 'Simple, free document format converter.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} antialiased`}>{children}</body>
    </html>
  );
}