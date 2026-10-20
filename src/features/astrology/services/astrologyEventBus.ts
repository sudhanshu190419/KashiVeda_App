// src/features/astrology/services/astrologyEventBus.ts
/**
 * Lightweight, strictly typed event bus for synchronizing
 * customer subscription status, payment confirmations, and daily
 * Vedic astrology insight entitlement across decoupled components and hooks.
 */

export type AstrologyEventType =
  | "SUBSCRIPTION_PURCHASED"
  | "SUBSCRIPTION_EXPIRED"
  | "SUBSCRIPTION_CHANGED"
  | "ENTITLEMENT_INVALIDATED";

export interface AstrologyEventPayload {
  userId?: string | null;
  isActive?: boolean;
  subscriptionId?: string;
  source?: string;
}

type Listener = (payload?: AstrologyEventPayload) => void;

class AstrologyEventBus {
  private listeners: Map<AstrologyEventType, Set<Listener>> = new Map();

  /**
   * Subscribes a listener to an event type.
   * Returns an unsubscription cleanup function.
   */
  subscribe(event: AstrologyEventType, listener: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  /**
   * Synchronously dispatches an event to all registered listeners.
   */
  emit(event: AstrologyEventType, payload?: AstrologyEventPayload): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (err) {
          console.error(`Error in astrology event listener for ${event}:`, err);
        }
      });
    }
  }

  /**
   * Clears all registered listeners. Useful for test teardown.
   */
  clear(): void {
    this.listeners.clear();
  }
}

export const astrologyEventBus = new AstrologyEventBus();
