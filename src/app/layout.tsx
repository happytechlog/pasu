import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TimeZoneSync } from "@/components/time-zone-sync";
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
  title: "파수",
  description: "웹사이트 가동 모니터링",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TimeZoneSync />
        {children}
      </body>
    </html>
  );
}
