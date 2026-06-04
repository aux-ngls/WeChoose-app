import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import TipJarSheet from './TipJarSheet';

type TipJarContextValue = {
  openTipJar: () => void;
};

const TipJarContext = createContext<TipJarContextValue | undefined>(undefined);

function getExpoGoMessage() {
  return "Les dons in-app ont besoin d'une build native iOS ou Android. Expo Go ne peut pas tester les achats intégrés.";
}

export function TipJarProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  const openTipJar = useCallback(() => {
    if (Constants.executionEnvironment === 'storeClient') {
      Alert.alert('Dons indisponibles ici', getExpoGoMessage());
      return;
    }
    setVisible(true);
  }, []);

  const closeTipJar = useCallback(() => {
    setVisible(false);
  }, []);

  const contextValue = useMemo<TipJarContextValue>(() => ({ openTipJar }), [openTipJar]);

  return (
    <TipJarContext.Provider value={contextValue}>
      {children}
      {visible ? <TipJarSheet onClose={closeTipJar} /> : null}
    </TipJarContext.Provider>
  );
}

export function useTipJar() {
  const context = useContext(TipJarContext);
  if (!context) {
    throw new Error('useTipJar doit être utilisé dans TipJarProvider');
  }
  return context;
}
