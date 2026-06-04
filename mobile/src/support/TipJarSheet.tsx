import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIAP, type Product, type Purchase } from 'expo-iap';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

type TipProductDefinition = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TIP_PRODUCT_DEFINITIONS: TipProductDefinition[] = [
  {
    id: 'dev.dury.qulte.tip.small',
    title: 'Petit soutien',
    subtitle: 'Un petit coup de pouce pour Qulte.',
    icon: 'sparkles-outline',
  },
  {
    id: 'dev.dury.qulte.tip.medium',
    title: 'Grand merci',
    subtitle: "Tu aides vraiment l'app à avancer.",
    icon: 'heart-outline',
  },
  {
    id: 'dev.dury.qulte.tip.large',
    title: 'Coup de projecteur',
    subtitle: 'Le soutien le plus généreux.',
    icon: 'flame-outline',
  },
];

const configuredTipProductIds = (process.env.EXPO_PUBLIC_TIP_JAR_PRODUCT_IDS ?? '')
  .split(',')
  .map((value: string) => value.trim())
  .filter(Boolean);

const TIP_PRODUCT_IDS = configuredTipProductIds.length > 0
  ? configuredTipProductIds
  : TIP_PRODUCT_DEFINITIONS.map((product) => product.id);

function isUserCancelled(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: string }).code === 'string' &&
      (error as { code: string }).code === 'user-cancelled',
  );
}

function getTipJarErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Impossible d'ouvrir le soutien pour le moment.";
}

function sortProducts(products: Product[]) {
  const order = new Map<string, number>(TIP_PRODUCT_IDS.map((id: string, index: number) => [id, index]));
  return [...products].sort((left, right) => {
    const leftOrder = order.get(left.id) ?? 999;
    const rightOrder = order.get(right.id) ?? 999;
    return leftOrder - rightOrder;
  });
}

