/**
 * App version — major.minor.patch.build
 * Both BASE_VERSION and BUILD_NUM are injected at build time from package.json and git.
 */
declare const __BASE_VERSION__: string;
declare const __BUILD_NUM__: string;

const BASE_VERSION = __BASE_VERSION__ ?? '0.0.0';
const BUILD_NUM = __BUILD_NUM__ ?? '0';

export const APP_VERSION = `${BASE_VERSION}.${BUILD_NUM}`;
