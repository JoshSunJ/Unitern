"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SignOutButton from "@/components/SignOutButton";

type Props = { signedIn: boolean; isAdmin: boolean; verified: boolean; unreadConversationCount: number };

export default function NavigationMenu({ signedIn, isAdmin, verified, unreadConversationCount }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return (
    <div className="navigation" ref={root}>
      <div className="navbar">
        <Link href="/" className="brand" aria-label="unitern home" onClick={() => setOpen(false)}><span className="brand-mark" aria-hidden="true">u</span><span>unitern</span></Link>
        <nav className="nav-primary" aria-label="Main"><Link href="/#listings">Homes</Link><Link href="/requests">Requests</Link><Link href="/map">Area guide</Link></nav>
        <div className="nav-account">
          <Link className="nav-cta" href={signedIn ? "/listings/new" : "/sign-up"} onClick={() => setOpen(false)}>{signedIn ? "Post a listing" : "Get started"}<span aria-hidden="true">↗</span></Link>
          <button ref={trigger} className="menu-trigger" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)}><span className="menu-trigger__label">Menu</span><span className="menu-trigger__icon" data-open={open} aria-hidden="true"><i /><i /></span>{unreadConversationCount > 0 && <span className="nav-unread-badge">{unreadConversationCount}</span>}</button>
        </div>
      </div>
      <div id="site-menu" className="site-menu" hidden={!open}>
        <nav aria-label="Explore menu" onClick={() => setOpen(false)}>
          <p className="eyebrow">Your next chapter</p>
          <Link href="/#listings">Explore homes <span aria-hidden="true">↗</span></Link>
          <Link href="/requests">Housing requests <span aria-hidden="true">↗</span></Link>
          <Link href="/map">Area & commute guide <span aria-hidden="true">↗</span></Link>
        </nav>
        <nav className="site-menu__account" aria-label="Account menu" onClick={() => setOpen(false)}>
          <p className="eyebrow">{signedIn ? "Your workspace" : "Make yourself at home"}</p>
          {signedIn ? <>
            <Link href="/dashboard">My listings & requests</Link><Link href="/saved">Saved housing</Link><Link href="/inquiries">Messages {unreadConversationCount > 0 && <span className="nav-unread-badge">{unreadConversationCount}</span>}</Link>
            {!verified && <Link href="/verify">Verify your affiliation</Link>}
            {isAdmin && <><Link href="/admin/verifications">Verification reviews</Link><Link href="/admin/reports">Moderation reports</Link></>}
            <SignOutButton />
          </> : <><Link href="/sign-in">Sign in</Link><Link href="/sign-up">Create account</Link><Link href="/requests/new">Post a housing request</Link></>}
        </nav>
      </div>
    </div>
  );
}
