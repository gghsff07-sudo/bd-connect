module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/__tests__'],
  setupFilesAfterEnv: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@shopify/flash-list|date-fns|@notifee|react-native-firebase|@react-native-firebase)',
  ],
};
