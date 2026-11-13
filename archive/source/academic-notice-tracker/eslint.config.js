// ESLint flat config. `eslint-config-expo/flat` extends eslint-config-prettier,
// so formatting stays owned by Prettier and lint stays focused on correctness.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      '.expo/**',
      'coverage/**',
      'expo-env.d.ts',
    ],
  },
  {
    // Jest setup + config files run inside the Jest sandbox.
    files: ['jest.setup.js', 'jest.config.js', 'babel.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
      },
    },
  },
  {
    rules: {
      'react/jsx-key': 'error',
    },
  },
];
