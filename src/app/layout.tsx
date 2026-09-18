import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
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
        className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} font-sans antialiased text-foreground min-h-screen relative bg-slate-50 dark:bg-slate-950 transition-colors duration-200`}
      >
        <div
          className="fixed top-[80px] inset-x-0 bottom-0 -z-10 bg-[url('/bg.png')] bg-cover bg-top bg-no-repeat pointer-events-none transition-opacity duration-300 dark:opacity-15"
          aria-hidden="true"
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
