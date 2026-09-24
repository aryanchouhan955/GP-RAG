import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import {
  ClerkProvider,
  SignedOut,
  SignUp,
  SignedIn,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'GP-RAG | Chat with your PDFs',
  description: 'Upload any PDF and ask questions about it using AI. Powered by Google Gemini and Qdrant vector search.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <section>
            <SignedOut>
              <SignUpButton />
            </SignedOut>
          </section>
          <SignedIn>{children}</SignedIn>
        </body>
      </html>
    </ClerkProvider>
  );
}
