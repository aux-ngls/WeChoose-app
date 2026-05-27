import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import QulteMark from '../components/QulteMark';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

const SECTIONS: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  lines: string[];
}> = [
  {
    icon: 'sparkles-outline',
    title: '1. Les recommandations',
    lines: [
      'Qulte te propose des films selon tes goûts.',
      'Si tu as déjà vu un film, note-le avec les étoiles sous l’affiche.',
      'Si tu ne l’as pas vu, swipe à droite pour l’ajouter à “À regarder plus tard”, ou à gauche pour passer.',
      'Tu peux aussi toucher l’affiche pour ouvrir sa fiche complète : résumé, trailer, casting et plus.',
      'À chaque action, l’algorithme apprend et améliore ses prochaines recommandations.',
    ],
  },
  {
    icon: 'search-outline',
    title: '2. La recherche',
    lines: [
      'Tu peux rechercher des films pour consulter leur fiche, les noter, les ajouter à une playlist ou les partager.',
      'Tu peux aussi rechercher des utilisateurs pour découvrir leur profil, leurs critiques et leurs goûts.',
    ],
  },
  {
    icon: 'people-outline',
    title: '3. Le social',
    lines: [
      'La partie sociale te permet d’écrire des critiques de films et de lire celles de tes amis.',
      'Tu peux suivre d’autres utilisateurs, découvrir leurs avis et échanger autour des films.',
    ],
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: '4. Les messages privés',
    lines: [
      'Tu peux discuter en privé avec d’autres utilisateurs.',
      'Les messages permettent de parler d’un film, de réagir à une critique ou de partager directement un film dans une conversation.',
    ],
  },
  {
    icon: 'person-circle-outline',
    title: '5. Ton profil',
    lines: [
      'Ton profil rassemble tes goûts, tes critiques et ton activité.',
      'C’est l’endroit où les autres peuvent découvrir ton univers cinéma.',
    ],
  },
];

export default function TutorialScreen() {
  const { completeTutorial } = useAuth();
  const { theme } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleComplete = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await completeTutorial();
    } catch {
      setError('Impossible de terminer le tutoriel pour le moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={[styles.heroCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
        <QulteMark size={52} />
        <Text style={[styles.title, { color: theme.colors.text }]}>Bienvenue sur Qulte</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Qulte t’aide à trouver quoi regarder, partager tes avis et découvrir les goûts de tes amis.
        </Text>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <View style={styles.steps}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={[styles.stepRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <View style={[styles.stepIcon, { backgroundColor: theme.colors.accentSoft }]}>
              <Ionicons name={section.icon} size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepTitle, { color: theme.colors.text }]}>{section.title}</Text>
              <View style={styles.stepLines}>
                {section.lines.map((line) => (
                  <Text key={line} style={[styles.stepText, { color: theme.colors.textMuted }]}>
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        ))}
      </View>

      <Pressable style={[styles.startButton, { backgroundColor: theme.colors.accent }]} onPress={() => void handleComplete()} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={theme.colors.accentText} />
        ) : (
          <>
            <Text style={[styles.startButtonLabel, { color: theme.colors.accentText }]}>J&apos;ai compris</Text>
            <Ionicons name="arrow-forward" size={18} color={theme.colors.accentText} />
          </>
        )}
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingVertical: 22,
  },
  heroCard: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    gap: 10,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
  },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBody: {
    flex: 1,
    gap: 3,
  },
  stepLines: {
    gap: 6,
    marginTop: 2,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  stepText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  startButton: {
    minHeight: 54,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startButtonLabel: {
    fontSize: 16,
    fontWeight: '900',
  },
});
