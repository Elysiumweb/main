import { cn } from "../../lib/utils";

/** Title whose letters rise one by one in 3D. */
export function RiseTitle({ text, className }) {
  return (
    <span aria-label={text} role="text">
      {text.split("").map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn("rise-letter", className)}
          style={{ "--i": i }}
        >
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, action, className }) {
  return (
    <div
      className={cn(
        "mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2 className="font-display text-3xl font-bold uppercase sm:text-4xl lg:text-5xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function PageHero({ eyebrow, title, subtitle, children }) {
  return (
    <section className="relative flex min-h-[52svh] items-end pb-12 pt-32 sm:min-h-[46vh] sm:items-center sm:pb-10 sm:pt-36">
      <Container>
        {eyebrow && <p className="eyebrow mb-5">{eyebrow}</p>}
        <h1 className="font-display text-[clamp(2.2rem,8vw,5.5rem)] font-black uppercase leading-[0.95]">
          <RiseTitle text={title} className="text-gold" />
        </h1>
        {subtitle && (
          <p className="mt-6 max-w-xl text-lg text-muted-foreground sm:text-xl">{subtitle}</p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </Container>
    </section>
  );
}

export function Container({ children, className }) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-5 sm:px-8", className)}>{children}</div>
  );
}
