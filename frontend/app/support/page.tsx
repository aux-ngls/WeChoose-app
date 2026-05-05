import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Support de Qulte.',
};

const items = [
  {
    title: 'Aide générale',
    description: 'Pour toute question sur Qulte, la connexion, les playlists, les critiques ou la messagerie.',
  },
  {
    title: 'Bêta iPhone',
    description: 'Si tu testes la version TestFlight, tu peux aussi envoyer un retour directement depuis TestFlight.',
  },
  {
    title: 'Compte et confidentialité',
    description: 'La suppression de compte peut être lancée directement depuis Réglages > Confidentialité dans l’application.',
  },
];

export default function SupportPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="max-w-2xl space-y-4">
          <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
            Support Qulte
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Besoin d’aide ?</h1>
          <p className="text-sm leading-6 text-white/70 sm:text-base">
            Qulte continue d’évoluer. Cette page centralise le support utile pour l’application iPhone et l’expérience web.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <article key={item.title} className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-bold text-white">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-white/72">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Contact direct</h2>
        <p className="mt-4 text-sm leading-6 text-white/72 sm:text-[15px]">
          Pour le support, les retours de bêta ou un problème de compte, écris à{' '}
          <a className="font-semibold text-sky-200 underline decoration-sky-300/40 underline-offset-4" href="mailto:notifications@qulte.app">
            notifications@qulte.app
          </a>
          .
        </p>
      </section>
    </main>
  );
}
