import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

const PLEX_MONO = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Supercritical",
  description: "Cross-service correlation engine for your dev stack"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      <html lang="en" className={`dark ${PLEX_MONO.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
