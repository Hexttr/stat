type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          Раздел в подготовке
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-4 text-base leading-7 text-slate-500">{description}</p>
      </div>
    </section>
  );
}
