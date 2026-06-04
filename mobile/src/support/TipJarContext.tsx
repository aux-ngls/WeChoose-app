import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Alert } from 'react-native';

type TipJarContextValue = {
  openTipJar: () => void;
};

const TipJarContext = createContext<TipJarContextValue | undefined>(undefined);

function getExpoGoMessage() {
  return "Les dons in-app ont besoin d'une build native iOS ou Android. Expo Go ne peut pas tester les achats intégrés.";
}

export function TipJarProvider({ children }: { children: ReactNode }) {
  const openTipJar = useCallback(() => {
    const message = Constants.executionEnvironment === 'storeClient'
      ? getExpoGoMessage()
      : 'Le soutien par don arrive bientôt sur les builds iPhone. On le remettra dès que l’intégration native iOS sera stable.';
    Alert.alert('Soutien indisponible pour le moment', message);
  }, []);

  const contextValue = useMemo<TipJarContextValue>(() => ({ openTipJar }), [openTipJar]);

  return (
    <TipJarContext.Provider value={contextValue}>
      {children}
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