export default function TipJarSheet({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const { theme } = useTheme();
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const lastHandledPurchaseKeyRef = useRef<string | null>(null);
  const finishTransactionRef = useRef<((args: { purchase: Purchase; isConsumable?: boolean }) => Promise<void>) | null>(null);

  const handlePurchaseSuccess = useCallback(
    async (purchase: Purchase) => {
      if (!TIP_PRODUCT_IDS.includes(purchase.productId)) {
        return;
      }

      const purchaseKey = purchase.transactionId ?? `${purchase.productId}:${purchase.transactionDate}`;
      if (lastHandledPurchaseKeyRef.current === purchaseKey) {
        return;
      }
      lastHandledPurchaseKeyRef.current = purchaseKey;

      try {
        if (!finishTransactionRef.current) {
          throw new Error('Paiement indisponible.');
        }
        await finishTransactionRef.current({ purchase, isConsumable: true });
        setPurchasingProductId(null);
        setStatusMessage('');
        onClose();
        Alert.alert('Merci beaucoup', 'Ton soutien aide directement Qulte à continuer.');
      } catch {
        setPurchasingProductId(null);
        setStatusMessage('Le don a bien été lancé, mais sa finalisation doit être réessayée.');
      }
    },
    [onClose],
  );

  const handlePurchaseError = useCallback((error: unknown) => {
    setPurchasingProductId(null);
    if (isUserCancelled(error)) {
      return;
    }
    setStatusMessage(getTipJarErrorMessage(error));
  }, []);

  const handleGeneralError = useCallback((error: Error) => {
    setLoadingProducts(false);
    setPurchasingProductId(null);
    setStatusMessage(getTipJarErrorMessage(error));
  }, []);

  const {
    connected,
    fetchProducts,
    finishTransaction,
    products,
    reconnect,
    requestPurchase,
  } = useIAP({
    onPurchaseSuccess: handlePurchaseSuccess,
    onPurchaseError: handlePurchaseError,
    onError: handleGeneralError,
  });

  finishTransactionRef.current = finishTransaction;

  const availableProducts = useMemo(
    () => sortProducts(products.filter((product) => TIP_PRODUCT_IDS.includes(product.id))),
    [products],
  );

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setStatusMessage('');
    try {
      if (!connected) {
        await reconnect();
      }
      await fetchProducts({ skus: TIP_PRODUCT_IDS, type: 'in-app' });
    } catch (error) {
      setStatusMessage(getTipJarErrorMessage(error));
    } finally {
      setLoadingProducts(false);
    }
  }, [connected, fetchProducts, reconnect]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const handleClose = useCallback(() => {
    if (purchasingProductId) {
      return;
    }
    setStatusMessage('');
    onClose();
  }, [onClose, purchasingProductId]);

  const handleBuyProduct = useCallback(
    async (product: Product) => {
      setStatusMessage('');
      setPurchasingProductId(product.id);
      try {
        await requestPurchase({
          type: 'in-app',
          request:
            Platform.OS === 'ios'
              ? { apple: { sku: product.id } }
              : { google: { skus: [product.id], obfuscatedAccountId: session?.username ?? undefined } },
        });
      } catch (error) {
        setPurchasingProductId(null);
        if (isUserCancelled(error)) {
          return;
        }
        setStatusMessage(getTipJarErrorMessage(error));
      }
    },
    [requestPurchase, session?.username],
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View
          style={[
            styles.card,
            {
              borderColor: theme.rgba.border,
              backgroundColor: theme.isDark ? '#0f172a' : '#fffdf8',
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerBody}>
              <Text style={[styles.title, { color: theme.colors.text }]}>Soutenir Qulte</Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                Les dons sont facultatifs et ne débloquent aucune fonctionnalité. Ils servent juste à aider l’app à continuer.
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={10} disabled={Boolean(purchasingProductId)}>
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

          {loadingProducts ? (
            <View style={styles.loaderBlock}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={[styles.loaderText, { color: theme.colors.textMuted }]}>Chargement des options de soutien...</Text>
            </View>
          ) : availableProducts.length > 0 ? (
            <View style={styles.productList}>
              {availableProducts.map((product) => {
                const definition = TIP_PRODUCT_DEFINITIONS.find((item) => item.id === product.id);
                const isPurchasing = purchasingProductId === product.id;
                return (
                  <Pressable
                    key={product.id}
                    style={[
                      styles.productButton,
                      {
                        borderColor: theme.rgba.border,
                        backgroundColor: theme.rgba.card,
                      },
                    ]}
                    onPress={() => void handleBuyProduct(product)}
                    disabled={Boolean(purchasingProductId)}
                  >
                    <View style={[styles.productIcon, { backgroundColor: theme.colors.accentSoft }]}>
                      <Ionicons name={definition?.icon ?? 'heart-outline'} size={18} color={theme.colors.accent} />
                    </View>
                    <View style={styles.productBody}>
                      <Text style={[styles.productTitle, { color: theme.colors.text }]}>
                        {definition?.title ?? product.displayName ?? product.title}
                      </Text>
                      <Text style={[styles.productSubtitle, { color: theme.colors.textMuted }]}>
                        {definition?.subtitle ?? product.description}
                      </Text>
                    </View>
                    <View style={styles.productPriceBlock}>
                      <Text style={[styles.productPrice, { color: theme.colors.accent }]}>{product.displayPrice}</Text>
                      {isPurchasing ? <ActivityIndicator size="small" color={theme.colors.accent} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                Aucun produit de soutien n’est disponible pour le moment. Vérifie les produits in-app dans App Store Connect puis relance une build native.
              </Text>
            </View>
          )}

          {statusMessage ? <Text style={[styles.statusMessage, { color: theme.colors.accent }]}>{statusMessage}</Text> : null}

          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={() => void loadProducts()}
            disabled={loadingProducts || Boolean(purchasingProductId)}
          >
            <Text style={[styles.secondaryButtonLabel, { color: theme.colors.text }]}>Réessayer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerBody: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  loaderBlock: {
    paddingVertical: 18,
    alignItems: 'center',
    gap: 10,
  },
  loaderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  productList: {
    gap: 10,
  },
  productButton: {
    minHeight: 78,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  productIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBody: {
    flex: 1,
    gap: 4,
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  productSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  productPriceBlock: {
    alignItems: 'flex-end',
    gap: 6,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '900',
  },
  emptyState: {
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  statusMessage: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
});
