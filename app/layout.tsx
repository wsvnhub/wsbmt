import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import ConfigAntd from "@/components/ConfigAntd";

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ways Station Badminton",
  description: "Ways Station Badminton",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="bg-primary text-white" lang="en">
      <body className={montserrat.className}>
        <ConfigAntd>
          {children}
        </ConfigAntd>
      </body>
    </html>
  );
}
