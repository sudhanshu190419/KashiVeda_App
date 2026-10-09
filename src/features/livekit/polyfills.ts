/**
 * LiveKit React Native Polyfills & Global Registration
 *
 * Ensures required browser/WebRTC globals (DOMException, WebRTC, Crypto)
 * are initialized in Hermes/React Native before livekit-client evaluates.
 */

import 'react-native-get-random-values';

// Polyfill DOMException if not defined in Hermes JavaScript runtime
if (typeof (globalThis as any).DOMException === 'undefined') {
  class DOMExceptionPolyfill extends Error {
    constructor(message?: string, name: string = 'Error') {
      super(message);
      this.name = name;
    }
  }
  (globalThis as any).DOMException = DOMExceptionPolyfill;
  const g = (globalThis as any).global;
  if (g && typeof g === 'object') {
    g.DOMException = DOMExceptionPolyfill;
  }
}

import { registerGlobals } from '@livekit/react-native';

// Register LiveKit & WebRTC globals
registerGlobals();
