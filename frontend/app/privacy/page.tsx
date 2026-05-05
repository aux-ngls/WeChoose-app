import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Politique de confidentialité de Qulte.',
};

const dataSections = [
  {
    title: 'Compte',
    body: 'Nom d’utilisateur, mot de passe chiffré, et photo de profil si tu en ajoutes une.',
  },
  {
    title: 'Cinéma',
    body: 'Notes, films vus, playlists, films mis de côté, critiques, commentaires et préférences de profil.',
  },
  {
    title: 'Recommandations',
    body: 'Choix faits pendant l’onboarding, swipes, notes et signaux utiles pour personnaliser les films proposés.',
  },
  {
    title: 'Social',
    body: 'Abonnements, likes, commentaires, messages privés, films partagés, blocages et signalements.',
  },
  {
    title: 'Technique',
    body: 'Jetons de notifications, version de l’app et données nécessaires à la sécurité et au fonctionnement.',
  },
];

const usageSections = [
  'Faire fonctionner ton compte et synchroniser ton expérience.',
  'Personnaliser les recommandations de films.',
  'Permettre les critiques, commentaires, messages et partages de films.',
  'Protéger la communauté avec le blocage, le signalement et une modération de base.',
  'Envoyer des notifications si tu les autorises sur ton téléphone.',
];

const controlSections = [
  'Modifier ton profil, ta photo, tes playlists et tes préférences depuis l’app.',
  'Bloquer un compte pour masquer ses contenus et ses messages.',
  'Signaler un profil, une critique ou une conversation.',
  'Supprimer ton compte depuis Réglages > Confidentialité dans l’app.',
  'Contacter le support si tu n’arrives plus à accéder à ton compte.',
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="max-w-3xl space-y-4">
          <span className="inline-flex rounded-full border border-pink-400/30 bg-pink-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-pink-200">
            Qulte
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Politique de confidentialité</h1>
          <p className="text-sm leading-6 text-white/70 sm:text-base">
            Qulte est une application sociale autour du cinéma. Cette page explique quelles données sont utilisées, pourquoi elles le sont,
            et quels contrôles tu gardes sur ton compte.
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">Dernière mise à jour : 5 mai 2026</p>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Données utilisées</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {dataSections.map((section) => (
            <article key={section.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-pink-100">{section.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/72">{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Utilisation</h2>
        <div className="mt-4 space-y-3">
          {usageSections.map((item) => (
            <p key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-white/72">
              {item}
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Tes contrôles</h2>
        <div className="mt-4 space-y-3">
          {controlSections.map((item) => (
            <p key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-white/72">
              {item}
            </p>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Partage et vente de données</h2>
          <p className="mt-4 text-sm leading-6 text-white/72">
            Qulte ne vend pas tes données personnelles. Certaines données peuvent être traitées par les services techniques nécessaires au
            fonctionnement de l’app, comme l’hébergement, les notifications ou les outils de distribution mobile.
          </p>
        </article>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Conservation</h2>
          <p className="mt-4 text-sm leading-6 text-white/72">
            Les données sont conservées tant que ton compte reste actif ou tant qu’elles sont nécessaires au fonctionnement normal de Qulte.
            La suppression du compte efface les données liées à ce compte dans l’app et le backend.
          </p>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Contact</h2>
        <p className="mt-4 text-sm leading-6 text-white/72 sm:text-[15px]">
          Pour une question sur la confidentialité, le support ou la suppression de compte, écris à{' '}
          <a className="font-semibold text-pink-200 underline decoration-pink-300/40 underline-offset-4" href="mailto:qulte.developpeur@gmail.com">
            qulte.developpeur@gmail.com
          </a>
          .
        </p>
        <Link
          href="/support"
          className="mt-5 inline-flex w-fit items-center rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          Ouvrir le support
        </Link>
      </section>
    </main>
  );
}
