/**
 * READ-ONLY M2.6 topology assessment in the isolated M2.9 owner preview.
 * This compares URLs only: no DNS, TLS, ownership, network, or migration.
 */
import {useState} from 'react';
import {
  assessEncryptedDestinationOrigin,
  type OriginPreflight,type TargetHostingModel
} from './originIsolation';

const ORIGINAL='https://yenuka2012.github.io/examprep-engine/';
export default function OriginTopologyPanel(){
  const [destination,setDestination]=useState('');
  const [hosting,setHosting]=useState<TargetHostingModel>('private-ubuntu');
  const [report,setReport]=useState<OriginPreflight|null>(null);
  return <section aria-label="Distinct-origin topology preflight">
    <h3>Distinct HTTPS origin preflight — read only</h3>
    <p>Source: <code>https://yenuka2012.github.io</code>. A different path on
      this hostname cannot isolate IndexedDB from older cached PWAs. This
      tool does not connect to or certify a server or authorize migration.</p>
    <form onSubmit={event=>{
      event.preventDefault();
      setReport(assessEncryptedDestinationOrigin({
        legacySourceUrl:ORIGINAL,encryptedDestinationUrl:destination,
        targetHostingModel:hosting
      }));
    }}>
      <label>Proposed encrypted destination HTTPS URL
        <input aria-label="Proposed encrypted destination HTTPS URL"
          type="text" spellCheck={false} autoComplete="off"
          placeholder="https://exam.home.arpa/"
          value={destination} onChange={event=>{setDestination(event.target.value);setReport(null);}}/>
      </label>
      <label>Future hosting model
        <select aria-label="Future hosting model" value={hosting}
          onChange={event=>{setHosting(event.target.value as TargetHostingModel);setReport(null);}}>
          <option value="private-ubuntu">Private Ubuntu HTTPS/VPN</option>
          <option value="github-pages">Separate-host GitHub Pages</option>
        </select>
      </label>
      <button type="submit">Check topology only</button>
    </form>
    {report&&<div role="status" aria-live="polite" data-testid="origin-preflight">
      <p><strong>{report.verdict==='BLOCKED'?
        'Topology blocked':'Topology-only pass — migration NOT authorized'}</strong></p>
      <p>Proposed origin: {report.destinationOrigin??'Not an acceptable HTTPS origin'}</p>
      {report.blockers.length>0&&<p>Blockers: {report.blockers.join(', ')}</p>}
      <p>Mandatory separate evidence:</p>
      <ul>{report.requiredOwnerEvidence.map(item=><li key={item}>{item}</li>)}</ul>
    </div>}
  </section>;
}
