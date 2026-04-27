import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import QulteMark from '../components/QulteMark';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

const STEPS = [
  {
    icon: 'sparkles-outline',
    title: 'Accueil',
    text: 'Swipe les films, note precisement, garde ceux que tu veux voir plus tard.',
  },
  {
    icon: 'newspaper-outline',
    title: "A l'affiche",
    text: 'Retrouve les sorties populaires, tes suggestions et les notes de tes amis.',
  },
  {
    icon: 'people-outline',
    title: 'Social',
    text: 'Publie des critiques, commente, like et suis les profils qui te parlent.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Messages',
    text: 'Discute en prive et partage directement des films dans une conversation.',
  },
] as const;

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
          Une visite rapide avant de commencer.
        </Text>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

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
    justifyContent: 'center',
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
    fontWeight: '700',
    textAlign: 'center',
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
