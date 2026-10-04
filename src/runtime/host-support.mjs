// Exact package records. A timestamp is a distribution lower bound, not a release date.
// Production eligibility and validation evidence are deliberately separate.
export const hostSupport=Object.freeze([
 {version:'26.917.8451.0',adapterId:'local-experimental-msix-26.917.8451.0-chat-work',productionEligible:true,releaseScope:'legacy-out-of-scope',dateSource:{kind:'observed-before-boundary',date:'2026-09-24'},validation:{standard:'pending',dot:'incompatible',switching:'pending'}},
 {version:'26.928.3736.0',adapterId:'local-msix-26.928.3736.0-chat-work',productionEligible:true,releaseScope:'date-unconfirmed',dateSource:{kind:'local-observation',date:'2026-09-29'},validation:{standard:'pending',dot:'incompatible',switching:'pending'}},
 {version:'26.930.2377.0',adapterId:'local-msix-26.930.2377.0-chat-work',productionEligible:true,releaseScope:'recent',dateSource:{kind:'verified-package-signature-lower-bound',timestamp:'2026-10-02T04:21:28.105Z'},validation:{standard:'structure-confirmed',dot:'structure-confirmed',switching:'pending'}},
 {version:'26.930.3930.0',adapterId:'local-msix-26.930.2377.0-chat-work',productionEligible:false,releaseScope:'recent',dateSource:{kind:'verified-package-signature-lower-bound',timestamp:'2026-10-03T03:06:29.599Z'},validation:{standard:'pending',dot:'pending',switching:'pending'},availability:'staged-not-registered'}
].map(row=>Object.freeze({...row,dateSource:Object.freeze(row.dateSource),validation:Object.freeze(row.validation)})));
export const hostDateBoundary='2026-09-25';
export const findHostSupport=version=>hostSupport.find(row=>row.version===version)||null;
