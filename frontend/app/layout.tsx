import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Village of Shadows",
  description: "A multi-agent game of Werewolf, played out in real time",
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
