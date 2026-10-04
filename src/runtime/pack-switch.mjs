// Decoding never changes the live view. Only the bounded synchronous commit does.
export async function switchPack({api, resource, token, fresh, persist}) {
 let committed=false;
 try {
  const ready=await api('prepare',resource,token);
  if(!ready?.prepared||!await fresh())throw Error('素材操作已过期');
  const result=await api('commit',null,token,Date.now()+2000);
  if(!result?.applied)throw Error('素材未确认应用');
  committed=true;
  if(!await fresh())throw Error('已有较新的素材操作');
  await persist();
 }catch(error){
  // This also invalidates a decode which continues after a transport timeout.
  let restored=false;try{restored=(await api('rollback',null,token))?.restored===true;}catch{}
  throw Error(restored?'素材切换失败，已保留此前有效素材':'素材切换未完成，画面状态待确认；请重试或关闭主题');
 }
 // Failure to release a tiny rollback snapshot must not reverse a saved choice.
 try{await api('finalize',null,token);}catch{}
 return {applied:committed};
}
