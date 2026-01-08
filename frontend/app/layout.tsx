import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar"; // <-- IMPORT ICI

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WeChoose",
  description: "Swipe tes films préférés",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        {children}
        <Navbar /> {/* <-- AJOUTE ÇA ICI */}
      </body>
    </html>
  );
}