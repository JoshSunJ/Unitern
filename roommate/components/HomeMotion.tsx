"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function HomeMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cleanup = () => {};
    function setup() {
      cleanup();
      if (!element) return;
      if (preference.matches) { delete element.dataset.motion; return; }
      element.dataset.motion = "ready";
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer.unobserve(entry.target);
        }
      }, { threshold: 0.12 });
      element.querySelectorAll("[data-reveal]").forEach(target => observer.observe(target));
      const route = element.querySelector<HTMLElement>(".home-route");
      let frame = 0;
      function update() {
        frame = 0;
        if (!route) return;
        const bounds = route.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (window.innerHeight - bounds.top) / (window.innerHeight + bounds.height * 0.35)));
        route.style.setProperty("--route-progress", String(progress));
        route.style.setProperty("--route-drift", `${(progress - 0.5) * 40}px`);
      }
      function schedule() { if (!frame) frame = requestAnimationFrame(update); }
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      update();
      cleanup = () => { observer.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); cancelAnimationFrame(frame); };
    }
    setup();
    preference.addEventListener("change", setup);
    return () => { cleanup(); preference.removeEventListener("change", setup); };
  }, []);
  return <div className="home-experience" ref={root}>{children}</div>;
}
