export function StatusBar() {
  const date = new Date().toISOString().slice(0, 10);
  return (
    <footer className="bg-[#111] border border-white/[0.12] px-[18px] py-2.5 flex justify-between items-center text-[10.5px] tracking-[0.18em] uppercase text-white/55 font-mono">
      <div className="flex gap-4 sm:gap-[18px] flex-wrap">
        <Hint k="↩" label="start" />
        <Hint k="P" label="practice" />
        <Hint k="D" label="daily" />
        <Hint k="M" label="me" />
        <Hint k="A" label="about" />
      </div>
      <div className="text-white">v1 · {date}</div>
    </footer>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-baseline">
      <span className="bg-white/[0.06] border border-white/[0.12] text-white px-1.5 mr-1.5 text-[10px]">
        {k}
      </span>
      {label}
    </span>
  );
}
