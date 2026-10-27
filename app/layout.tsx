import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starter Project",
  description: "A clean starting point for building your site.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/aaltair-favicon.svg?v=2",
    shortcut: "/aaltair-favicon.svg?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
