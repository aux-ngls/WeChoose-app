import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Politique de confidentialité de Qulte.',
};

const sections = [
  {
    title: 'Données utilisées',
    items: [
      'Compte : nom d’utilisateur, mot de passe chiffré et photo de profil si tu en ajoutes une.',
      'Cinéma : notes, playlists, critiques, préférences de profil, onboarding et signaux de recommandation.',
      'Social : abonnements, commentaires, likes, messages privés, partages de films, blocages et signalements.',
      'Technique : jetons de notifications, version de l’app et données nécessaires au bon fonctionnement.',
    ],
  },
  {
    title: 'Pourquoi ces données sont utilisées',
    items: [
      'Faire fonctionner le compte et synchroniser ton expérience entre les écrans de Qulte.',
      'Personnaliser les recommandations de films et améliorer la qualité des propositions.',
      'Permettre les fonctions sociales : critiques, commentaires, abonnements, messages et partage de films.',
      'Sécuriser la plateforme grâce aux outils de blocage, signalement et modération de base.',
    ],
  },
  {
    title: 'Tes contrôles',
    items: [
      'Tu peux modifier ton profil, tes playlists et tes préférences directement dans l’app.',
      'Tu peux bloquer un autre utilisateur pour masquer son contenu dans le social et la messagerie.',
      'Tu peux supprimer ton compte depuis Réglages > Confidentialité dans l’application.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="max-w-2xl space-y-4">
          <span className="inline-flex rounded-full border border-pink-400/30 bg-pink-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-pink-200">
            Qulte
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Politique de confidentialité</h1>
          <p className="text-sm leading-6 text-white/70 sm:text-base">
            Qulte est une application sociale autour du cinéma. Cette page résume les données utiles au service, à la personnalisation,
            à la messagerie et à la sécurité de la communauté.
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">Dernière mise à jour : 5 mai 2026</p>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.title} className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">{section.title}</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-white/72 sm:text-[15px]">
            {section.items.map((item) => (
              <li key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Conservation et suppression</h2>
        <p className="mt-4 text-sm leading-6 text-white/72 sm:text-[15px]">
          Les données sont conservées tant que ton compte reste actif ou tant qu’elles sont nécessaires au fonctionnement normal de Qulte.
          Lorsque tu supprimes ton compte depuis l’application, les données liées à ce compte sont supprimées du service selon la logique prévue
          dans l’app et le backend.
        </p>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Contact</h2>
        <p className="mt-4 text-sm leading-6 text-white/72 sm:text-[15px]">
          Pour une question sur la confidentialité ou le support, utilise la page de support de Qulte ou écris à{' '}
          <a className="font-semibold text-pink-200 underline decoration-pink-300/40 underline-offset-4" href="mailto:notifications@qulte.app">
            notifications@qulte.app
          </a>
          .
        </p>
        <Link
          href="/support"
          className="mt-5 inline-flex w-fit items-center rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          Ouvrir la page support
        </Link>
      </section>
    </main>
  );
}
