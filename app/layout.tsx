import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "College Print Portal",
  description: "Upload documents for printing at the college office",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
