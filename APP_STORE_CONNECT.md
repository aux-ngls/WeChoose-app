# Qulte - App Store Connect

Last updated: 2026-05-06

This document keeps the App Store Connect submission copy and privacy answers in one place. Keep it updated whenever the app, privacy pages, moderation tools, data collection, or release positioning changes.

## URLs

Support URL:

```text
https://wechoose.dury.dev/support
```

Privacy Policy URL:

```text
https://wechoose.dury.dev/privacy
```

User Privacy Choices URL:

```text
https://wechoose.dury.dev/privacy
```

Marketing URL, optional:

```text
https://wechoose.dury.dev
```

## App Information

App name:

```text
Qulte
```

Subtitle:

```text
Films, critiques et amis
```

Category recommendation:

```text
Primary: Entertainment
Secondary: Social Networking
```

Copyright:

```text
2026 Qulte
```

## Promotional Text

```text
Découvrez des films à votre goût, notez ceux que vous aimez, publiez vos critiques et partagez vos découvertes avec vos amis.
```

## Description

```text
Qulte est une application sociale dédiée au cinéma.

L’application vous aide à découvrir des films grâce à des recommandations personnalisées, à garder vos envies dans des playlists, à noter les films que vous avez vus et à partager vos avis avec d’autres utilisateurs.

Le principe est simple : vous indiquez vos goûts, vous explorez des films dans une interface de swipe, puis Qulte affine progressivement ses recommandations en fonction de vos notes, de vos choix et de votre activité. L’objectif est de proposer des films qui vous ressemblent, tout en laissant aussi de la place à la découverte.

Qulte permet également de publier des critiques, de suivre des profils, de commenter les avis des autres utilisateurs, d’échanger en message privé et de partager directement des films dans une conversation.

Fonctionnalités principales :

- recommandations de films personnalisées ;
- swipe de films pour découvrir rapidement de nouvelles idées ;
- notes avec précision à la demi-étoile ;
- playlists personnelles, dont les films à regarder plus tard ;
- critiques de films et commentaires ;
- profils utilisateurs avec films, acteurs et préférences ;
- messagerie privée et partage de films ;
- blocage et signalement pour garder une expérience sociale plus saine ;
- suppression de compte directement depuis l’application.

Qulte est pensé pour les personnes qui aiment le cinéma, veulent mieux organiser leurs découvertes et souhaitent échanger autour des films avec leurs amis ou avec d’autres passionnés.
```

## Keywords

Keep under Apple's keyword limit.

```text
cinéma,films,recommandations,critiques,playlists,social,amis,notes,sorties
```

## Review Notes

```text
Bonjour,

Qulte est une application sociale autour du cinéma. Elle permet de découvrir des films, de les noter, de les organiser en playlists, de publier des critiques, de suivre d’autres utilisateurs et d’échanger en message privé.

Un compte est nécessaire pour tester l’application.

Compte de test :
Nom d’utilisateur : [à compléter]
Mot de passe : [à compléter]

Parcours conseillé pour la review :
1. Connectez-vous avec le compte de test.
2. Ouvrez l’accueil pour tester le swipe de recommandations.
3. Ouvrez une fiche film pour vérifier les notes, la bande-annonce, les playlists et les informations du film.
4. Ouvrez l’onglet Social pour consulter les critiques et les commentaires.
5. Ouvrez Messages pour tester une conversation privée et le partage de film.
6. Ouvrez Profil pour consulter les playlists, critiques et préférences.
7. Ouvrez Réglages pour vérifier les liens Support, Confidentialité et la suppression de compte.

L’application contient du contenu généré par les utilisateurs. Des outils de blocage et de signalement sont disponibles depuis les profils, les critiques et les conversations. La suppression de compte est disponible dans Réglages > Confidentialité.

Support :
https://wechoose.dury.dev/support

Politique de confidentialité :
https://wechoose.dury.dev/privacy
```

## App Review Contact

These fields are required in App Store Connect and are not shown publicly.

```text
First name: [à compléter]
Last name: [à compléter]
Phone: [à compléter]
Email: qulte.developpeur@gmail.com
```

## Privacy Questionnaire

These answers should match the current implementation. Recheck this section whenever analytics, ads, SDKs, login fields, or data storage change.

Data collection:

```text
Yes, this app collects data.
```

Tracking:

```text
No, this app does not use collected data to track users across apps or websites owned by other companies.
```

Data linked to the user:

```text
Yes, the collected data is linked to the user account.
```

Recommended data types to declare:

```text
User Content > Photos or Videos
Reason: profile photo when the user chooses to upload one.
Linked to user: Yes
Used for: App Functionality
Tracking: No

User Content > Other User Content
Reason: reviews, comments, private messages, playlists, profile preferences and shared films.
Linked to user: Yes
Used for: App Functionality, Personalization
Tracking: No

Identifiers > User ID
Reason: internal user account, username and account-level identifiers.
Linked to user: Yes
Used for: App Functionality
Tracking: No

Usage Data > Product Interaction
Reason: ratings, swipes, playlist actions and recommendation interactions used to personalize recommendations and improve app behavior.
Linked to user: Yes
Used for: App Functionality, Personalization, Analytics
Tracking: No

Usage Data > Other Usage Data
Reason: recommendation impressions and interaction signals used by the recommendation system.
Linked to user: Yes
Used for: App Functionality, Personalization, Analytics
Tracking: No
```

Data types probably not to declare unless the app changes:

```text
Contact Info
Reason: the app currently uses username and password, not email or phone number for account creation.

Location
Reason: the app does not request location.

Contacts
Reason: the app does not request the user’s address book.

Financial Info
Reason: there are no payments in the current app.

Health and Fitness
Reason: not used.

Diagnostics
Reason: do not declare unless Qulte adds explicit crash or performance analytics collected by the app or a third-party SDK.

Advertising Data
Reason: no ads or ad tracking are currently implemented.
```

## Age Rating Guidance

Recommended answers should be conservative because Qulte has social content and film-related content.

```text
User Generated Content: Yes
Unrestricted Web Access: No, unless the submitted build includes a general web browser.
Messaging or Chat: Yes
Violence / Mature Themes / Sexual Content: choose the lowest accurate frequency based on movie metadata and user-generated reviews.
```

Expected result may be higher than a simple utility app because Qulte includes social features, messages and user-generated reviews. That is acceptable if the questionnaire is answered honestly.

## Final Checklist Before Submit

```text
1. Create or verify the App Review test account.
2. Confirm the test account can log in on the latest TestFlight build.
3. Confirm Support and Privacy links open from Settings.
4. Confirm account deletion works from Settings.
5. Confirm report/block actions exist on profiles, reviews and conversations.
6. Upload iPhone screenshots only.
7. Fill privacy answers consistently with this file.
8. Submit the latest production build.
```

## Sources

- App information and support/privacy URLs: https://developer.apple.com/help/app-store-connect/reference/app-information/
- Privacy policy URL and data types: https://developer.apple.com/help/app-store-connect/reference/app-privacy/
- App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- App review details: https://developer.apple.com/documentation/appstoreconnectapi/app-store-review-details
