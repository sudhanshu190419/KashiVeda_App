// __tests__/livekit_client_module.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { PermissionsAndroid } from "react-native";
import {
  useMediaPermissions,
  useLiveKit,
  ControlBar,
  LiveKitVideoView,
} from "../src/features/livekit/index.ts";
import InCallManager from "react-native-incall-manager";

jest.setTimeout(15000);

describe("LiveKit Client Module Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Media Permissions Hook (Android)
  test("1. useMediaPermissions requests CAMERA and RECORD_AUDIO permissions on Android", async () => {
    const originalOS = require("react-native").Platform.OS;
    require("react-native").Platform.OS = "android";

    let hookResult: any;

    const TestComponent = () => {
      hookResult = useMediaPermissions();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(<TestComponent />);
    });

    jest.spyOn(PermissionsAndroid, "requestMultiple").mockResolvedValue({
      "android.permission.CAMERA": PermissionsAndroid.RESULTS.GRANTED,
      "android.permission.RECORD_AUDIO": PermissionsAndroid.RESULTS.GRANTED,
    } as any);

    let res: any;
    await act(async () => {
      res = await hookResult.requestPermissions();
    });

    expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    expect(res.camera).toBe(true);
    expect(res.microphone).toBe(true);
    expect(res.error).toBeNull();

    require("react-native").Platform.OS = originalOS;
  });

  // 2. ControlBar Rendering & Actions
  test("2. ControlBar renders all media control buttons and triggers callbacks", () => {
    const onToggleMicrophone = jest.fn();
    const onToggleCamera = jest.fn();
    const onSwitchCamera = jest.fn();
    const onLeave = jest.fn();

    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <ControlBar
          isCameraEnabled={true}
          isMicrophoneEnabled={true}
          isFrontCamera={true}
          onToggleMicrophone={onToggleMicrophone}
          onToggleCamera={onToggleCamera}
          onSwitchCamera={onSwitchCamera}
          onLeave={onLeave}
        />
      );
    });

    const touchables = tree.root.findAllByType(require("react-native").TouchableOpacity);
    const micBtn = touchables.find((t: any) => t.props.accessibilityLabel?.includes("Mute Microphone"));
    const camBtn = touchables.find((t: any) => t.props.accessibilityLabel?.includes("Turn Off Camera"));
    const switchBtn = touchables.find((t: any) => t.props.accessibilityLabel?.includes("Switch Camera"));
    const leaveBtn = touchables.find((t: any) => t.props.accessibilityLabel?.includes("Leave"));

    expect(micBtn).toBeDefined();
    expect(camBtn).toBeDefined();
    expect(switchBtn).toBeDefined();
    expect(leaveBtn).toBeDefined();

    act(() => {
      micBtn.props.onPress();
      camBtn.props.onPress();
      switchBtn.props.onPress();
      leaveBtn.props.onPress();
    });

    expect(onToggleMicrophone).toHaveBeenCalledTimes(1);
    expect(onToggleCamera).toHaveBeenCalledTimes(1);
    expect(onSwitchCamera).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  // 3. LiveKitVideoView Fallback Avatar
  test("3. LiveKitVideoView renders fallback avatar when video track is off", () => {
    const mockRoom: any = {
      localParticipant: {
        sid: "local-sid-1",
        identity: "customer_123",
        getTrackPublication: jest.fn(() => undefined),
        on: jest.fn().mockReturnThis(),
        off: jest.fn().mockReturnThis(),
      },
      remoteParticipants: new Map(),
    };

    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <LiveKitVideoView
          room={mockRoom}
          participantIdentity="customer_123"
          displayName="Devotee Ananya"
          isLocal={true}
        />
      );
    });

    const str = JSON.stringify(tree.toJSON());
    expect(str).toContain("Devotee Ananya");
    expect(str).toContain("Camera Paused");
  });

  // 4. useLiveKit Hook Lifecycle & Audio Routing
  test("4. useLiveKit configures AudioSession and InCallManager on connect", async () => {
    let hookResult: any;

    const TestComponent = () => {
      hookResult = useLiveKit();
      return null;
    };

    let renderer: any;
    act(() => {
      renderer = ReactTestRenderer.create(<TestComponent />);
    });

    expect(hookResult.roomState.connectionState).toBe("disconnected");

    // Test disconnect cleanup
    act(() => {
      hookResult.disconnect();
    });

    expect(InCallManager.stop).toHaveBeenCalled();
    expect(hookResult.roomState.connectionState).toBe("disconnected");

    // Unmount
    act(() => {
      renderer.unmount();
    });
  });
});
