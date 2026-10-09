/**
 * useMediaPermissions
 *
 * Hook for requesting and checking camera and microphone permissions
 * on Android. On iOS, permissions are requested at the time of first
 * camera/mic access by LiveKit.
 *
 * @module features/livekit/hooks/useMediaPermissions
 */

import { useCallback, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import type { MediaPermissionResult } from '../types/index.ts';

export function useMediaPermissions() {
  const [permissions, setPermissions] = useState<MediaPermissionResult>({
    camera: false,
    microphone: false,
    error: null,
  });

  /**
   * Checks whether camera and microphone permissions are currently granted.
   * Does NOT prompt the user.
   */
  const checkPermissions = useCallback(async (): Promise<MediaPermissionResult> => {
    if (Platform.OS !== 'android') {
      const result: MediaPermissionResult = {
        camera: true,
        microphone: true,
        error: null,
      };
      setPermissions(result);
      return result;
    }

    try {
      const cameraGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      const micGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );

      const result: MediaPermissionResult = {
        camera: cameraGranted,
        microphone: micGranted,
        error:
          !cameraGranted || !micGranted
            ? 'Camera and microphone permissions are required for the Live Puja Sanctum.'
            : null,
      };

      setPermissions(result);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to check permissions.';
      const result: MediaPermissionResult = {
        camera: false,
        microphone: false,
        error: message,
      };
      setPermissions(result);
      return result;
    }
  }, []);

  /**
   * Requests both CAMERA and RECORD_AUDIO permissions on Android.
   */
  const requestPermissions = useCallback(async (): Promise<MediaPermissionResult> => {
    if (Platform.OS !== 'android') {
      const result: MediaPermissionResult = {
        camera: true,
        microphone: true,
        error: null,
      };
      setPermissions(result);
      return result;
    }

    try {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);

      const cameraGranted =
        grants[PermissionsAndroid.PERMISSIONS.CAMERA] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const micGranted =
        grants[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] ===
        PermissionsAndroid.RESULTS.GRANTED;

      let error: string | null = null;
      if (!cameraGranted && !micGranted) {
        error = 'Camera and microphone permissions were denied.';
      } else if (!cameraGranted) {
        error = 'Camera permission was denied.';
      } else if (!micGranted) {
        error = 'Microphone permission was denied.';
      }

      const result: MediaPermissionResult = {
        camera: cameraGranted,
        microphone: micGranted,
        error,
      };

      setPermissions(result);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to request permissions.';
      const result: MediaPermissionResult = {
        camera: false,
        microphone: false,
        error: message,
      };
      setPermissions(result);
      return result;
    }
  }, []);

  return {
    permissions,
    requestPermissions,
    checkPermissions,
  } as const;
}
