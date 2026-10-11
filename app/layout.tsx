import type { Metadata } from "next";
import { Comfortaa, Fraunces, Plus_Jakarta_Sans, Tiro_Devanagari_Hindi } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const comfortaa = Comfortaa({ variable: "--font-comfortaa", subsets: ["latin"], weight: ["300", "600"] });
const hindi = Tiro_Devanagari_Hindi({ variable: "--font-tiro", subsets: ["devanagari"], weight: "400" });

export const metadata: Metadata = {
  title: "Vibh-Anu CRM",
  description: "Lead workflow from Marketing to Sales, with call recordings and AI summaries.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable} ${hindi.variable} ${comfortaa.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
