import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import HomeScreen from '../screens/HomeScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SearchScreen from '../screens/SearchScreen';
import SocialScreen from '../screens/SocialScreen';
import type { MainTabParamList } from './types';
import { useAuth } from '../auth/AuthContext';
import { ApiError, fetchUnreadDirectMessagesCount } from '../api/client';

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
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#7c8aa5',
        tabBarStyle: {
          backgroundColor: '#09090bf4',
          borderTopColor: 'rgba(255,255,255,0.08)',
          height: 78,
          paddingTop: 10,
          paddingBottom: 12,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={
              (focused
                ? icons[route.name].replace('-outline', '')
                : icons[route.name]) as keyof typeof Ionicons.glyphMap
            }
            size={size}
            color={color}
          />
        ),
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
