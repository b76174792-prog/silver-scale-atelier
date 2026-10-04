using System;
using System.Collections.Generic;
static class DiagnosticPresentationTests {
 static void Check(bool value,string name){if(!value)throw new Exception(name);}
 static int Main(string[] args){try{
  var record=new Dictionary<string,object>{{"errorCode","HELPER_FAILED"},{"error","Raw original error"},{"messageKey","error.helper_failed"},{"args",new Dictionary<string,object>()},{"operationId","op-123"},{"command","SECRET"},{"diagnostics",new Dictionary<string,object>{{"exitCode",10},{"command","SECRET"}}}};
  var texts=new HashSet<string>();foreach(string locale in Localization.Locales)texts.Add(DiagnosticPresentation.Render(record,Localization.Load(args[0],locale)));Check(texts.Count==6,"Six localized explanations");
  string raw=DiagnosticPresentation.RawDetails(record);Check(raw.Contains("Raw original error")&&raw.Contains("op-123")&&raw.Contains("10")&&!raw.Contains("SECRET"),"Original safe fields only");
  Check((string)record["error"]=="Raw original error","Raw values preserved");record.Remove("messageKey");record["errorCode"]="FUTURE_ERROR";Check(DiagnosticPresentation.Render(record,Localization.Load(args[0],"fr")).Contains("FUTURE_ERROR"),"Old record fallback");
  Console.WriteLine("presentation PASS");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
