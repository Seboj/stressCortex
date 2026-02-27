/**
 * Singleton typed EventEmitter bus.
 * All inter-component communication flows through this bus.
 * Type-safe: event names and argument types are enforced at compile time.
 */

import { EventEmitter } from 'events';
import type { EventMap } from '../types/events.js';

/**
 * Type-safe wrapper around Node.js EventEmitter.
 * Provides compile-time checking for event names and argument types.
 */
class TypedEventEmitter<T> {
  private emitter = new EventEmitter();

  constructor() {
    // Prevent MaxListenersExceededWarning in later phases
    // when multiple subscribers (metrics, SSE bridge, logger) attach
    this.emitter.setMaxListeners(50);
  }

  emit<K extends string & keyof T>(
    event: K,
    ...args: T[K] extends unknown[] ? T[K] : never
  ): boolean {
    return this.emitter.emit(event, ...args);
  }

  on<K extends string & keyof T>(
    event: K,
    listener: (...args: T[K] extends unknown[] ? T[K] : never) => void,
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends string & keyof T>(
    event: K,
    listener: (...args: T[K] extends unknown[] ? T[K] : never) => void,
  ): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends string & keyof T>(
    event: K,
    listener: (...args: T[K] extends unknown[] ? T[K] : never) => void,
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  removeAllListeners<K extends string & keyof T>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  listenerCount<K extends string & keyof T>(event: K): number {
    return this.emitter.listenerCount(event);
  }
}

/** Singleton event bus instance — import this everywhere */
export const eventBus = new TypedEventEmitter<EventMap>();
