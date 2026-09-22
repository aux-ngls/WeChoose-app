import type { Metadata } from 'next';
import Link from 'next/link';

const CONTACT_EMAIL = 'qulte.developpeur@gmail.com';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
  description: 'Conditions d’utilisation et règles de la communauté Qulte.',
};

const prohibitedContent = [
  'le harcèlement, les menaces, les discours haineux, discriminatoires ou humiliants ;',
  'les contenus sexuels explicites, notamment tout contenu impliquant des mineurs ;',
  'l’incitation à la violence, à l’automutilation ou à une activité illégale ;',
  'le spam, l’usurpation d’identité, la fraude ou la manipulation des autres utilisateurs ;',
  'la publication de données personnelles sans autorisation ;',
  'les contenus qui enfreignent un droit d’auteur, une marque ou un autre droit de propriété intellectuelle.',
];

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
          Communauté Qulte
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Conditions d’utilisation</h1>
        <p className="mt-4 text-sm leading-6 text-white/72 sm:text-base">
          Qulte permet de découvrir, noter et partager des films et séries, de publier des critiques et d’échanger avec d’autres passionnés. En créant
          un compte, vous acceptez les présentes conditions et vous vous engagez à respecter les autres membres.
        </p>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-white/45">Dernière mise à jour : 22 septembre 2026</p>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Accès au service</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          Qulte n’est pas destiné aux enfants de moins de 16 ans. Vous êtes responsable de la confidentialité de vos identifiants et des contenus
          publiés depuis votre compte. Les informations fournies doivent être sincères et ne pas usurper l’identité d’un tiers.
        </p>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Contenus et comportements interdits</h2>
        <div className="mt-4 space-y-3">
          {prohibitedContent.map((item) => (
            <p key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-white/76">
              {item}
            </p>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Signalement et blocage</h2>
          <p className="mt-4 text-sm leading-6 text-white/76">
            L’application permet de signaler un profil, une critique ou une conversation et de bloquer un utilisateur. Utilisez ces outils lorsqu’un
            contenu ou un comportement enfreint ces règles. Les signalements abusifs ou mensongers peuvent également faire l’objet de mesures.
          </p>
        </article>
        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
          <h2 className="text-xl font-bold text-white">Modération</h2>
          <p className="mt-4 text-sm leading-6 text-white/76">
            Qulte peut retirer un contenu, limiter une fonctionnalité, suspendre ou supprimer un compte lorsque cela est nécessaire pour protéger la
            communauté, respecter la loi ou faire appliquer ces conditions.
          </p>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Disponibilité et responsabilité</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          Le service peut évoluer, être interrompu temporairement ou présenter des erreurs. Les informations relatives aux films, séries, bandes-annonces
          et plateformes peuvent provenir de services tiers et ne sont pas garanties comme exhaustives ou permanentes.
        </p>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Contact et données personnelles</h2>
        <p className="mt-4 text-sm leading-6 text-white/76">
          Pour toute question ou contestation, contactez{' '}
          <a className="font-semibold text-amber-100 underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . La gestion des données personnelles est détaillée dans la politique de confidentialité.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/privacy" className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-white">
            Politique de confidentialité
          </Link>
          <Link href="/account-deletion" className="rounded-full border border-red-300/20 bg-red-300/8 px-4 py-2 text-sm font-semibold text-red-100">
            Suppression de compte
          </Link>
        </div>
      </section>
    </main>
  );
}
