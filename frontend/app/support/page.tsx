import type { Metadata } from 'next';
import Link from 'next/link';

const CONTACT_EMAIL = 'qulte.developpeur@gmail.com';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Support de Qulte.',
};

const supportTopics = [
  {
    title: 'Compte et connexion',
    body: 'Aide pour la création de compte, la connexion, la perte d’accès, la suppression de compte ou une information de profil incorrecte.',
  },
  {
    title: 'Application iPhone',
    body: 'Signalement d’un bug, d’un crash, d’un problème de notification, d’un souci TestFlight ou d’un comportement anormal dans l’application.',
  },
  {
    title: 'Films et recommandations',
    body: 'Questions liées au Tinder de films, aux notes, aux playlists, aux recommandations personnalisées ou aux films proposés par l’application.',
  },
  {
    title: 'Fonctions sociales',
    body: 'Aide concernant les critiques, commentaires, abonnements, messages privés, partages de films ou profils utilisateurs.',
  },
  {
    title: 'Sécurité et signalements',
    body: 'Traitement des demandes liées au blocage, aux signalements, aux comportements abusifs ou aux contenus qui ne respectent pas l’esprit de la communauté.',
  },
  {
    title: 'Confidentialité',
    body: 'Questions sur les données utilisées par Qulte, la politique de confidentialité, la suppression de compte ou les droits de l’utilisateur.',
  },
];

const usefulDetails = [
  'votre nom d’utilisateur Qulte ;',
  'le modèle de votre iPhone et la version iOS si le problème est technique ;',
  'une description courte mais précise de ce qui s’est passé ;',
  'le nom du profil, du film, de la critique ou de la conversation concernée si la demande porte sur un contenu ;',
  'une capture d’écran si elle aide à comprendre le problème.',
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
          <p className="text-sm leading-6 text-white/72 sm:text-base">
            Cette page centralise les demandes liées à l’application Qulte, à la bêta iPhone, au compte utilisateur, aux contenus publiés et à la
            confidentialité. Elle sert aussi de point de contact officiel pour les utilisateurs et pour l’examen de l’application.
          </p>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Contact direct</h2>
            <p className="mt-2 text-sm leading-6 text-white/76">
              Pour toute demande de support, envoyez un message à cette adresse. Nous faisons au mieux pour répondre avec les informations utiles et
              résoudre les problèmes signalés.
            </p>
          </div>
          <a
            className="inline-flex w-fit items-center rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/15"
            href={`mailto:${CONTACT_EMAIL}?subject=Support%20Qulte`}
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Demandes prises en charge</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supportTopics.map((topic) => (
            <article key={topic.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-sky-100">{topic.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/76">{topic.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Informations utiles à envoyer</h2>
          <p className="mt-4 text-sm leading-6 text-white/76">
            Pour traiter une demande plus rapidement, il est utile d’inclure :
          </p>
          <div className="mt-4 space-y-3">
            {usefulDetails.map((item) => (
              <p key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-white/76">
                {item}
              </p>
            ))}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Compte, données et suppression</h2>
          <p className="mt-4 text-sm leading-6 text-white/76">
            La suppression de compte est disponible directement dans l’application, depuis Réglages &gt; Confidentialité. Si vous ne pouvez plus
            accéder à votre compte, contactez le support avec votre nom d’utilisateur afin que la demande puisse être examinée.
          </p>
          <Link
            href="/privacy"
            className="mt-5 inline-flex w-fit items-center rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
          >
            Lire la politique de confidentialité
          </Link>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Signalements et sécurité</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          Qulte propose des outils de blocage et de signalement dans l’application. Si un contenu, un profil ou une conversation semble abusif,
          menaçant, trompeur ou contraire à l’esprit de la communauté, vous pouvez utiliser ces outils ou contacter directement le support. Les
          signalements aident à maintenir un espace social plus sûr autour du cinéma.
        </p>
      </section>
    </main>
  );
}
