import type { ChemistryScore } from '../types/simulation';

export function ChemistryScores({ scores = [] }: { scores?: ChemistryScore[] }) {
  return (
    <>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500">Chemistry</h3>
      {scores.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada Chemistry yang tercatat.</p>
      ) : (
        <dl className="space-y-1.5 text-sm text-slate-800">
          {scores.map(({ name, points }) => (
            <div key={name} className="flex items-baseline justify-between gap-3">
              <dt className="wrap-anywhere">{name}</dt>
              <dd className="shrink-0 font-mono text-xs tabular-nums">{points}/100</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
