import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.latoulicious.yoin',
  appName: 'Yoin',
  webDir: 'dist',
  backgroundColor: '#F5F0E3',
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
    SplashScreen: {
      backgroundColor: '#F5F0E3',
      launchShowDuration: 200,
      launchAutoHide: true,
      showSpinner: false,
    },
  },
}

export default config
