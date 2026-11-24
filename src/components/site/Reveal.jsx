import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils";

/** Lifts its content up out of the page in 3D when it scrolls into view. */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    // No IntersectionObserver (tests / old browsers): show immediately.
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.visible = "true";
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.dataset.visible = "true";
            io.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={cn("reveal", className)} style={{ "--reveal-delay": `${delay}ms` }}>
      {children}
    </Tag>
  );
}
