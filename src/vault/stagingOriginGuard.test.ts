import {describe,expect,it} from 'vitest';
import {evaluateOwnerStagingOrigin as check} from './stagingOriginGuard';
describe('M2.9 secure owner HTTPS staging build guard',()=>{
  it('permits only an exactly matching distinct HTTPS hostname as a topology check',()=>{
    const result=check('https://exam.home.arpa','https://exam.home.arpa');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('acceptance still required');
  });
  it.each([
    ['https://yenuka2012.github.io','https://yenuka2012.github.io'],
    ['https://yenuka2012.github.io/examprep-engine','https://yenuka2012.github.io'],
    ['http://exam.home.arpa','http://exam.home.arpa'],
    ['https://exam.home.arpa/','https://exam.home.arpa'],
    ['https://exam.home.arpa/path','https://exam.home.arpa'],
    ['https://exam.home.arpa','https://malicious.home.arpa'],
    ['https://127.0.0.2','https://127.0.0.2'],
    ['https://example.com?credential=sensitive','https://example.com']
  ])('rejects unsafe or mismatched staging origins (%s)',(expected,actual)=>{
    expect(check(expected,actual).allowed).toBe(false);
  });
  it('does not echo query credentials or secret-bearing input',()=>{
    const result=check('https://user:secret@exam.home.arpa?token=private',
      'https://exam.home.arpa');
    expect(result.allowed).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
