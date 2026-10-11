import Link from "next/link";

const groups = [
  { title: "Explore", links: [["Find a home", "/#listings"], ["Housing requests", "/requests"], ["Area & commute guide", "/map"]] },
  { title: "Make your move", links: [["Post a listing", "/listings/new"], ["Post a housing request", "/requests/new"], ["Saved housing", "/saved"]] },
  { title: "Your workspace", links: [["My listings & requests", "/dashboard"], ["Messages", "/inquiries"], ["Verify your affiliation", "/verify"]] },
  { title: "Get started", links: [["Create an account", "/sign-up"], ["Sign in", "/sign-in"], ["Account recovery", "/forgot-password"]] },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__intro">
          <p className="eyebrow">A place for your next chapter</p>
          <p>Find a home.<br /><em>Feel at home.</em></p>
          <Link className="button button--primary" href="/#listings">Explore homes <span aria-hidden="true">↗</span></Link>
        </div>
        <nav className="site-footer__links" aria-label="Footer">
          {groups.map(group => (
            <div key={group.title}>
              <h2>{group.title}</h2>
              {group.links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
            </div>
          ))}
        </nav>
        <Link href="/" className="site-footer__wordmark" aria-label="Unitern home">unitern<span aria-hidden="true">↗</span></Link>
        <div className="site-footer__bottom"><p>© {new Date().getFullYear()} Unitern</p><p>For students. For interns. For what comes next.</p><a href="#top">Back to top ↑</a></div>
      </div>
    </footer>
  );
}
