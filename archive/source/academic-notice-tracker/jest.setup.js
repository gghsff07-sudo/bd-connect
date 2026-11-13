// Jest setup: mock native modules that are not available in the test environment.
jest.mock('@react-native-firebase/app', () => ({}), { virtual: true });
jest.mock('@react-native-firebase/auth', () => ({}), { virtual: true });
jest.mock('@react-native-firebase/firestore', () => ({}), { virtual: true });
jest.mock('@react-native-firebase/messaging', () => ({}), { virtual: true });
jest.mock('@notifee/react-native', () => require('@notifee/react-native/jest-mock'), {
  virtual: true,
});
jest.mock('@react-native-google-signin/google-signin', () => ({}), { virtual: true });
jest.mock('@react-native-async-storage/async-storage', () => ({}), { virtual: true });
jest.mock('@react-native-community/netinfo', () => ({}), { virtual: true });
