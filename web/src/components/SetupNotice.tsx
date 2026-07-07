export default function SetupNotice() {
  return (
    <div className="mt-16 mx-auto max-w-xl card p-8 text-center animate-fade-in">
      <div className="text-5xl" aria-hidden>
        🛰️
      </div>
      <h1 className="mt-3 text-xl font-semibold text-content">
        Connect your Supabase project
      </h1>
      <p className="mt-2 text-sm text-muted">
        Workana Radar needs your Supabase credentials before it can load jobs.
        Add them once and the dashboard starts streaming live data.
      </p>
      <ol className="mt-6 text-left text-sm text-muted space-y-2 list-decimal list-inside">
        <li>
          In Supabase, run the SQL in <code className="chip">web/supabase/schema.sql</code>.
        </li>
        <li>
          Copy your Project URL and the public anon key (Settings → API).
        </li>
        <li>
          Locally: put them in <code className="chip">web/.env</code> as{' '}
          <code className="chip">VITE_SUPABASE_URL</code> and{' '}
          <code className="chip">VITE_SUPABASE_ANON_KEY</code> (see{' '}
          <code className="chip">.env.example</code>).
        </li>
        <li>
          On Vercel: add the same two vars under Project → Settings →
          Environment Variables, then redeploy.
        </li>
      </ol>
    </div>
  );
}
