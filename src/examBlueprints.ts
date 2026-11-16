/**
 * Public exam-format metadata for original PRACTICE simulations only.
 * Versioned sources, not an ISACA test form or pass-score approximation.
 */
export type BlueprintDomain={code:string;name:string;weight:number};
export type ExamBlueprint={
  id:string;provider:'ISACA';certificationId:'CISM'|'CRISC';
  syllabusVersion:string;effectiveFrom:string;verifiedDate:string;
  officialOutlineUrl:string;
  questionCount:150;durationMinutes:240;
  domains:readonly BlueprintDomain[];
  itemType:'four_option_single_best';
};
export const EXAM_BLUEPRINTS:readonly ExamBlueprint[]=[
  {
    id:'ISACA-CISM-2026-11-03-v1',provider:'ISACA',certificationId:'CISM',
    syllabusVersion:'2026',effectiveFrom:'2026-11-03',verifiedDate:'2026-11-16',
    officialOutlineUrl:'https://www.isaca.org/credentialing/cism/cism-exam-content-outline',
    questionCount:150,durationMinutes:240,itemType:'four_option_single_best',
    domains:[
      {code:'D1',name:'Information Security Governance',weight:18},
      {code:'D2',name:'Information Security Risk Management',weight:20},
      {code:'D3',name:'Information Security Program',weight:33},
      {code:'D4',name:'Incident Management',weight:29}
    ]
  },
  {
    id:'ISACA-CRISC-2025-v1',provider:'ISACA',certificationId:'CRISC',
    syllabusVersion:'2025',effectiveFrom:'2025-08-01',verifiedDate:'2026-11-16',
    officialOutlineUrl:'https://www.isaca.org/credentialing/crisc/crisc-exam-content-outline',
    questionCount:150,durationMinutes:240,itemType:'four_option_single_best',
    domains:[
      {code:'D1',name:'Governance',weight:26},
      {code:'D2',name:'Risk Assessment',weight:22},
      {code:'D3',name:'Risk Response and Reporting',weight:32},
      {code:'D4',name:'Technology and Security',weight:20}
    ]
  }
];
export function findExamBlueprint(certificationId:string,syllabusVersion:string):
  ExamBlueprint|undefined {
  return EXAM_BLUEPRINTS.find(x=>
    x.certificationId===certificationId&&x.syllabusVersion===syllabusVersion);
}
