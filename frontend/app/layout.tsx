import type { Metadata, Viewport } from "next";
    import { DM_Sans, Instrument_Serif } from "next/font/google";
    import "./globals.css";

    const dmSans = DM_Sans({
    subsets: ["latin"],
    variable: "--font-dm-sans",
    });

    const instrumentSerif = Instrument_Serif({
    weight: "400",
    style: ["normal", "italic"],
    subsets: ["latin"],
    variable: "--font-instrument",
    });

    export const metadata: Metadata = {
    title: "Recruweb Sales Partner Portal",
    description:
      "One platform, three fronts: clients launch products, field sales officers sell anywhere, and Recruweb team sees everything. Live support chat built in.",
    };

    export const viewport: Viewport = {
    themeColor: "#0e4c38",
    };

    export default function RootLayout({
    children,
    }: {
    children: React.ReactNode;
    }) {
    return (
      <html
        lang="en"
        className={`bg-background ${dmSans.variable} ${instrumentSerif.variable}`}
      >
        <body className="font-sans antialiased">{children}</body>
      </html>
    );
    }
    