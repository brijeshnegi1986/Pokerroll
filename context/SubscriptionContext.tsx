import {
  ENTITLEMENT_PRO, RC_API_KEY_ANDROID, RC_API_KEY_IOS,
} from "@/constants/subscription";
import {
  createContext, useContext, useEffect, useState, ReactNode,
} from "react";
import { Platform } from "react-native";
import Purchases, {
  CustomerInfo, LOG_LEVEL, PurchasesOffering,
} from "react-native-purchases";

interface SubscriptionState {
  isPro: boolean;
  isLoading: boolean;
  offerings: PurchasesOffering | null;
  purchase: (packageId: string) => Promise<boolean>;
  restore: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  isPro: false,
  isLoading: true,
  offerings: null,
  purchase: async () => false,
  restore: async () => false,
});

const apiKey = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
const RC_CONFIGURED = apiKey.length > 0;

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isPro, setIsPro]           = useState(false);
  const [isLoading, setIsLoading]   = useState(RC_CONFIGURED);
  const [offerings, setOfferings]   = useState<PurchasesOffering | null>(null);

  useEffect(() => {
    if (!RC_CONFIGURED) return;

    Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });

    async function init() {
      try {
        const info = await Purchases.getCustomerInfo();
        setIsPro(checkPro(info));
        const all = await Purchases.getOfferings();
        setOfferings(all.current ?? null);
      } catch {}
      finally { setIsLoading(false); }
    }
    init();

    const listener = Purchases.addCustomerInfoUpdateListener(info => {
      setIsPro(checkPro(info));
    });
    return () => listener.remove();
  }, []);

  function checkPro(info: CustomerInfo): boolean {
    return info.entitlements.active[ENTITLEMENT_PRO]?.isActive === true;
  }

  async function purchase(packageIdentifier: string): Promise<boolean> {
    if (!RC_CONFIGURED) return false;
    try {
      const all = await Purchases.getOfferings();
      const pkg = all.current?.availablePackages.find(
        p => p.product.identifier === packageIdentifier
      );
      if (!pkg) return false;
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const pro = checkPro(customerInfo);
      setIsPro(pro);
      return pro;
    } catch {
      return false;
    }
  }

  async function restore(): Promise<boolean> {
    if (!RC_CONFIGURED) return false;
    try {
      const info = await Purchases.restorePurchases();
      const pro = checkPro(info);
      setIsPro(pro);
      return pro;
    } catch {
      return false;
    }
  }

  return (
    <SubscriptionContext.Provider value={{ isPro, isLoading, offerings, purchase, restore }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
