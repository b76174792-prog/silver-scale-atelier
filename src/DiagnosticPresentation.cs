using System;
using System.Text.RegularExpressions;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;
internal static class DiagnosticPresentation {
 internal static string Render(Dictionary<string,object> record,Localization locale){
  record=record??new Dictionary<string,object>();string key=Convert.ToString(Localization.Value(record,"messageKey"));
  if(key.StartsWith("error.",StringComparison.Ordinal)||key.StartsWith("status.",StringComparison.Ordinal)||key.StartsWith("port.",StringComparison.Ordinal)||key=="diagnostic.generic"){
   string text=locale.Text(key,Localization.Object(Localization.Value(record,"args")));if(text!=Localization.Unavailable)return text;
  }
  string code=Convert.ToString(Localization.Value(record,"errorCode"));if(String.IsNullOrEmpty(code))code=Convert.ToString(Localization.Value(record,"code"));
  if(!Regex.IsMatch(code,@"\A[A-Z0-9_.-]{1,80}\z"))code="LOCAL_FAILURE";
  return locale.Text("diagnostic.generic",new Dictionary<string,object>{{"code",code}});
 }
 static readonly string[] fields={"error","failure","errorCode","code","message","stage","result","phase","at","startedAt","finishedAt","operationId","hostInstanceId","uncertaintyReason","source","helperVerb","exitCode","systemError","signal","pid","createdMs","observedCreatedMs","createdMicros","observedCreatedMicros","commandAvailable","executableAvailable","openError","timesError","waitResult","waitError","imageError","exceptionType","hresult","managementError"};
 static object Safe(object value,int depth){
  if(depth>4)return null;
  var record=value as Dictionary<string,object>;if(record!=null){var safe=new Dictionary<string,object>();foreach(string key in fields){object item;if(record.TryGetValue(key,out item)&&(item==null||item is string||item is bool||item is int||item is long||item is double||item is decimal))safe[key]=item;}foreach(string key in new[]{"diagnostics","native"})if(record.ContainsKey(key))safe[key]=Safe(record[key],depth+1);return safe;}
  var list=value as IList;if(list!=null){var safe=new List<object>();for(int i=0;i<Math.Min(list.Count,64);i++)safe.Add(Safe(list[i],depth+1));return safe;}return null;
 }
 internal static string RawDetails(Dictionary<string,object> record){return new JavaScriptSerializer().Serialize(Safe(record,0));}
}
