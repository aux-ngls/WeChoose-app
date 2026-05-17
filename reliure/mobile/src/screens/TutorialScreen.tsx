import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import QulteMark from '../components/QulteMark';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

const PRINCIPLES: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}> = [
  {
    icon: 'star-half-outline',
    title: 'Tu donnes ton avis',
    text: 'Notes, swipes et ajouts en liste aident Reliure à comprendre ce que tu aimes vraiment.',
  },
  {
    icon: 'sparkles-outline',
    title: 'Reliure apprend',
    text: 'Les recommandations évoluent avec tes choix, sans se limiter à un seul genre.',
  },
  {
    icon: 'people-outline',
    title: 'La lecture devient sociale',
    text: 'Critiques, profils et messages te permettent de découvrir aussi par les autres.',
  },
];

const STEPS: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}> = [
  {
    icon: 'home-outline',
    title: 'Accueil',
    text: 'Le cœur de Reliure : une recommandation arrive, tu la notes, tu la passes ou tu la gardes pour plus tard.',
  },
  {
    icon: 'book-outline',
    title: 'Fiche livre',
    text: 'Résumé, auteur, note, playlists et partage : tout part de la même fiche.',
  },
  {
    icon: 'people-outline',
    title: 'Social',
    text: 'Publie des critiques, commente les avis et suis les profils qui ont des goûts proches ou surprenants.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Messages',
    text: 'Discute en privé et partage directement un livre quand tu veux convaincre quelqu’un de le lire.',
  },
  {
    icon: 'person-circle-outline',
    title: 'Profil',
    text: 'Retrouve tes playlists, tes critiques et les livres ou auteurs qui définissent ton univers lecture.',
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
        <Text style={[styles.title, { color: theme.colors.text }]}>Bienvenue sur Reliure</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Reliure t’aide à trouver quoi lire, à garder tes envies et à parler découvertes avec les bonnes personnes.
        </Text>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <View style={[styles.principleCard, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]}>
        <Text style={[styles.principleTitle, { color: theme.colors.text }]}>Le principe</Text>
        <Text style={[styles.principleIntro, { color: theme.colors.textSoft }]}>
          Plus tu utilises Reliure, plus l’app comprend les livres, les thèmes, les auteurs et les ambiances qui comptent pour toi.
        </Text>
        <View style={styles.principles}>
          {PRINCIPLES.map((item) => (
            <View key={item.title} style={styles.principleRow}>
              <View style={[styles.principleIcon, { backgroundColor: theme.rgba.card }]}>
                <Ionicons name={item.icon} size={16} color={theme.colors.accent} />
              </View>
              <View style={styles.stepBody}>
                <Text style={[styles.stepTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Text style={[styles.stepText, { color: theme.colors.textMuted }]}>{item.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step) => (
          <View key={step.title} style={[styles.stepRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <View style={[styles.stepIcon, { backgroundColor: theme.colors.accentSoft }]}>
              <Ionicons name={step.icon} size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepTitle, { color: theme.colors.text }]}>{step.title}</Text>
              <Text style={[styles.stepText, { color: theme.colors.textMuted }]}>{step.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable style={[styles.startButton, { backgroundColor: theme.colors.accent }]} onPress={() => void handleComplete()} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={theme.colors.accentText} />
        ) : (
          <>
            <Text style={[styles.startButtonLabel, { color: theme.colors.accentText }]}>Commencer</Text>
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
  principleCard: {
    gap: 12,
    borderRadius: 28,
    borderWidth: 1,
    padding: 16,
  },
  principleTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  principleIntro: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  principles: {
    gap: 10,
  },
  principleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  principleIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
