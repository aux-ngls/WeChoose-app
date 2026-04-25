import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import AppLoader from '../components/AppLoader';
import { useAuth } from '../auth/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import ConversationScreen from '../screens/ConversationScreen';
import CreateReviewScreen from '../screens/CreateReviewScreen';
import MovieDetailsScreen from '../screens/MovieDetailsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import PlaylistDetailsScreen from '../screens/PlaylistDetailsScreen';
import ShareMovieScreen from '../screens/ShareMovieScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import MainTabs from './MainTabs';
import { flushPendingNotificationNavigation, navigateFromNotificationData, navigationRef } from './rootNavigation';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#09090b',
    card: '#09090b',
    text: '#ffffff',
    primary: '#38bdf8',
    border: 'rgba(255,255,255,0.08)',
  },
};

export default function AppNavigator() {
  const { isBootstrapping, session } = useAuth();

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
    return <AppLoader label="Ouverture de Qulte..." />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} onReady={flushPendingNotificationNavigation}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : !session.hasCompletedOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="MovieDetails" component={MovieDetailsScreen} />
            <Stack.Screen name="PlaylistDetails" component={PlaylistDetailsScreen} />
            <Stack.Screen name="ShareMovie" component={ShareMovieScreen} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} />
            <Stack.Screen name="CreateReview" component={CreateReviewScreen} />
            <Stack.Screen name="Conversation" component={ConversationScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
