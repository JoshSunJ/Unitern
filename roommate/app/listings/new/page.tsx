import Link from "next/link";
import { redirect } from "next/navigation";
import ListingForm from "@/components/ListingForm";
import { getCurrentUser } from "@/lib/current-user";

export default async function NewListingPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/sign-in?next=/listings/new");
  }

  if (currentUser.verificationStatus !== "verified") {
    return <main className="page-shell detail"><Link href="/" className="back-link">← All listings</Link><h1>Create a listing</h1><section className="owner-notice"><p>Verify your affiliation before posting a listing.</p><Link href="/verify">View affiliation review ↗</Link></section></main>;
  }

  return <main className="page-shell detail"><Link href="/" className="back-link">← All listings</Link><h1>Create a listing</h1><p className="form-intro">Describe the practical terms clearly, then place an approximate map pin. After creating the listing, use Edit details to add and arrange its photos.</p><ListingForm mode="create" /></main>;
}
