using System;
using System.Reflection;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;
class ManagerDiagnosticTests {
 static Dictionary<string,object> D(params object[] values){var d=new Dictionary<string,object>();for(int i=0;i<values.Length;i+=2)d.Add((string)values[i],values[i+1]);return d;}
 static void Require(bool value,string message){if(!value)throw new Exception(message);}
 static string Text(Dictionary<string,object> r,string fallback="last successful action",string localId=null){var method=typeof(ManagerForm).GetMethod("DiagnosticText",BindingFlags.Static|BindingFlags.NonPublic);Require(method!=null,"Current and historical diagnostic presentation is missing");return (string)method.Invoke(null,method.GetParameters().Length==3?new object[]{r,fallback,localId}:new object[]{r,fallback});}
 static int Main(string[] args){
  Entry.Root=Environment.GetEnvironmentVariable("SILVER_SCALE_TEST_ROOT");Entry.Data=Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA"),"diagnostic-test-state");Entry.Ui=UiContext.Create("zh-CN","zh-CN",Path.Combine(Entry.Root,"localization"));
  if(args.Length==1){var actual=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));string rendered=Text(actual,"已允许新请求","reconcile-operation");Require(rendered.StartsWith("已允许新请求"),"Actual reconciled journal must preserve the successful action");Require(rendered.Contains("历史操作")&&rendered.Contains("operation-current.json"),"Actual old operation must appear only as history");Console.WriteLine("real reconcile presentation PASS");return 0;}
  var old=D("at","2026-09-29T15:49:43.023Z","source","theme-status.json","failure","old host failed","errorCode","HOST_FAILED");
  var op=D("result","unknown","error","identity unavailable","errorCode","HELPER_FAILED","finishedAt","2026-10-02T03:00:00Z","uncertaintyReason","local_migration_committed");
  var r=D("failure",null,"historicalFailure",old,"operation",op);
  string text=Text(r);Require(text.IndexOf("identity unavailable")<text.IndexOf("old host failed"),"Current operation must precede history");Require(text.Contains("历史")&&text.Contains("2026-09-29")&&text.Contains("theme-status.json"),"History needs time and source");Require(text.Contains("迁移")&&text.Contains("尚未请求"),"Migration-only uncertainty must explain no external request");
  r["operation"]=D("result","succeeded");Require(Text(r).StartsWith("last successful action"),"History must not replace successful action");
  r["failure"]="current host failed";r["errorCode"]="HOST_FAILED";r["messageKey"]="error.state";text=Text(r);Require(text.StartsWith(Entry.Ui.Catalogue.Text("error.state"))&&text.IndexOf("current host failed")<text.IndexOf("old host failed"),"Matching current host has localized summary and original detail before history");
  r["failure"]=null;r["operation"]=op;op["operationId"]="prior-operation";
  text=Text(r,"[RECONCILE_REQUIRED] latest request","latest-operation");Require(text.StartsWith("[RECONCILE_REQUIRED] latest request"),"Older journal must not overwrite this request's error");Require(text.Contains("历史操作")&&text.Contains("operation-current.json"),"Unmatched journal must retain a history source");
  op["reconciled"]=true;text=Text(r,"已允许新请求","reconcile-operation");Require(text.StartsWith("已允许新请求"),"Successful reconcile must not display old error as current");
  Console.WriteLine("5 diagnostic presentation cases PASS; no GUI or client started.");return 0;
 }
}
