import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AppScreen from '../components/AppScreen';
import FormField from '../components/FormField';
import InlineBanner from '../components/InlineBanner';
import QulteMark from '../components/QulteMark';
import ScreenHeader from '../components/ScreenHeader';
import { ApiError, confirmPasswordReset, requestPasswordReset } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const { theme } = useTheme();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetFlow, setShowResetFlow] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetFeedback, setResetFeedback] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const accent = mode === 'login' ? theme.colors.secondaryAccent : theme.colors.accent;
  const accentText = mode === 'login' ? theme.colors.secondaryAccentText : theme.colors.accentText;

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
        await signUp(normalizedUsername, normalizedPassword, email.trim());
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

  const handleRequestReset = async () => {
    const normalizedIdentifier = resetIdentifier.trim();
    if (!normalizedIdentifier) {
      setError('Renseigne ton nom d’utilisateur ou ton e-mail.');
      return;
    }

    setError('');
    setResetFeedback('');
    setResetLoading(true);
    try {
      await requestPasswordReset(normalizedIdentifier);
      setResetStep('confirm');
      setResetFeedback("Si un compte a un e-mail de récupération, un code vient d'être envoyé.");
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Impossible d'envoyer le code pour le moment.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    const normalizedIdentifier = resetIdentifier.trim();
    const normalizedCode = resetCode.trim();
    const normalizedPassword = resetPassword.trim();
    if (!normalizedIdentifier || !normalizedCode || !normalizedPassword) {
      setError('Merci de remplir tous les champs de réinitialisation.');
      return;
    }

    setError('');
    setResetFeedback('');
    setResetLoading(true);
    try {
      await confirmPasswordReset(normalizedIdentifier, normalizedCode, normalizedPassword);
      setShowResetFlow(false);
      setResetStep('request');
      setResetCode('');
      setResetPassword('');
      setPassword(normalizedPassword);
      setResetFeedback('');
      setError('');
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Impossible de mettre à jour le mot de passe.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <AppScreen contentStyle={styles.content}>
      <View style={styles.heroCard}>
        <View style={styles.brandRow}>
          <QulteMark size={54} />
          <Text style={[styles.brand, { color: theme.colors.text }]}>Qulte</Text>
        </View>

        <ScreenHeader
          icon={mode === 'login' ? 'log-in' : 'person-add'}
          accent={mode === 'login' ? 'blue' : 'pink'}
          title={mode === 'login' ? 'Connexion' : 'Créer un compte'}
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
                <Text style={[styles.segmentLabel, { color: theme.colors.textSoft }, isActive && { color: accentText }]}>{entry.label}</Text>
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
          {mode === 'signup' ? (
            <FormField
              label="E-mail de récupération"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="toi@exemple.com"
            />
          ) : null}

          {error ? <InlineBanner message={error} tone="error" /> : null}
          {resetFeedback ? <InlineBanner message={resetFeedback} tone="success" /> : null}

          <Pressable onPress={() => void handleSubmit()} style={[styles.submitButton, { backgroundColor: accent }]} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={accentText} />
            ) : (
              <Text style={[styles.submitLabel, { color: accentText }]}>{mode === 'login' ? 'Se connecter' : 'Créer le compte'}</Text>
            )}
          </Pressable>

          {mode === 'login' ? (
            <View style={styles.resetSection}>
              <Pressable
                onPress={() => {
                  setShowResetFlow((current) => !current);
                  setResetStep('request');
                  setResetFeedback('');
                  setError('');
                }}
              >
                <Text style={[styles.resetToggle, { color: theme.colors.secondaryAccent }]}>
                  {showResetFlow ? 'Fermer la récupération' : 'Mot de passe oublié ?'}
                </Text>
              </Pressable>

              {showResetFlow ? (
                <View style={[styles.resetCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong }]}>
                  <FormField
                    label="Nom d'utilisateur ou e-mail"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    value={resetIdentifier}
                    onChangeText={setResetIdentifier}
                    placeholder="@isa.belaaa ou toi@exemple.com"
                  />
                  {resetStep === 'confirm' ? (
                    <>
                      <FormField
                        label="Code reçu"
                        keyboardType="number-pad"
                        value={resetCode}
                        onChangeText={setResetCode}
                        placeholder="123456"
                      />
                      <FormField
                        label="Nouveau mot de passe"
                        secureTextEntry
                        value={resetPassword}
                        onChangeText={setResetPassword}
                        placeholder="••••••••"
                      />
                    </>
                  ) : null}

                  <Pressable
                    onPress={() => void (resetStep === 'request' ? handleRequestReset() : handleConfirmReset())}
                    style={[styles.secondaryButton, { backgroundColor: theme.colors.secondaryAccent }]}
                    disabled={resetLoading}
                  >
                    {resetLoading ? (
                      <ActivityIndicator color={theme.colors.secondaryAccentText} />
                    ) : (
                      <Text style={[styles.secondaryButtonLabel, { color: theme.colors.secondaryAccentText }]}>
                        {resetStep === 'request' ? 'Recevoir un code' : 'Mettre à jour le mot de passe'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            {mode === 'login'
              ? 'Recos, playlists, messages.'
              : 'Crée ton univers ciné et ajoute un e-mail de récupération.'}
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
    gap: 12,
  },
  brand: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
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
  resetSection: {
    gap: 12,
  },
  resetToggle: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
  resetCard: {
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 13,
  },
  secondaryButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
