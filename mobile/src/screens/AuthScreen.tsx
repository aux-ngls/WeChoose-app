import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import FormField from '../components/FormField';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const { theme } = useTheme();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const accent = useMemo(() => (mode === 'login' ? '#38bdf8' : '#fb7185'), [mode]);

  const handleSubmit = async () => {
    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();

    if (!normalizedUsername || !normalizedPassword) {
      setError('Merci de remplir tous les champs.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await signIn(normalizedUsername, normalizedPassword);
      } else {
        await signUp(normalizedUsername, normalizedPassword);
      }
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError('Impossible de continuer pour le moment.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen contentStyle={styles.content}>
      <View style={styles.heroCard}>
        <View style={styles.brandRow}>
          <Text style={[styles.brand, { color: theme.colors.text }]}>Qulte</Text>
          <View style={[styles.brandBadge, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.brandBadgeLabel, { color: theme.colors.text }]}>Mobile</Text>
          </View>
        </View>

        <ScreenHeader
          icon={mode === 'login' ? 'log-in' : 'person-add'}
          accent={mode === 'login' ? 'blue' : 'pink'}
          eyebrow="React Native"
          title={mode === 'login' ? 'Connexion' : 'Creer un compte'}
          subtitle="Une vraie app smartphone branchee au backend Qulte existant."
        />

        <View style={[styles.segmentedControl, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          {[
            { key: 'login', label: 'Connexion' },
            { key: 'signup', label: 'Inscription' },
          ].map((entry) => {
            const isActive = mode === entry.key;
            return (
              <Pressable
                key={entry.key}
                onPress={() => setMode(entry.key as 'login' | 'signup')}
                style={[styles.segmentButton, isActive && { backgroundColor: accent }]}
              >
                <Text style={[styles.segmentLabel, { color: theme.colors.textSoft }, isActive && { color: '#09090b' }]}>{entry.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.formCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <FormField
            label="Nom d'utilisateur"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            placeholder="Isa.belaaa"
          />
          <FormField
            label="Mot de passe"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />

          {error ? <InlineBanner message={error} tone="error" /> : null}

          <Pressable onPress={() => void handleSubmit()} style={[styles.submitButton, { backgroundColor: accent }]} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <Text style={styles.submitLabel}>{mode === 'login' ? 'Se connecter' : 'Creer le compte'}</Text>
            )}
          </Pressable>

          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            {mode === 'login'
              ? 'Retrouve tes recos, tes playlists et tes messages.'
              : 'Ton onboarding cinema demarrera juste apres la creation du compte.'}
          </Text>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 28,
  },
  heroCard: {
    gap: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  brandBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  brandBadgeLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  segmentButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentLabel: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
  },
  formCard: {
    gap: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 18,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 15,
  },
  submitLabel: {
    color: '#09090b',
    fontSize: 15,
    fontWeight: '800',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
