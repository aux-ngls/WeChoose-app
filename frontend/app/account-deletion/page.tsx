import type { Metadata } from 'next';
import Link from 'next/link';

const CONTACT_EMAIL = 'qulte.developpeur@gmail.com';

export const metadata: Metadata = {
  title: 'Suppression de compte',
  description: 'Demander la suppression de votre compte Qulte et des données associées.',
};

export default function AccountDeletionPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <span className="inline-flex rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-100">
          Compte Qulte
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Supprimer votre compte</h1>
        <p className="mt-4 text-sm leading-6 text-white/72 sm:text-base">
          Vous pouvez supprimer définitivement votre compte Qulte et les données qui lui sont associées depuis l’application ou en envoyant une
          demande au support si vous n’avez plus accès à votre compte.
        </p>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Depuis l’application</h2>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-white/76">
          <li className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">1. Ouvrez votre profil puis les Réglages.</li>
          <li className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">2. Descendez jusqu’à la section Confidentialité.</li>
          <li className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">3. Appuyez sur « Supprimer mon compte » et confirmez.</li>
        </ol>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Sans accès à l’application</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          Envoyez un email depuis l’adresse liée à votre compte en indiquant votre nom d’utilisateur Qulte. Le support vérifiera la demande avant de
          procéder à la suppression.
        </p>
        <a
          className="mt-5 inline-flex w-fit items-center rounded-full border border-red-300/30 bg-red-300/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-300/15"
          href={`mailto:${CONTACT_EMAIL}?subject=Suppression%20de%20mon%20compte%20Qulte`}
        >
          Demander la suppression
        </a>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Données supprimées</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          La suppression efface le profil, les préférences, les notes, les playlists, les critiques, les commentaires, les messages, les abonnements,
          les notifications et les données de recommandation associés au compte. Cette action est définitive.
        </p>
        <Link
          href="/privacy"
          className="mt-5 inline-flex w-fit items-center rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          Lire la politique de confidentialité
        </Link>
      </section>
    </main>
  );
}
