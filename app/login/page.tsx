import { LoginForm } from "@/components/forms";
import { FLOW, ROLES } from "@/lib/workflow";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-forest p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[28px] border-gold/20" />
        <div>
          <p className="font-display text-5xl font-semibold italic text-gold">Vibh-Anu</p>
          <p lang="hi" className="mt-2 font-hindi text-2xl text-gold/80">विभवंगल अनुकुलकारा</p>
          <p className="mt-3 text-white/70">Real estate lead CRM · Sampatti · Vibhanu Developer · Reend</p>
        </div>
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gold">One lead, five departments</p>
          <ol className="space-y-3">
            {ROLES.map((r, i) => (
              <li key={r} className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gold text-sm font-bold text-forest">{i + 1}</span>
                <span className="font-semibold">{FLOW[r].label}</span>
                <span className="text-white/50">→ {FLOW[r].action}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-white/40">Role-based access · private call recordings · AI call summaries</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="font-display text-3xl font-semibold italic text-gold lg:hidden">Vibh-Anu</p>
          <p lang="hi" className="font-hindi text-lg text-gold/80 lg:hidden">विभवंगल अनुकुलकारा</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-forest">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Use your department login. You only see your own department&apos;s work.</p>
          <div className="card p-6">
            <LoginForm />
          </div>
        </div>
      </section>
    </div>
  );
}
