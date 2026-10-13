import Link from "next/link";
import Navbar from "@/components/Navbar";
import { isPublicBeta } from "@/features/launch/config";

export default function PrivacyPage() {
  return <><Navbar /><main className="page-shell privacy-page"><p className="eyebrow">Your information</p><h1>Privacy at Unitern</h1>
    <p>Unitern helps students and interns browse housing, compare commutes, and contact posters. This page describes the information used by the current app.</p>
    <h2>Account and community access</h2><p>Google sign-in provides your name, verified account email, and Google account identifier. Unitern stores these with your account. Google confirms your account email; school and employer affiliations require a separate review. We also store the affiliation details you submit and the review outcome.</p>
    <h2>Listings and messages</h2><p>Listing details, locations, poster names and listing photos are public. Saved items, private messages, affiliation submissions and moderation reports are available through authenticated access to the relevant account or administrator. Do not put private contact information or identity documents in a public listing.</p>
    <h2>Hosting and maps</h2><p>The app uses Google Cloud hosting, Neon PostgreSQL and Cloudflare photo storage. MapTiler processes location searches and map requests. Commute routing sends the selected home and destination coordinates to the routing provider. Commute times are planning estimates.</p>
    <h2>Optional AI guide</h2><p>The housing guide requires separate consent before sending a question. Google receives your question and the selected area or public listing details. Free-tier model requests may be used to improve Google’s products. Avoid personal or sensitive details. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google’s AI data terms</a>.</p>
    <h2>Cookies and operational records</h2><p>Cookies maintain your signed-in session and city preference. The app keeps security and operational records, including request counters, to limit abuse and diagnose failures.</p>
    {isPublicBeta() && <><h2>Public beta</h2><p>The beta uses Google sign-in and manual affiliation review. Email notifications and email verification links are unavailable. Check your messages and verification status in the app.</p></>}
    <h2>Account and data questions</h2><p>Use the Unitern support email shown on the Google sign-in consent screen to ask about your account or request deletion. Account data is retained until the administrator handles that request. Removing Google access alone does not delete your Unitern account.</p>
    <Link href="/">Back to Unitern ↗</Link>
  </main></>;
}
