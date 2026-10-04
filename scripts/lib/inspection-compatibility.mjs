// Development-only eligibility. Never imported by the production payload.
import {resolveClientCompatibility,getAdapter} from '../../src/runtime/compatibility.mjs';

export const inspectionVersions=Object.freeze(['26.917.8451.0','26.928.3736.0','26.930.2377.0','26.930.3930.0']);

export function resolveInspectionClient(client){
 const production=resolveClientCompatibility(client);
 if(production.status==='supported')return {adapter:getAdapter(production.adapterId),supportLevel:'production-candidate'};
 if(!['26.930.2377.0','26.930.3930.0'].includes(client?.version)||client.family!=='OpenAI.Codex_2p2nqsd0c76g0'||client.architecture!=='X64'||client.signature!=='Store')return null;
 // The second version's structure is still unverified. Reuse the descriptor
 // only as a read-only hypothesis; this never registers production mounting.
 const descriptor=getAdapter('local-msix-26.930.2377.0-chat-work');
 return {adapter:{...descriptor,id:'discovery-only-msix-'+client.version},supportLevel:'discovery-only'};
}
