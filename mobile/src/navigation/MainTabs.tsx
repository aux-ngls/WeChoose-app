import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
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

interface AnimatedTabIconProps {
  focused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  activeColor: string;
  inactiveColor: string;
  activeBackground: string;
}

function AnimatedTabIcon({
  focused,
  iconName,
  activeColor,
  inactiveColor,
  activeBackground,
}: AnimatedTabIconProps) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      friction: 7,
      tension: 135,
      useNativeDriver: true,
    }).start();
  }, [focused, progress]);

  return (
    <Animated.View
      style={[
        styles.tabIconWrap,
        focused && { backgroundColor: activeBackground },
        {
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -3],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.08],
              }),
            },
          ],
        },
      ]}
    >
      <Ionicons
        name={iconName}
        size={21}
        color={focused ? activeColor : inactiveColor}
      />
    </Animated.View>
  );
}

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
        animation: 'shift',
        transitionSpec: {
          animation: 'timing',
          config: {
            duration: 230,
            easing: Easing.out(Easing.cubic),
          },
        },
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            opacity: current.progress.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [0.72, 1, 0.72],
            }),
            transform: [
              {
                translateX: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-22, 0, 22],
                }),
              },
              {
                scale: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [0.985, 1, 0.985],
                }),
              },
            ],
          },
        }),
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
            <AnimatedTabIcon
              focused={focused}
              iconName={iconName}
              activeColor={theme.colors.accentText}
              inactiveColor={theme.colors.textMuted}
              activeBackground={theme.colors.accent}
            />
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
