import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

function CustomTabBar({ state, navigation, unreadCount }: BottomTabBarProps & { unreadCount: number }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <View pointerEvents="box-none" style={[styles.customTabBar, { paddingBottom: bottomInset }]}>
      <View style={styles.tabRow}>
        {state.routes.map((route, index) => {
          const routeName = route.name as keyof MainTabParamList;
          const focused = state.index === index;
          const iconName = (focused ? icons[routeName].replace('-outline', '') : icons[routeName]) as keyof typeof Ionicons.glyphMap;
          const badgeValue = routeName === 'Messages' && unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : '';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : undefined}
              onPress={onPress}
              style={styles.tabButton}
            >
              <View
                style={[
                  styles.tabIconWrap,
                  {
                    backgroundColor: focused ? theme.colors.accent : theme.rgba.card,
                  },
                ]}
              >
                <Ionicons
                  name={iconName}
                  size={21}
                  color={focused ? theme.colors.accentText : theme.colors.textMuted}
                />
                {badgeValue ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeLabel}>{badgeValue}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
      tabBar={(props) => <CustomTabBar {...props} unreadCount={unreadCount} />}
      screenOptions={{
        headerShown: false,
        animation: 'none',
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
      }}
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
  customTabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
  },
  tabRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrap: {
    width: 46,
    height: 40,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 17,
    height: 17,
    borderRadius: 999,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeLabel: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
});
