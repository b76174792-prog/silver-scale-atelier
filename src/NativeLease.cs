using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Management;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

class LeaseRecord {
 public int version=2,pid,holderPid; public long startedMs,holderStartedMs;
 public string executable,role,receipt,token;
}
static class NativeLease {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static long Started(Process p){return (p.StartTime.ToUniversalTime().Ticks-621355968000000000L)/10000;}
 public static void RejectLinks(string path){
  for(string p=Path.GetFullPath(path);!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p))
   if((File.Exists(p)||Directory.Exists(p))&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new Exception("Linked state path refused");
 }
 static string Executable(Process p){return p.MainModule.FileName;}
 static bool HasArgument(int pid,string argument){
  using(var search=new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE ProcessId="+pid)){
   var rows=search.Get();if(rows.Count!=1)throw new Exception("Process metadata unavailable");
   foreach(ManagementObject row in rows){
    string command=Convert.ToString(row["CommandLine"]);if(String.IsNullOrEmpty(command))throw new Exception("Process command unavailable");
    string a=System.Text.RegularExpressions.Regex.Escape(argument);
    return System.Text.RegularExpressions.Regex.IsMatch(command,"(?:^|\\s)(?:\""+a+"\"|"+a+")(?:\\s|$)",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
   }
  }return false;
 }
 public static string State(string path,out LeaseRecord record){
  record=null;
  try{
   RejectLinks(path);if(!File.Exists(path))return "absent";
   record=Json.Deserialize<LeaseRecord>(File.ReadAllText(path));
   if(record==null||record.version!=2||record.pid<=0||record.startedMs<=0||record.holderPid<=0||record.holderStartedMs<=0||String.IsNullOrEmpty(record.executable)||String.IsNullOrEmpty(record.role)||String.IsNullOrEmpty(record.token))return "unknown";
   Process owner;try{owner=Process.GetProcessById(record.pid);}catch(ArgumentException){return "provably_stale";}
   using(owner){if(owner.HasExited||Started(owner)!=record.startedMs)return "provably_stale";
    if(!String.Equals(Executable(owner),record.executable,StringComparison.OrdinalIgnoreCase)||!HasArgument(owner.Id,record.role))return "unknown";}
   using(var holder=Process.GetProcessById(record.holderPid)){
    if(holder.HasExited||Started(holder)!=record.holderStartedMs)return "unknown";
    if(!String.Equals(Executable(holder),Process.GetCurrentProcess().MainModule.FileName,StringComparison.OrdinalIgnoreCase)||!HasArgument(holder.Id,record.token)||!HasArgument(holder.Id,Path.GetFullPath(path)))return "unknown";
   }return "owned_alive";
  }catch{return "unknown";}
 }
 public static int Inspect(string path){LeaseRecord record;string state=State(Path.GetFullPath(path),out record);Console.WriteLine(Json.Serialize(new{state=state,record=record}));return 0;}
 public static int Hold(string path,int pid,string token,string role,string receipt){
  path=Path.GetFullPath(path);RejectLinks(path);
  if(!new[]{"mutation.lock","theme-host-lock.json","operation-lock.json"}.Contains(Path.GetFileName(path)))throw new Exception("Unknown lock role");
  Guid parsed;if(!Guid.TryParse(token,out parsed))throw new Exception("Invalid lock token");
  string name;using(var hash=SHA256.Create())name="Local\\SilverScaleLease-"+BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(path.ToUpperInvariant()))).Replace("-","");
  using(var mutex=new Mutex(false,name)){
   bool held=false;try{
    try{held=mutex.WaitOne(0);}catch(AbandonedMutexException){held=true;}
    if(!held)throw new Exception("LOCK_BUSY: another operation owns this lock");
    LeaseRecord previous;string state=State(path,out previous);
    if(state!="absent"&&state!="provably_stale")throw new Exception("LOCK_"+state.ToUpperInvariant()+": state preserved; explicit diagnosis required");
    LeaseRecord record;
    using(var owner=Process.GetProcessById(pid))using(var holder=Process.GetCurrentProcess()){
     if(!HasArgument(pid,role))throw new Exception("Lock owner script mismatch");
     record=new LeaseRecord{pid=pid,startedMs=Started(owner),executable=Executable(owner),role=role,receipt=receipt,token=token,holderPid=holder.Id,holderStartedMs=Started(holder)};
    }
    Directory.CreateDirectory(Path.GetDirectoryName(path));RejectLinks(path);
    string next=path+"."+token+".next";File.WriteAllText(next,Json.Serialize(record),new UTF8Encoding(false));
    if(File.Exists(path))File.Replace(next,path,path+".stale-"+token);else File.Move(next,path);
    Console.WriteLine(Json.Serialize(record));Console.Out.Flush();
    // Closing the owning Node process closes this pipe. The OS mutex is the
    // atomic authority; metadata is evidence, never a TTL takeover mechanism.
    Console.In.ReadToEnd();
    RejectLinks(path);var current=Json.Deserialize<LeaseRecord>(File.ReadAllText(path));
    if(current==null||current.token!=token)throw new Exception("LOCK_RELEASE_TOKEN_MISMATCH");
    File.Delete(path);return 0;
   }finally{if(held)mutex.ReleaseMutex();}
  }
 }
}
