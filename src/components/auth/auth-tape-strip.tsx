function TapeRow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0">
      {Array.from({ length: 14 }).map((_, index) => (
        <span
          key={index}
          className="shrink-0 px-5 text-[11px] font-bold uppercase tracking-[0.3em] text-white/92 sm:px-8 sm:text-xs"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function ScrollingTape({
  label,
  direction = "left",
}: {
  label: string;
  direction?: "left" | "right";
}) {
  return (
    <div className="overflow-hidden">
      <div
        className={`flex w-max ${
          direction === "left" ? "animate-tape-scroll-left" : "animate-tape-scroll-right"
        }`}
      >
        <TapeRow label={label} />
        <TapeRow label={label} />
      </div>
    </div>
  );
}

interface AuthTapeStripProps {
  label?: string;
}

export function AuthTapeStrip({ label = "Nexuses" }: AuthTapeStripProps) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-14 z-0 sm:bottom-16">
      <div className="absolute bottom-0 left-1/2 w-[150vw] -translate-x-1/2 -rotate-[4deg] origin-bottom">
        <div className="overflow-hidden border-y border-black/10 bg-accent py-2.5 shadow-[0_6px_20px_rgba(30,69,77,0.2)] sm:py-3">
          <ScrollingTape label={label} direction="left" />
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 z-10 w-[150vw] -translate-x-1/2 rotate-[3deg] origin-bottom sm:bottom-9">
        <div className="overflow-hidden border-y border-white/15 bg-accent-hover py-2.5 shadow-[0_8px_24px_rgba(22,54,61,0.25)] sm:py-3">
          <ScrollingTape label="Campaign Reports" direction="right" />
        </div>
      </div>
    </div>
  );
}
