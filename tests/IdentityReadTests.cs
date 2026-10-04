using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Reflection;
class IdentityReadTests {
 static long Ms(DateTime time){return (time.ToUniversalTime().Ticks-621355968000000000L)/10000;}
 static ClientIdentity Missing(int pid,long created,long micros=0){var row=new ClientIdentity{pid=pid,command=null,executable=null};var field=typeof(ClientIdentity).GetField("createdMs");if(field!=null)field.SetValue(row,created);field=typeof(ClientIdentity).GetField("createdMicros");if(field!=null)field.SetValue(row,micros);return row;}
 static void Require(bool value,string message){if(!value)throw new Exception(message);}
 static Exception Refuses(ClientIdentity row){try{ActivationHost.SelectRebindPid(new[]{row},@"C:\fixture\ChatGPT.exe",@"C:\fixture\profile");}catch(Exception e){return e;}throw new Exception("Unverified identity must fail closed");}
 static int Main(string[] args){
  if(args.Length==1&&args[0]=="exit259")return 259;
  var start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"exit259"){UseShellExecute=false,CreateNoWindow=true};
  using(var exited=Process.Start(start)){
   long created=Ms(exited.StartTime),micros=(exited.StartTime.ToUniversalTime().Ticks-621355968000000000L)/10;exited.WaitForExit();
   Require(exited.ExitCode==259,"Fixture must exercise misleading STILL_ACTIVE exit code");
   try{Require(ActivationHost.SelectRebindPid(new[]{Missing(exited.Id,created,micros)},@"C:\fixture\ChatGPT.exe",@"C:\fixture\profile")==null,"Ended instance cannot be adopted");}catch(Exception e){throw new Exception("Verified ended instance must not block selection: "+e.Message);}
   Require(Refuses(Missing(exited.Id,created,micros+1)).Message.Contains("identity unavailable"),"Creation mismatch within one millisecond must remain refused");
   Require(Refuses(Missing(exited.Id,created+1,micros)).Message.Contains("identity unavailable"),"PID reuse must not become exit proof");
   Require(Refuses(Missing(exited.Id,0)).Message.Contains("identity unavailable"),"Missing creation time must not become exit proof");
  }
  using(var live=Process.GetCurrentProcess()){
   var e=Refuses(Missing(live.Id,Ms(live.StartTime),(live.StartTime.ToUniversalTime().Ticks-621355968000000000L)/10));
   var d=e.Data["diagnostics"] as Dictionary<string,object>;
   Require(d!=null,"Identity refusal needs structured diagnostics");Require(Convert.ToInt32(d["pid"])==live.Id,"Diagnostic PID missing");Require(Convert.ToUInt32(d["waitResult"])==258,"Live process must remain refused");
  }
  Console.WriteLine("5 identity proof cases PASS; only harmless fixture exited normally, no client activated.");return 0;
 }
}
