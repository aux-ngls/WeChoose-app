import { requireOptionalNativeModule } from 'expo';

type QulteHapticsModule = {
  playMovieSentAsync: () => Promise<void>;
};

export default requireOptionalNativeModule<QulteHapticsModule>('QulteHaptics');
