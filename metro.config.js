const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      // Resolve React Native 0.87 internal feature flags export gap from @react-native/virtualized-lists
      if (moduleName === 'react-native/src/private/featureflags/ReactNativeFeatureFlags') {
        return {
          filePath: path.resolve(
            __dirname,
            'node_modules/react-native/src/private/featureflags/ReactNativeFeatureFlags.js'
          ),
          type: 'sourceFile',
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
