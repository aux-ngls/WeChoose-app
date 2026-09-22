# Publication Android Qulte

État technique vérifié le 22 septembre 2026.

## Application

- Nom : Qulte
- Type : Application
- Catégorie conseillée : Divertissement
- Modèle : Gratuite
- Publicités : Non
- Package Android : `dev.dury.qulte`
- Version affichée : `1.0.1`
- Format de production : Android App Bundle (`.aab`)
- API Android ciblée : 36
- Public visé conseillé : 16 ans et plus

## Liens publics

- Politique de confidentialité : `https://wechoose.dury.dev/privacy`
- Conditions d’utilisation : `https://wechoose.dury.dev/terms`
- Suppression de compte : `https://wechoose.dury.dev/account-deletion`
- Support : `https://wechoose.dury.dev/support`

## Accès pour l'examen

Qulte exige une connexion. Dans Play Console, fournir un compte de démonstration fonctionnel et préciser que toutes les fonctions principales sont accessibles après connexion. Vérifier le compte juste avant chaque soumission.

## Contenu généré par les utilisateurs

- Les conditions interdisent les contenus et comportements abusifs.
- L’utilisateur accepte les conditions avant de créer son compte.
- Les profils, critiques et conversations peuvent être signalés.
- Les utilisateurs peuvent être bloqués.
- La suppression du compte est disponible dans l’application.

## Déclaration Data safety à vérifier dans Play Console

Qulte collecte des données pour fournir ses fonctionnalités, mais ne les vend pas. Les données sont chiffrées en transit et l’utilisateur peut demander leur suppression.

Types de données à déclarer de manière prudente :

- Informations personnelles : nom d’utilisateur et adresse e-mail facultative.
- Photos : photo de profil facultative choisie par l’utilisateur.
- Messages : messages privés envoyés dans l’application.
- Activité dans l’application : notes, swipes, playlists, abonnements, likes et interactions.
- Autres contenus générés par l’utilisateur : critiques, commentaires, profil et préférences.
- Identifiants de l’appareil ou autres identifiants : jeton de notification push et données techniques de sécurité.

Finalités principales : fonctionnement de l’application, personnalisation, communication, sécurité et prévention des abus. Vérifier les définitions affichées par Play Console au moment de remplir le formulaire.

## Notifications Android

Avant le build destiné aux testeurs, configurer Firebase Cloud Messaging v1 :

1. Créer ou ouvrir un projet Firebase.
2. Ajouter l’application Android `dev.dury.qulte`.
3. Télécharger `google-services.json` dans `mobile/` sans le commiter.
4. Ajouter `android.googleServicesFile` dans `app.json`.
5. Importer la clé du compte de service FCM v1 dans les identifiants EAS.

## Premier envoi

1. Se connecter à Expo avec le compte propriétaire du projet.
2. Lancer `eas build --platform android --profile production` depuis `mobile/`.
3. Télécharger le fichier `.aab` généré.
4. Créer Qulte dans Play Console avec le package `dev.dury.qulte`.
5. Effectuer le premier import manuellement dans le test interne ou fermé.
6. Activer Play App Signing lors du premier envoi.

Les envois suivants pourront utiliser `eas submit --platform android --profile production` après configuration du compte de service Google Play.

## Nouvelle compte développeur personnel

Si le compte personnel a été créé après le 13 novembre 2023, prévoir au moins 12 testeurs inscrits sans interruption pendant 14 jours sur un test fermé avant de demander l’accès à la production.

