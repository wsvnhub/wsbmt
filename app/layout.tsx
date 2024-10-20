import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import ConfigAntd from "@/components/ConfigAntd";

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ways Station Badminton",
  description: "Ways Station Badminton",
  openGraph: {
    title: "Ways Station Badminton",
    description: "Learn everything about badminton at Ways Station",
    url: "http://san.waysstation.vn/",
    images: [
      {
        url: "http://san.waysstation.vn/thumbnail.jpg",
        width: 1200,
        height: 630,
        alt: "Badminton Court",
      },
    ],
    locale: "vi_VN",
    type: "website",
  }
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
