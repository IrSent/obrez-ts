/**
 * App version — major.minor.patch.build
 * The build number is injected at build time from git (see build.ts).
 * If no build number was injected, falls back to "0".
 */
declare const __BUILD_NUM__: string;

const BASE_VERSION = '1.0.0';
const BUILD_NUM = __BUILD_NUM__ ?? '0';

export const APP_VERSION = `${BASE_VERSION}.${BUILD_NUM}`;
