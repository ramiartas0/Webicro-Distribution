export type MobileProjectType =
  | 'flutter'
  | 'react-native'
  | 'expo'
  | 'android-native'
  | 'ios-native'
  | 'kmp'
  | 'capacitor'
  | 'unknown';

export interface DiscoveredProjectMeta {
  id: string;
  name: string;
  path: string;
  type: MobileProjectType;
  typeLabel: string;
  package?: string;
  iosBundleId?: string;
  version: string;
  buildNumber: number;
  hasPubspec: boolean;
  appIcon?: string | null;
  supportedPlatforms: ('android' | 'ios')[];
  isDirectlySupported: boolean;
}
