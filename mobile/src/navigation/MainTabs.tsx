import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SearchScreen from '../screens/SearchScreen';
import SocialScreen from '../screens/SocialScreen';
import type { MainTabParamList } from './types';
import { useAuth } from '../auth/AuthContext';
import { ApiError, fetchUnreadDirectMessagesCount } from '../api/client';
import { useTheme } from '../theme/ThemeContext';

const Tab = createBottomTabNavigator<MainTabParamList>();

const icons: Record<keyof MainTabParamList, string> = {
  Home: 'home-outline',
  Search: 'search-outline',
  Social: 'people-outline',
  Messages: 'chatbubble-ellipses-outline',
  Profile: 'person-circle-outline',
};

export default function MainTabs() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    const refresh = async () => {
      try {
        const payload = await fetchUnreadDirectMessagesCount(session.token);
        if (active) {
          setUnreadCount(payload.unread_count ?? 0);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await signOut();
        }
      }
    };

    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 12000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session, signOut]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'none',
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.isDark ? 'rgba(13,7,17,0.96)' : 'rgba(255,248,239,0.97)',
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 74,
          paddingTop: 8,
          paddingBottom: 13,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: theme.isDark ? 0.24 : 0.08,
          shadowRadius: 18,
        },
        tabBarIcon: ({ focused }) => {
          const iconName = (focused ? icons[route.name].replace('-outline', '') : icons[route.name]) as keyof typeof Ionicons.glyphMap;
          return (
            <View
              style={[
                styles.tabIconWrap,
                focused && { backgroundColor: theme.colors.accent },
              ]}
            >
              <Ionicons
                name={iconName}
                size={21}
                color={focused ? theme.colors.accentText : theme.colors.textMuted}
              />
            </View>
          );
        },
        tabBarBadge:
          route.name === 'Messages' && unreadCount > 0
            ? unreadCount > 99
              ? '99+'
              : unreadCount
            : undefined,
        tabBarBadgeStyle:
          route.name === 'Messages'
            ? {
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: 10,
                fontWeight: '800',
              }
            : undefined,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Recherche' }} />
      <Tab.Screen name="Social" component={SocialScreen} options={{ title: 'Social' }} />
      <Tab.Screen name="Messages" component={MessagesScreen} options={{ title: 'Messages' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconWrap: {
    width: 46,
    height: 40,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
