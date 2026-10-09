jest.setTimeout(30000);

const mockStorageState = {};

const mockAsyncStorage = {
  getItem: jest.fn((key) => Promise.resolve(mockStorageState[key] ?? null)),
  setItem: jest.fn((key, value) => {
    mockStorageState[key] = String(value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    delete mockStorageState[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    Object.keys(mockStorageState).forEach((k) => delete mockStorageState[k]);
    return Promise.resolve();
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStorageState))),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  ...mockAsyncStorage,
  default: mockAsyncStorage,
}));

const mockEncryptedStorageState = {};

const mockEncryptedStorage = {
  getItem: jest.fn((key) => Promise.resolve(mockEncryptedStorageState[key] ?? null)),
  setItem: jest.fn((key, value) => {
    mockEncryptedStorageState[key] = String(value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    delete mockEncryptedStorageState[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    Object.keys(mockEncryptedStorageState).forEach((k) => delete mockEncryptedStorageState[k]);
    return Promise.resolve();
  }),
};

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  ...mockEncryptedStorage,
  default: mockEncryptedStorage,
}));

const mockGoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(() => Promise.resolve(true)),
  signIn: jest.fn(() =>
    Promise.resolve({
      type: 'success',
      data: {
        idToken: 'mock-google-id-token-xyz',
        user: { id: 'google-1', email: 'devotee@gmail.com', name: 'Devotee' },
      },
    })
  ),
  getTokens: jest.fn(() =>
    Promise.resolve({
      idToken: 'mock-google-id-token-xyz',
      accessToken: 'mock-access-token',
    })
  ),
  signOut: jest.fn(() => Promise.resolve(null)),
};

jest.mock('@react-native-google-signin/google-signin', () => ({
  __esModule: true,
  GoogleSignin: mockGoogleSignin,
  isSuccessResponse: jest.fn((res) => res?.type === 'success'),
  isCancelledResponse: jest.fn((res) => res?.type === 'cancelled'),
  isErrorWithCode: jest.fn((err) => Boolean(err && err.code)),
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
  default: mockGoogleSignin,
}));

jest.mock('react-native-razorpay', () => ({
  __esModule: true,
  default: {
    open: jest.fn(() =>
      Promise.resolve({
        razorpay_payment_id: 'pay_test_razorpay_id',
        razorpay_order_id: 'order_test_razorpay_id',
        razorpay_signature: 'sig_test_razorpay_signature',
      })
    ),
  },
}));

jest.mock('@react-native-documents/picker', () => {
  const OPERATION_CANCELED = 'OPERATION_CANCELED';
  return {
    __esModule: true,
    pick: jest.fn(() =>
      Promise.resolve([
        {
          uri: 'file:///path/to/test_kundli.pdf',
          name: 'test_kundli.pdf',
          type: 'application/pdf',
          size: 1024 * 1024,
          hasRequestedType: true,
        },
      ])
    ),
    types: {
      pdf: 'application/pdf',
      allFiles: '*/*',
    },
    errorCodes: {
      OPERATION_CANCELED,
    },
    isErrorWithCode: jest.fn(
      (err) => Boolean(err && typeof err === 'object' && 'code' in err)
    ),
  };
});

jest.mock('react-native-get-random-values', () => ({}));

jest.mock('@livekit/react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    registerGlobals: jest.fn(),
    VideoTrack: (props) => React.createElement(View, { testID: 'livekit-video-track', ...props }),
    AudioSession: {
      configureAudio: jest.fn(() => Promise.resolve()),
      startAudioSession: jest.fn(() => Promise.resolve()),
      stopAudioSession: jest.fn(() => Promise.resolve()),
    },
    AndroidAudioTypePresets: {
      communication: {},
    },
  };
});

jest.mock('react-native-incall-manager', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    setForceSpeakerphoneOn: jest.fn(),
    setKeepScreenOn: jest.fn(),
  },
}));

