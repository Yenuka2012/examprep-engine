import {describe,expect,it} from 'vitest';
import {jsonEqual} from './jsonEqual';

describe('M0.1 canonical restore collision comparison',()=>{
  it('accepts semantically identical nested JSON regardless of property ordering',()=>{
    const left={bank_id:'X',title:'Original',questions:[{id:'Q',options:[{id:'A',text:'a'}],correct_answers:['A']}]};
    const right={questions:[{correct_answers:['A'],options:[{text:'a',id:'A'}],id:'Q'}],title:'Original',bank_id:'X'};
    expect(jsonEqual(left,right)).toBe(true);
  });
  it('rejects modified values or altered array order',()=>{
    expect(jsonEqual({answers:{Q:['A']}},{answers:{Q:['B']}})).toBe(false);
    expect(jsonEqual({answers:['A','B']},{answers:['B','A']})).toBe(false);
  });
  it('does not permit prototype-like key tricks to hide differing data',()=>{
    const a=JSON.parse('{"__proto__":{"safe":true},"nested":{"constructor":"x"}}');
    const b=JSON.parse('{"nested":{"constructor":"y"},"__proto__":{"safe":true}}');
    expect(jsonEqual(a,b)).toBe(false);
  });
});
