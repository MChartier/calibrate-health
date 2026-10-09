// Preserve preparation-tool imports while runtime callers use the shared service.
export { CredentialProvider, CredentialProviderUnavailable } from '../../src/services/credentialVerification';
export type { CredentialIdentity, FirebaseCredentialVerifier } from '../../src/services/credentialVerification';
