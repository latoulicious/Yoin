import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.latoulicious.yoin',
  appName: 'Yoin',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
    SplashScreen: {
      backgroundColor: '#F5F0E3',
      launchShowDuration: 1000,
      launchAutoHide: true,
      showSpinner: false,
    },
  },
}

export default config
