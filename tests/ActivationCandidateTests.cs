using System;
using System.Linq;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;
class ActivationCandidateTests {
 static string exe=@"C:\Program Files\WindowsApps\fixture\ChatGPT.exe", profile=@"C:\Test User\ClientProfile";
 static ClientIdentity Row(int pid,string tail,string path=null){return new ClientIdentity{pid=pid,executable=path??exe,command="\""+exe+"\" "+tail};}
 static string Token="\"--user-data-dir="+profile+"\"";
 static void Require(bool value,string message){if(!value)throw new Exception(message);}
 static void Refuses(ClientIdentity[] rows,string reason){try{ActivationHost.SelectRebindPid(rows,exe,profile);}catch(Exception e){Require(e.Message.Contains(reason),"Unexpected refusal: "+e.Message);return;}throw new Exception("Expected refusal: "+reason);}
 static bool ReceiptAbsent(Receipt record){var method=typeof(ActivationHost).GetMethod("ReceiptProcessAbsent",BindingFlags.Static|BindingFlags.NonPublic);Require(method!=null,"Cold-start receipt gate missing");try{return (bool)method.Invoke(null,new object[]{record});}catch(TargetInvocationException e){throw e.InnerException;}}
 static void InvalidReceipt(Receipt record){try{ReceiptAbsent(record);}catch(Exception e){if(e.Message=="Cold-start receipt gate missing")throw;return;}throw new Exception("Invalid or foreign receipt was accepted");}
 static Receipt Proof(int pid){return new Receipt{pid=pid,existingPids=new int[0],launchMs=1,expectedProfile=DataPaths.ProfileArgument};}
 static string Startup(string path){var original=Console.Out;var output=new StringWriter();Console.SetOut(output);try{typeof(ActivationHost).GetMethod("Run",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{new[]{"--startup-state",path}});return output.ToString();}catch(TargetInvocationException e){throw e.InnerException;}finally{Console.SetOut(original);}}
 static void StartupRefuses(string path){try{Startup(path);}catch{return;}throw new Exception("Invalid or foreign startup path was accepted");}
 static void StartupCases(){
  int absent=int.MaxValue;try{using(var p=Process.GetProcessById(absent)){throw new Exception("The absent-PID fixture unexpectedly exists");}}catch(ArgumentException){}
  Require(ReceiptAbsent(Proof(absent)),"A proven missing PID must permit guarded fresh launch");
  using(var current=Process.GetCurrentProcess())Require(!ReceiptAbsent(Proof(current.Id)),"Any existing PID, even an unrelated or reused one, must require rebind");
  InvalidReceipt(null);var record=Proof(absent);record.pid=0;InvalidReceipt(record);record=Proof(absent);record.existingPids=null;InvalidReceipt(record);record=Proof(absent);record.launchMs=0;InvalidReceipt(record);record=Proof(absent);record.expectedProfile=DataPaths.ProfileArgument+"-foreign";InvalidReceipt(record);
  string receipt=Path.Combine(DataPaths.Root,"launcher-receipt.json");Directory.CreateDirectory(DataPaths.Root);
  Require(Startup(receipt).Contains("fresh"),"No owned receipt must permit fresh launch");
  var json=new JavaScriptSerializer();File.WriteAllText(receipt,json.Serialize(Proof(absent)));Require(Startup(receipt).Contains("fresh"),"Absent receipt PID must be fresh");
  using(var current=Process.GetCurrentProcess())File.WriteAllText(receipt,json.Serialize(Proof(current.Id)));Require(Startup(receipt).Contains("rebind"),"Existing receipt PID must require rebind");
  File.WriteAllText(receipt,"{damaged");StartupRefuses(receipt);StartupRefuses(Path.Combine(DataPaths.Root,"foreign-receipt.json"));
  Console.WriteLine("12 receipt startup states PASS; temporary fixtures only.");
 }
 static int Main(){
  Environment.SetEnvironmentVariable("LOCALAPPDATA",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"startup-fixture"));
  var browser=Row(10,Token+" --remote-debugging-port=0");
  var children=new[]{Row(11,"--type=crashpad-handler "+Token),Row(12,Token+" \"--type=crashpad-handler\""),Row(13,"--type renderer "+Token),Row(14,Token+" --type=gpu-process"),Row(15,Token+" --type=utility")};
  Require(ActivationHost.SelectRebindPid(new[]{browser}.Concat(children),exe,profile)==10,"Helpers must not create candidate ambiguity");
  Require(ActivationHost.SelectRebindPid(children,exe,profile)==null,"Children alone cannot be adopted");
  Refuses(new[]{browser,Row(20,Token)},"Multiple dedicated candidates");
  Refuses(new[]{Row(10,Token,@"C:\elsewhere\ChatGPT.exe")},"executable mismatch");
  Refuses(new[]{new ClientIdentity{pid=10,command=null}},"identity unavailable");
  Require(ActivationHost.SelectRebindPid(new[]{Row(10,"\"--user-data-dir="+profile+"-other\"")},exe,profile)==null,"Profile prefix collision refused");
  Require(ActivationHost.SelectRebindPid(new[]{Row(10,"--other=\"--user-data-dir="+profile+"\"")},exe,profile)==null,"Embedded profile is not an argument");
  Require(ActivationHost.SelectRebindPid(new[]{Row(10,Token+" --type=")},exe,profile)==null,"Empty process type fails closed");
  Require(ActivationHost.SelectRebindPid(new[]{Row(10,Token+" --log-file=\"C:\\ --type=foo\"")},exe,profile)==10,"Type text within another argument is not a switch");
  Console.WriteLine("9 candidate selection cases PASS; no activation or profile access.");StartupCases();return 0;
 }
}
