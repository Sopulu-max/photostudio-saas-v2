import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studio Kernel",
  description: "The ontology made visible.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // To avoid Next/font build errors in this environment, 
  // we rely on CSS for font stacks (defined in globals.css)
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
