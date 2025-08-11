import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rootstock RNS Dashboard",
  description: "Resolve RNS names, balances, NFTs, activity",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <nav className="w-full border-b bg-white sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <a href="/resolve" className="text-base font-semibold">RNS Dashboard</a>
            <div className="flex items-center gap-4 text-sm">
              <a className="hover:underline" href="/resolve">Resolve</a>
              <a className="hover:underline" href="/search">Search</a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
