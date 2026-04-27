import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo } from 'react';
import AppLoader from '../components/AppLoader';
import { useAuth } from '../auth/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import ConversationScreen from '../screens/ConversationScreen';
import CreateReviewScreen from '../screens/CreateReviewScreen';
import MovieDetailsScreen from '../screens/MovieDetailsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import PlaylistDetailsScreen from '../screens/PlaylistDetailsScreen';
import ShareMovieScreen from '../screens/ShareMovieScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TutorialScreen from '../screens/TutorialScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import MainTabs from './MainTabs';
import { flushPendingNotificationNavigation, navigateFromNotificationData, navigationRef } from './rootNavigation';
import type { RootStackParamList } from './types';
import { useTheme } from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isBootstrapping, session } = useAuth();
  const { theme } = useTheme();

  const navigationTheme = useMemo(() => {
    const baseTheme = theme.isDark ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      dark: theme.isDark,
      colors: {
        ...baseTheme.colors,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.text,
        primary: theme.colors.secondaryAccent,
        border: theme.colors.border,
      },
    };
  }, [theme]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromNotificationData(response.notification.request.content.data);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        navigateFromNotificationData(response.notification.request.content.data);
      }
    });

    return () => subscription.remove();
  }, []);

  if (isBootstrapping) {
    return <AppLoader label="Qulte" />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} onReady={flushPendingNotificationNavigation}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : !session.hasCompletedOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : !session.hasCompletedTutorial ? (
          <Stack.Screen name="Tutorial" component={TutorialScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="MovieDetails" component={MovieDetailsScreen} />
            <Stack.Screen name="PlaylistDetails" component={PlaylistDetailsScreen} />
            <Stack.Screen name="ShareMovie" component={ShareMovieScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} />
            <Stack.Screen name="CreateReview" component={CreateReviewScreen} />
            <Stack.Screen name="Conversation" component={ConversationScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
