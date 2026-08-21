import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Village of Shadows",
  description: "Enter a living multi-agent game where six AI minds and one human player reason, remember, deceive, and decide.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
