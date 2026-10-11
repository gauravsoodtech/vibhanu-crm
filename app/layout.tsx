import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, Tiro_Devanagari_Hindi } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const hindi = Tiro_Devanagari_Hindi({ variable: "--font-tiro", subsets: ["devanagari"], weight: "400" });

export const metadata: Metadata = {
  title: "Vibh-Anu CRM",
  description: "Lead workflow from Marketing to Sales, with call recordings and AI summaries.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable} ${hindi.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
