import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Support de Qulte.',
};

const supportTopics = [
  {
    title: 'Compte',
    description: 'Connexion, création de compte, suppression de compte ou problème d’accès.',
  },
  {
    title: 'Application iPhone',
    description: 'Bug, crash, notification, TestFlight ou comportement anormal dans l’app.',
  },
  {
    title: 'Films et recommandations',
    description: 'Tinder, notes, playlists, films proposés ou personnalisation des recommandations.',
  },
  {
    title: 'Social',
    description: 'Critiques, commentaires, abonnements, messages privés ou partage de films.',
  },
  {
    title: 'Sécurité',
    description: 'Blocage, signalement, contenu abusif ou comportement qui pose problème.',
  },
  {
    title: 'Confidentialité',
    description: 'Questions sur les données, les droits utilisateur ou la politique de confidentialité.',
  },
];

const beforeContact = [
  'Ton nom d’utilisateur Qulte.',
  'Le modèle de ton iPhone et la version iOS si le problème est technique.',
  'Une courte description du problème et, si possible, l’écran concerné.',
  'Pour un signalement, le profil, la critique ou la conversation concernée.',
];

export default function SupportPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="max-w-3xl space-y-4">
          <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
            Support Qulte
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Aide et contact</h1>
          <p className="text-sm leading-6 text-white/70 sm:text-base">
            Cette page sert de point de contact pour l’application iPhone, la bêta TestFlight, le site web et les demandes liées au compte.
          </p>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Contact direct</h2>
            <p className="mt-2 text-sm leading-6 text-white/72">Pour le support, les retours de bêta ou un problème de compte.</p>
          </div>
          <a
            className="inline-flex w-fit items-center rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/15"
            href="mailto:notifications@qulte.app?subject=Support%20Qulte"
          >
            notifications@qulte.app
          </a>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Sujets pris en charge</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supportTopics.map((topic) => (
            <article key={topic.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-sky-100">{topic.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/72">{topic.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Avant d’écrire</h2>
          <div className="mt-4 space-y-3">
            {beforeContact.map((item) => (
              <p key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-white/72">
                {item}
              </p>
            ))}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Compte et données</h2>
          <p className="mt-4 text-sm leading-6 text-white/72">
            La suppression de compte est disponible dans l’app depuis Réglages &gt; Confidentialité. Si tu n’as plus accès à ton compte,
            contacte le support avec ton nom d’utilisateur.
          </p>
          <Link
            href="/privacy"
            className="mt-5 inline-flex w-fit items-center rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
          >
            Lire la confidentialité
          </Link>
        </article>
      </section>
    </main>
  );
}
