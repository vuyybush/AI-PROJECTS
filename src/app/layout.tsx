import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"DreamForge — Make the unreal",description:"A creative image studio. Describe, refine, and make your next idea real."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
