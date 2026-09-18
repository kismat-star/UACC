import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Umiya Arts & Commerce College — Print Desk",
  description: "Shree Umiya K.V.C. Education Trust — Scan & Upload documents for printing.",
  keywords: ["Umiya College", "print desk", "QR upload", "student print"],
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased text-foreground min-h-screen relative bg-slate-50 dark:bg-slate-950`}
      >
        <div
          className="fixed top-[68px] inset-x-0 bottom-0 -z-10 bg-[url('/bg.png')] bg-cover bg-top bg-no-repeat pointer-events-none"
          aria-hidden="true"
        />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
