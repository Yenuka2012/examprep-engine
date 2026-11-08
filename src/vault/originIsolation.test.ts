import {describe,expect,it} from 'vitest';
import {assessEncryptedDestinationOrigin} from './originIsolation';

const source = 'https://yenuka2012.github.io/examprep-engine/';
const target = 'https://vault.exam.example/';
const assess = (destination: string, legacy=source, model:'github-pages'|'private-ubuntu'='github-pages') =>
  assessEncryptedDestinationOrigin({
    legacySourceUrl: legacy, encryptedDestinationUrl:destination,targetHostingModel:model
  });

describe('M2.6 production origin preflight (pure, no storage/network)',()=>{
  it('never authorizes actual migration even for genuinely distinct HTTPS hostnames',()=>{
    const r=assess(target);
    expect(r).toMatchObject({
      format:'examprep-origin-preflight-v1',
      verdict:'TOPOLOGY_ONLY_PASS_NOT_AUTHORIZED',
      readOnly:true,
      sourceOrigin:'https://yenuka2012.github.io',
      destinationOrigin:'https://vault.exam.example',
      blockers:[]
    });
    expect(r.requiredOwnerEvidence.join(' ')).toContain('owner authorization');
    expect(JSON.stringify(r)).not.toContain('MIGRATION_AUTHORIZED');
  });
  it.each([
    'https://yenuka2012.github.io/another-vault/',
    'https://yenuka2012.github.io/',
    'https://yenuka2012.github.io:443/other-path/',
    'https://YENUKA2012.GITHUB.IO/vault/'
  ])('rejects same-origin Pages aliases and paths (%s)',destination=>{
    expect(assess(destination).blockers).toContain('SAME_ORIGIN');
  });
  it('rejects same hostname on a different port even though browser origin differs',()=>{
    const r=assess('https://yenuka2012.github.io:8443/vault');
    expect(r.verdict).toBe('BLOCKED');
    expect(r.blockers).toContain('SAME_HOST_DIFFERENT_PORT');
  });
  it.each([
    ['http://vault.exam.example','DESTINATION_NOT_HTTPS'],
    ['file:///tmp/vault.html','DESTINATION_NOT_HTTPS'],
    ['data:text/html,abc','DESTINATION_NOT_HTTPS'],
    ['https://user:password@vault.exam.example','DESTINATION_EMBEDDED_CREDENTIALS'],
    ['https://vault.exam.example/?passphrase=secret','DESTINATION_QUERY_OR_FRAGMENT'],
    ['https://vault.exam.example/#token','DESTINATION_QUERY_OR_FRAGMENT'],
    ['https://vault.exam.example./','DESTINATION_HOST_UNSAFE'],
    ['https://localhost:8443/vault','DESTINATION_HOST_UNSAFE'],
    ['https://127.0.0.1/vault','DESTINATION_HOST_UNSAFE'],
    ['/relative/url','DESTINATION_URL_INVALID'],
    [' https://vault.exam.example/','DESTINATION_URL_INVALID'],
    ['https:\\\\vault.exam.example\\foo','DESTINATION_URL_INVALID'],
    ['not a url','DESTINATION_URL_INVALID']
  ] as const)('blocks dangerous or ambiguous destination URL %s', (destination,code)=>{
    const r=assess(destination);
    expect(r.verdict).toBe('BLOCKED');
    expect(r.blockers).toContain(code);
  });
  it('rejects invalid source inputs without treating destination as sufficient',()=>{
    const r=assess(target,'http://yenuka2012.github.io/examprep-engine/');
    expect(r.verdict).toBe('BLOCKED');
    expect(r.blockers).toContain('SOURCE_NOT_HTTPS');
    expect(r.sourceOrigin).toBeNull();
  });
  it('does not report secret-bearing URLs or entered credentials',()=>{
    const r=assess('https://user:private@vault.exam.example/?token=secret');
    const report=JSON.stringify(r);
    expect(report).not.toContain('private');
    expect(report).not.toContain('secret');
    expect(report).not.toContain('token');
    expect(r.blockers).toContain('DESTINATION_EMBEDDED_CREDENTIALS');
  });
  it('supports private Ubuntu HTTPS/VPN topology but never claims VPN/TLS verified',()=>{
    const r=assess('https://exam.home.arpa/',source,'private-ubuntu');
    expect(r.verdict).toBe('TOPOLOGY_ONLY_PASS_NOT_AUTHORIZED');
    expect(r.requiredOwnerEvidence.join(' ')).toContain('VPN');
    expect(r.requiredOwnerEvidence.join(' ')).toContain('TLS certificate');
    expect(r.requiredOwnerEvidence.join(' ')).toContain('independently restored');
  });
  it('normalizes IDNA hostname and default HTTPS port consistently',()=>{
    const r=assess('https://vault.exam.example:443/new');
    expect(r.destinationOrigin).toBe('https://vault.exam.example');
    expect(r.verdict).toBe('TOPOLOGY_ONLY_PASS_NOT_AUTHORIZED');
  });
});
