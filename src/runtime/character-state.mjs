// Pure reducer: metadata only. Never accepts message text, credentials or model internals.
export function initialState(){return {phase:'idle',route:null,generating:false,baseline:0,version:0,started:0,until:0,hadOutput:false,errorSeen:false,cancelled:false};}
export function advance(previous,input,now,reset=initialState){
 let s={...previous};
 if(!input.enabled)return {...reset(),phase:'off',route:input.route};
 if(s.route!==input.route||s.phase==='off')s={...reset(),route:input.route,baseline:input.outputVersion,version:input.outputVersion};
 if(input.cancelled){return {...s,phase:'idle',generating:false,hadOutput:false,cancelled:true,until:0};}
 if(input.failed&&!s.errorSeen&&(s.generating||s.phase==='settling'))return {...s,phase:'error',generating:false,errorSeen:true,until:now+4000};
 if(!input.failed)s.errorSeen=false;
 if(input.generating){
  if(s.cancelled)return s;
  if(!s.generating)s={...s,started:now,baseline:input.outputVersion,hadOutput:false,cancelled:false};
  const hadOutput=s.hadOutput||Boolean(input.freshOutput)||input.outputVersion>s.baseline;
  return {...s,generating:true,version:input.outputVersion,hadOutput,until:0,phase:s.cancelled?'idle':hadOutput?'responding':now-s.started>=30000?'long-wait':'thinking'};
 }
 if(s.generating){
  s.generating=false;
  if(s.hadOutput&&!s.cancelled)return {...s,phase:'settling',until:now+600};
  return {...s,phase:'idle',until:0};
 }
 if(s.phase==='settling'&&now>=s.until)return {...s,phase:'complete',until:now+2000};
 if(['complete','error'].includes(s.phase)&&now>=s.until)return {...s,phase:'idle',until:0};
 return {...s,cancelled:false};
}
// Count only new answers in the current generation, never historical DOM mutations.
export function trackOutput(previous,answers,generating,route){
 const count=answers.length;
 if(!previous||previous.route!==route)return {route,generating,count,baseline:count,length:0,version:0,freshOutput:false};
 const s={...previous,freshOutput:false};
 if(!generating)return {...s,generating:false,count,baseline:count,length:0};
 if(!s.generating){s.baseline=s.count;s.length=0;}
 s.generating=true;s.count=count;
 if(count<s.baseline){s.baseline=count;s.length=0;return s;}
 const length=answers.slice(s.baseline).reduce((sum,a)=>sum+Math.max(0,a.length||0),0);
 if(length>s.length){s.version++;s.freshOutput=true;}
 s.length=length;return s;
}
