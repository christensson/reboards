import type {AppLocation, HostAPI} from '../../../@types/globals';
import {resolveBaseUrl} from './host-url';

type LocationListener = (location: AppLocation) => void;

const locationListeners = new Set<LocationListener>();

/**
 * Single host registration for the widget. Registration must happen once at
 * module scope, before any React rendering, so every module shares this instance.
 */
export const host: HostAPI = (await YTApp.register({
  onAppLocationChange: (location: AppLocation) => {
    locationListeners.forEach(listener => listener(location));
  }
})) as HostAPI;

export const onAppLocationChange = (listener: LocationListener): (() => void) => {
  locationListeners.add(listener);
  return () => locationListeners.delete(listener);
};

export const currentUserLogin = (): string => YTApp.me?.login ?? '';

export const youtrackBaseUrl = (): string =>
  resolveBaseUrl(window.location.href, document.referrer, window.location.origin);
