import type { Metadata } from 'next';
import Link from 'next/link';

const CONTACT_EMAIL = 'qulte.developpeur@gmail.com';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Politique de confidentialité de Qulte.',
};

const collectedData = [
  {
    title: 'Compte et identification',
    body: 'Lorsque vous créez un compte, Qulte utilise votre nom d’utilisateur, votre mot de passe chiffré et, si vous choisissez d’en ajouter une, votre photo de profil. Ces informations permettent de vous connecter, d’afficher votre profil et de retrouver vos contenus dans l’application.',
  },
  {
    title: 'Activité cinéma',
    body: 'Qulte enregistre les films que vous notez, les films ajoutés à vos playlists, les critiques que vous publiez, vos commentaires, vos films favoris et les préférences renseignées dans votre profil ou pendant l’onboarding.',
  },
  {
    title: 'Recommandations',
    body: 'Pour personnaliser les propositions de films, Qulte peut utiliser vos notes, vos swipes, les films que vous appréciez, les films ignorés, les genres, les acteurs, les réalisateurs et les signaux de recommandation générés pendant votre utilisation.',
  },
  {
    title: 'Fonctions sociales',
    body: 'Les abonnements, likes, commentaires, messages privés, partages de films, blocages et signalements sont nécessaires au fonctionnement des fonctionnalités sociales de Qulte.',
  },
  {
    title: 'Données techniques',
    body: 'Qulte peut traiter des informations techniques limitées, comme la version de l’application, les jetons de notifications et les données nécessaires au fonctionnement, à la sécurité et au diagnostic du service.',
  },
];

const purposes = [
  'permettre la création et la connexion au compte utilisateur ;',
  'afficher les profils, playlists, critiques, commentaires et messages ;',
  'personnaliser les recommandations de films et améliorer leur pertinence ;',
  'permettre les notifications lorsque l’utilisateur les autorise ;',
  'prévenir les abus grâce aux outils de blocage, de signalement et de modération ;',
  'assurer la sécurité, la stabilité et le bon fonctionnement de l’application.',
];

const userRights = [
  'modifier votre profil, votre photo, vos playlists et vos préférences depuis l’application ;',
  'bloquer un utilisateur afin de masquer ses contenus et ses messages ;',
  'signaler un profil, une critique ou une conversation si un contenu pose problème ;',
  'supprimer votre compte depuis l’application, dans Réglages > Confidentialité ;',
  'contacter le support si vous n’arrivez plus à accéder à votre compte ou si vous souhaitez poser une question sur vos données.',
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
          <p className="text-sm leading-6 text-white/72 sm:text-base">
            Qulte est une application sociale dédiée au cinéma. Cette politique explique quelles données peuvent être utilisées, pourquoi elles le
            sont, comment elles participent au fonctionnement de l’application et quels moyens de contrôle sont à votre disposition.
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">Dernière mise à jour : 5 mai 2026</p>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Données collectées ou utilisées</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {collectedData.map((section) => (
            <article key={section.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-pink-100">{section.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/76">{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Pourquoi ces données sont utilisées</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          Les données ne sont utilisées que pour fournir les fonctionnalités de Qulte, personnaliser l’expérience cinéma, maintenir les fonctions
          sociales et protéger les utilisateurs. Elles servent notamment à :
        </p>
        <div className="mt-4 space-y-3">
          {purposes.map((item) => (
            <p key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-white/76">
              {item}
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Contenus publiés et messagerie</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          Qulte permet aux utilisateurs de publier des critiques, de commenter, de suivre d’autres profils et d’échanger des messages privés. Les
          contenus publics, comme les critiques et les commentaires, peuvent être visibles par d’autres utilisateurs. Les messages privés sont liés à
          une conversation entre utilisateurs ; ils peuvent être examinés uniquement lorsque cela est nécessaire au fonctionnement du service, à la
          sécurité ou au traitement d’un signalement.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Partage et publicité</h2>
          <p className="mt-4 text-sm leading-6 text-white/76">
            Qulte ne vend pas vos données personnelles. L’application n’utilise pas vos données pour vous suivre à travers des applications ou sites
            tiers à des fins publicitaires. Certaines données peuvent être traitées par des services techniques nécessaires à l’hébergement, aux
            notifications, à la distribution de l’application ou à son bon fonctionnement.
          </p>
        </article>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Conservation et suppression</h2>
          <p className="mt-4 text-sm leading-6 text-white/76">
            Les données sont conservées tant que votre compte reste actif ou tant qu’elles sont nécessaires au fonctionnement normal de Qulte. Vous
            pouvez lancer la suppression de votre compte depuis l’application. Cette action supprime les données liées au compte, notamment le profil,
            les notes, playlists, critiques, commentaires, messages, préférences et données de recommandation associées.
          </p>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Vos contrôles</h2>
        <div className="mt-4 space-y-3">
          {userRights.map((item) => (
            <p key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-white/76">
              {item}
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Sécurité et évolution de cette politique</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          Qulte met en place des mesures raisonnables pour protéger les comptes et limiter les abus. Aucune application ne peut toutefois garantir une
          sécurité absolue. Cette politique pourra être mise à jour si les fonctionnalités, les obligations légales ou les pratiques techniques de
          Qulte évoluent.
        </p>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Contact</h2>
        <p className="mt-4 text-sm leading-6 text-white/76 sm:text-[15px]">
          Pour toute question sur cette politique, la suppression de compte ou l’utilisation de vos données, vous pouvez écrire à{' '}
          <a className="font-semibold text-pink-200 underline decoration-pink-300/40 underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
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
