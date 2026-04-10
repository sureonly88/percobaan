import { PaymentProviderAdapter, MultiPaymentProvider } from "@/lib/multipay/types";
import { PdamProviderAdapter } from "@/lib/multipay/providers/pdam";
import { LunasinProviderAdapter } from "@/lib/multipay/providers/lunasin";

const adapters: Record<MultiPaymentProvider, PaymentProviderAdapter> = {
  PDAM: new PdamProviderAdapter(),
  LUNASIN: new LunasinProviderAdapter(),
};

export function getProviderAdapter(provider: MultiPaymentProvider): PaymentProviderAdapter {
  return adapters[provider];
}