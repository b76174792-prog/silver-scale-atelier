// Local experiment only. No account APIs, CSP bypass, or arbitrary CDP methods.
const allowedMethods = new Set(['Runtime.evaluate','Page.getFrameTree']);
// Metadata only. Shared by the write guard and lifecycle monitor; no input values.
export function nativeSurface() {
 if(location.href!=='app://-/index.html')return 'outside';
 if(document.querySelector('input[type="password"],input[autocomplete="one-time-code"],iframe[src*="auth"],form[action*="login"],[data-testid*="checkout"],[data-testid*="payment"]'))return 'protected';
 const content=document.querySelector('[data-codex-composer-root]')||document.querySelector('[data-composer-markdown][contenteditable="true"]')||document.querySelector('[data-app-action-timeline-scroll]')||document.querySelector('[data-settings-panel-slug], [class~="group/settings"]');
 return document.querySelector('[data-app-shell-main-content-layout]')&&content?'eligible':'unavailable';
}
export function wrapExpression(expression, origins) {
  return `(()=>{
    const allowed=${allowedTarget.toString()};
    if(!allowed(location.href,${JSON.stringify(origins)}))throw new Error('Probe execution page refused');
    if(location.href==='app://-/index.html'){
      if((${nativeSurface.toString()})()!=='eligible')throw new Error('Probe execution surface refused');
    }
    return (${expression});
  })()`;
}
export function authorizeCommand(method, params) {
  if (!allowedMethods.has(method)) throw new Error('blocked CDP method');
  return true;
}
export function allowedTarget(value, origins) {
  if (value === 'app://-/index.html') return origins.includes('app://-');
  try {
    const u=new URL(value);
    if (u.username || u.password || u.search || /(?:auth|login|signin|checkout|payment|billing)/i.test(u.pathname)) return false;
    return origins.includes(u.origin);
  } catch { return false; }
}
export function verifyOwnership(e) {
  const rebound=e.proofVersion===2&&e.proofKind==='explicit-rebind'&&typeof e.confirmationId==='string'&&e.confirmationId.length>0&&e.reboundMs>0;
  if (!Array.isArray(e.existingPids)||!Number.isInteger(e.pid) || (!rebound&&e.existingPids.includes(e.pid))) throw new Error('existing or invalid PID');
  if (!(e.startedMs>0) || (!rebound&&!(e.startedMs >= e.launchMs))) throw new Error('process predates launch');
  const normalize=s=>String(s).replaceAll('/','\\').replace(/\\$/,'').toLowerCase();
  if (!e.expectedProfile || normalize(e.actualProfile)!==normalize(e.expectedProfile)) throw new Error('profile mismatch');
  if (!Number.isInteger(e.port) || e.port<1 || e.port>65535 || !e.listeners.length) throw new Error('missing listener');
  if (e.listeners.some(l=>l.pid!==e.pid || !['127.0.0.1','::1'].includes(l.address))) throw new Error('listener is not owned and loopback only');
  return true;
}
