// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Slope Labs",
  description: "Avalanche intelligence for professionals",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Header hides itself on / and /login (see component below) */}
        <div className="container py-6">
          <Header />
          <Providers>
            <main className="py-6">{children}</main>
          </Providers>
        </div>
      </body>
    </html>
  );
}
