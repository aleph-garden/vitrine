// A browser host over the Vitrine runtime: session, fetching with the
// credentials the session stands on, navigation, the chrome and the region's
// failure states. A host package brings its address scheme, its views and
// its session; an application that only embeds a region needs none of this.

export type { Address, AddressScheme } from './address.ts'
export { hintOf, locationAddress } from './address.ts'
export type { Host } from './boot.ts'
export { boot } from './boot.ts'
export type { Chrome, ResolveIssuer } from './chrome.ts'
export { installChrome } from './chrome.ts'
export type { Config } from './config.ts'
export { HOST_TYPE, readConfig } from './config.ts'
export type { Navigation } from './navigation.ts'
export { installNavigation } from './navigation.ts'
export type { Region } from './region.ts'
export { mountInto } from './region.ts'
export type { Fetch, ParseTurtle, Session } from './session.ts'
export {
  anonymousSession,
  createSession,
  credentialedOrigins,
  issuerOf,
  profileOrigins,
  readProfile
} from './session.ts'
