import type { Metadata } from "next";
import "./globals.css";
import "./network.css";
export const metadata: Metadata = {
  title: {
    default: "Fundicate — Fund together. Decide together.",
    template: "%s · Fundicate",
  },
  description:
    "A shared home for community funding, fair decisions, and transparent treasuries. Local hackathon demo with simulated funds.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
