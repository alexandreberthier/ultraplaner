import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ultraplaner.app',
  appName: 'UltraPlaner',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
