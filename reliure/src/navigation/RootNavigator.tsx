import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import AppLoader from '../components/AppLoader';
import BookDetailsScreen from '../screens/BookDetailsScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import LibraryScreen from '../screens/LibraryScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SearchScreen from '../screens/SearchScreen';
import { useLibrary } from '../state/LibraryContext';
import { theme } from '../theme';
import type { MainTabParamList, RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const icons: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Discover: 'sparkles-outline',
  Search: 'search-outline',
  Library: 'library-outline',
  Profile: 'person-circle-outline',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.accentText,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ focused }) => {
          const baseName = icons[route.name];
          const focusedName = baseName.replace('-outline', '') as keyof typeof Ionicons.glyphMap;
          return (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons name={focused ? focusedName : baseName} size={21} color={focused ? theme.colors.accentText : theme.colors.textMuted} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ title: 'Decouvrir' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Recherche' }} />
      <Tab.Screen name="Library" component={LibraryScreen} options={{ title: 'Bibliotheque' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { hydrated, profile } = useLibrary();

  if (!hydrated) {
    return <AppLoader />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!profile.hasCompletedOnboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: 'fade' }} />
          <Stack.Screen name="BookDetails" component={BookDetailsScreen} options={{ animation: 'slide_from_right', gestureEnabled: true }} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 75,
    paddingTop: 8,
    paddingBottom: 14,
    borderTopWidth: 0,
    backgroundColor: '#0b0f0d',
    elevation: 0,
    shadowOpacity: 0,
  },
  iconWrap: {
    width: 48,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  iconWrapActive: {
    backgroundColor: theme.colors.accent,
  },
});
