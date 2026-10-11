import NavigationMenu from "@/components/NavigationMenu";
import { getUnreadConversationCount } from "@/features/conversations/service";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";

export default async function Navbar() {
  const currentUser = await getCurrentUser();
  const unreadConversationCount = currentUser
    ? await getUnreadConversationCount(currentUser.id)
    : 0;

  return (
    <NavigationMenu signedIn={Boolean(currentUser)} isAdmin={isAdmin(currentUser)} verified={currentUser?.verificationStatus === "verified"} unreadConversationCount={unreadConversationCount} />
  );
}
