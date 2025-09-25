import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Avalanche UI Pro Starter",
  description: "Comprehensive Next.js starter for avalanche forecasting dashboards",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
