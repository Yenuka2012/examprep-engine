/**
 * M2.6 — pure topology preflight for a FUTURE encrypted-only origin.
 *
 * NEVER imports/opens production IndexedDB, invokes Web Locks, fetches a URL,
 * changes browser state, attests TLS/host ownership, or authorizes migration.
 * This is not an obsolete-client revocation mechanism: it only assesses
 * whether an encrypted destination is isolated by the browser origin model.
 */
export type TargetHostingModel = 'github-pages' | 'private-ubuntu';
export type OriginBlocker =
  | 'SOURCE_URL_INVALID'
  | 'DESTINATION_URL_INVALID'
  | 'SOURCE_NOT_HTTPS'
  | 'DESTINATION_NOT_HTTPS'
  | 'SOURCE_EMBEDDED_CREDENTIALS'
  | 'DESTINATION_EMBEDDED_CREDENTIALS'
  | 'SOURCE_QUERY_OR_FRAGMENT'
  | 'DESTINATION_QUERY_OR_FRAGMENT'
  | 'SOURCE_HOST_UNSAFE'
  | 'DESTINATION_HOST_UNSAFE'
  | 'SAME_ORIGIN'
  | 'SAME_HOST_DIFFERENT_PORT'
  | 'TARGET_HOSTING_MODEL_UNSUPPORTED';

export type OriginPreflight = {
  format: 'examprep-origin-preflight-v1';
  verdict: 'BLOCKED' | 'TOPOLOGY_ONLY_PASS_NOT_AUTHORIZED';
  readOnly: true;
  sourceOrigin: string | null;
  destinationOrigin: string | null;
  targetHostingModel: TargetHostingModel | 'unknown';
  blockers: OriginBlocker[];
  requiredOwnerEvidence: readonly string[];
};

const SHARED_EVIDENCE = [
  'Verify destination hostname ownership and TLS certificate in the real browser',
  'Verify new encrypted-only runtime has no legacy plaintext database fallback',
  'Validate an independently restored authenticated logical-v2 owner backup',
  'Validate encrypted vault export and restore on a distinct browser profile and origin',
  'Finish all unfinished exams and attest all obsolete tabs/PWA windows closed',
  'Pass physical iPhone and iPad Safari/Home Screen PWA acceptance',
  'Obtain separate explicit owner authorization for non-destructive migration'
] as const;

function parseCandidate(
  raw: string,
  label: 'SOURCE' | 'DESTINATION',
  blockers: OriginBlocker[]
): URL | null {
  const bad = (code: OriginBlocker) => { blockers.push(code); return null; };
  // Use absolute URLs only. URL() silently trims whitespace and normalizes
  // backslashes in special schemes; reject both before parsing.
  if (typeof raw !== 'string' || !raw || raw.trim() !== raw || raw.includes('\\')) {
    return bad(label === 'SOURCE' ? 'SOURCE_URL_INVALID' : 'DESTINATION_URL_INVALID');
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { return bad(label === 'SOURCE' ? 'SOURCE_URL_INVALID' : 'DESTINATION_URL_INVALID'); }

  // Reject opaque, relative, filesystem and HTTP browser URLs, including
  // dev localhost, rather than accidentally approving a production cutover.
  if (url.protocol !== 'https:' || url.origin === 'null') {
    blockers.push(label === 'SOURCE' ? 'SOURCE_NOT_HTTPS' : 'DESTINATION_NOT_HTTPS');
  }
  // Never echo credentials, query contents or full URLs into reports.
  if (url.username !== '' || url.password !== '') {
    blockers.push(label === 'SOURCE' ? 'SOURCE_EMBEDDED_CREDENTIALS' : 'DESTINATION_EMBEDDED_CREDENTIALS');
  }
  if (url.search !== '' || url.hash !== '') {
    blockers.push(label === 'SOURCE' ? 'SOURCE_QUERY_OR_FRAGMENT' : 'DESTINATION_QUERY_OR_FRAGMENT');
  }
  // Trailing-dot hostname aliases and loopback are unsuitable for this
  // production topology preflight. This is not DNS/TLS verification.
  const hostname = url.hostname.toLowerCase();
  // Loopback is the entire IPv4 127/8 range; a non-127.0.0.1
  // alias must not masquerade as a valid destination HTTPS hostname.
  const loopbackV4 = /^127(?:\\.\\d{1,3}){3}$/.test(hostname);
  const mappedLoopbackV6 = hostname.startsWith('[::ffff:7f00:');
  if (!hostname || hostname.endsWith('.') ||
      hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0' || hostname === '[::]' ||
      loopbackV4 || mappedLoopbackV6 || hostname === '[::1]') {
    blockers.push(label === 'SOURCE' ? 'SOURCE_HOST_UNSAFE' : 'DESTINATION_HOST_UNSAFE');
  }
  return url;
}

export function assessEncryptedDestinationOrigin(input: {
  legacySourceUrl: string;
  encryptedDestinationUrl: string;
  targetHostingModel: TargetHostingModel;
}): OriginPreflight {
  const blockers: OriginBlocker[] = [];
  // TypeScript alone does not enforce input types at JavaScript runtime.
  const mode = input.targetHostingModel;
  const modeSupported = mode === 'github-pages' || mode === 'private-ubuntu';
  if (!modeSupported) blockers.push('TARGET_HOSTING_MODEL_UNSUPPORTED');
  const source = parseCandidate(input.legacySourceUrl, 'SOURCE', blockers);
  const dest = parseCandidate(input.encryptedDestinationUrl, 'DESTINATION', blockers);

  if (source && dest && source.origin === dest.origin) {
    blockers.push('SAME_ORIGIN');
  } else if (source && dest &&
             source.hostname.toLowerCase() === dest.hostname.toLowerCase()) {
    // Browser origins with different ports are technically distinct, but
    // use a distinct hostname for the intended security boundary, not just
    // a port or different Pages/PWA path on the original host.
    blockers.push('SAME_HOST_DIFFERENT_PORT');
  }

  const requiredOwnerEvidence = [
    ...SHARED_EVIDENCE,
    !modeSupported
      ? 'Select a supported destination hosting model before any topology review'
      : mode === 'private-ubuntu'
        ? 'Verify dedicated Ubuntu VM HTTPS, network isolation, VPN and offline recovery'
        : 'Acknowledge public static Pages hosting and separately verify destination-host controls'
  ];

  return {
    format: 'examprep-origin-preflight-v1',
    verdict: blockers.length === 0 ? 'TOPOLOGY_ONLY_PASS_NOT_AUTHORIZED' : 'BLOCKED',
    readOnly: true,
    sourceOrigin: source?.protocol === 'https:' ? source.origin : null,
    destinationOrigin: dest?.protocol === 'https:' ? dest.origin : null,
    targetHostingModel: modeSupported ? mode : 'unknown',
    blockers,
    requiredOwnerEvidence
  };
}
