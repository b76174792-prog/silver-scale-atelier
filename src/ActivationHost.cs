// BSD-3-Clause; local experiment based on ReTheme v0.1.4's MSIX activation.
// No process termination, credential access, or client file modification.
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.IO;
using System.Diagnostics;
using System.Linq;
using System.Collections.Generic;
using System.Management;
using System.Web.Script.Serialization;
using System.Text.RegularExpressions;
using System.Threading;

class Listener { public int pid; public string address; }
class ClientIdentity { public int pid; public long createdMs,createdMicros; public string command, executable; }
class Receipt {
    public int pid; public int[] existingPids; public long launchMs; public long startedMs;
    public string expectedProfile; public string actualProfile; public string executable;
    public int port; public List<Listener> listeners;
    public int proofVersion; public string proofKind; public string confirmationId; public long reboundMs;
}

[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IApplicationActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string app, [MarshalAs(UnmanagedType.LPWStr)] string args, uint options, out uint processId);
    [PreserveSig] int ActivateForFile(IntPtr app, IntPtr items, IntPtr verb, out uint processId);
    [PreserveSig] int ActivateForProtocol(IntPtr app, IntPtr items, out uint processId);
}
class ActivationHost {
    static string OwnProfile=DataPaths.ProfileArgument;
    static JavaScriptSerializer Json = new JavaScriptSerializer();
    static long Milliseconds(DateTime dt) { return (dt.ToUniversalTime().Ticks-621355968000000000L)/10000; }
    static List<Listener> Listeners(int port) {
        var rows = new List<Listener>();
        var start = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory,"netstat.exe"),"-ano") {UseShellExecute=false,RedirectStandardOutput=true,CreateNoWindow=true};
        using(var process=Process.Start(start)) {
            string output=process.StandardOutput.ReadToEnd();process.WaitForExit();if(process.ExitCode!=0)throw new Exception("Listener inspection failed");
            foreach(string line in output.Split('\n')) {
                var m=Regex.Match(line,@"^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$");
                if(!m.Success)continue; string endpoint=m.Groups[1].Value;int colon=endpoint.LastIndexOf(':');int localPort;
                if(colon<0 || !int.TryParse(endpoint.Substring(colon+1),out localPort) || localPort!=port)continue;
                rows.Add(new Listener{pid=int.Parse(m.Groups[2].Value),address=endpoint.Substring(0,colon).Trim('[',']')});
            }
        }return rows;
    }
    static Receipt Inspect(Receipt record) {
        if(!string.Equals(Path.GetFullPath(record.expectedProfile??"."),OwnProfile,StringComparison.OrdinalIgnoreCase))throw new Exception("Foreign profile refused");
        NativeLease.RejectLinks(OwnProfile);NativeLease.RejectLinks(DataPaths.ProfileStorage);
        bool rebound=record.proofVersion==2 && record.proofKind=="explicit-rebind" && !String.IsNullOrEmpty(record.confirmationId) && record.reboundMs>0;
        if(record.existingPids==null)throw new Exception("Missing launch proof");
        if(!rebound && record.existingPids.Contains(record.pid))throw new Exception("Existing process refused; no injection or termination");
        using(var p=Process.GetProcessById(record.pid)) {
            long started=Milliseconds(p.StartTime);
            if((!rebound && started<record.launchMs) || (record.startedMs!=0 && record.startedMs!=started) || (rebound && record.startedMs==0))throw new Exception("Process creation time mismatch");
            if(p.ProcessName!="ChatGPT")throw new Exception("Process name mismatch");
            using(var search=new ManagementObjectSearcher("SELECT CommandLine,ExecutablePath FROM Win32_Process WHERE ProcessId="+record.pid)) {
                var values=search.Get();if(values.Count!=1)throw new Exception("Process metadata unavailable");
                foreach(ManagementObject value in values) {
                    if(!string.Equals(Convert.ToString(value["ExecutablePath"]),record.executable,StringComparison.OrdinalIgnoreCase))throw new Exception("Executable mismatch");
                    string command=Convert.ToString(value["CommandLine"]), token="--user-data-dir="+record.expectedProfile;
                    if(!Regex.IsMatch(command,"(?:^|\\s)\""+Regex.Escape(token)+"\"(?:\\s|$)") && !Regex.IsMatch(command,"(?:^|\\s)"+Regex.Escape(token)+"(?:\\s|$)"))throw new Exception("Requested profile not confirmed");
                }
            }
            record.startedMs=started;record.actualProfile=record.expectedProfile;
        }
        record.listeners=Listeners(record.port);
        if(record.listeners.Count==0 || record.listeners.Any(l=>l.pid!=record.pid || (l.address!="127.0.0.1" && l.address!="::1")))throw new Exception("Port owner or loopback scope failed");
        return record;
    }
    internal static bool ReceiptProcessAbsent(Receipt record) {
        if(record==null || record.pid<=0 || record.existingPids==null || record.launchMs<=0 ||
           !String.Equals(Path.GetFullPath(record.expectedProfile??"."),OwnProfile,StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid owned launch receipt");
        // An existing PID, even a reused or unreadable one, is never absence proof.
        try {using(var process=Process.GetProcessById(record.pid)){return false;}}
        catch(ArgumentException){return true;}
    }
    static string Quote(string arg) {
        if (arg.IndexOf('"') >= 0 || arg.EndsWith("\\") || arg.IndexOf('\n') >= 0 || arg.IndexOf('\r') >= 0) throw new ArgumentException("Unsafe argument");
        return "\"" + arg + "\"";
    }
    [STAThread] static int Main(string[] args) {
      Console.OutputEncoding=new UTF8Encoding(false); try { return Run(args); } catch(Exception e) {
        var diagnostic=e.Data["diagnostics"]??new Dictionary<string,object>{{"stage","native"},{"exceptionType",e.GetType().Name},{"hresult",e.HResult}};
        Console.Error.WriteLine(Json.Serialize(new{message=e.Message,diagnostics=diagnostic}));return 10;
      }
    }
    static void WriteReceipt(string path,Receipt record) {
        NativeLease.RejectLinks(path);string next=path+"."+Guid.NewGuid().ToString("N")+".next";
        File.WriteAllText(next,Json.Serialize(record),new UTF8Encoding(false));Inspect(record);
        if(File.Exists(path))File.Replace(next,path,path+".backup-"+Guid.NewGuid().ToString("N"));else File.Move(next,path);
    }
    [DllImport("shell32.dll",SetLastError=true)] static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string command,out int count);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    static string[] Arguments(string command) {
        int count;IntPtr memory=CommandLineToArgvW(command,out count);
        if(memory==IntPtr.Zero)throw new Exception("Client arguments unavailable");
        try {var args=new string[count];for(int i=0;i<count;i++)args[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory,i*IntPtr.Size));return args;}
        finally {LocalFree(memory);}
    }
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr handle,out long created,out long ended,out long kernel,out long user);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr handle,uint flags,StringBuilder path,ref uint size);
    internal static Dictionary<string,object> IdentityDiagnostic(ClientIdentity row) {
        var d=new Dictionary<string,object>{{"stage","client-identity"},{"pid",row.pid},{"createdMs",row.createdMs},{"createdMicros",row.createdMicros},{"commandAvailable",!String.IsNullOrEmpty(row.command)},{"executableAvailable",!String.IsNullOrEmpty(row.executable)},{"openError",0},{"timesError",0},{"waitResult",UInt32.MaxValue},{"waitError",0},{"imageError",0},{"observedCreatedMs",0L},{"observedCreatedMicros",0L}};
        // Query and wait refer to the same pinned process object. A PID alone,
        // missing WMI metadata, or exit code 259 is never termination proof.
        IntPtr handle=OpenProcess(0x00101000,false,row.pid);
        if(handle==IntPtr.Zero){d["openError"]=Marshal.GetLastWin32Error();return d;}
        try{
            long created,ended,kernel,user;
            if(GetProcessTimes(handle,out created,out ended,out kernel,out user)){d["observedCreatedMs"]=(created-116444736000000000L)/10000;d["observedCreatedMicros"]=(created-116444736000000000L)/10;}
            else d["timesError"]=Marshal.GetLastWin32Error();
            uint wait=WaitForSingleObject(handle,0);d["waitResult"]=wait;if(wait==UInt32.MaxValue)d["waitError"]=Marshal.GetLastWin32Error();
            uint size=32768;var path=new StringBuilder((int)size);
            if(!QueryFullProcessImageName(handle,0,path,ref size))d["imageError"]=Marshal.GetLastWin32Error();
            return d;
        }finally{CloseHandle(handle);}
    }
    static bool ProvedEnded(ClientIdentity row,Dictionary<string,object> d) {
        return row.createdMs>0&&row.createdMicros>0&&Convert.ToInt32(d["openError"])==0&&Convert.ToInt32(d["timesError"])==0&&Convert.ToInt64(d["observedCreatedMs"])==row.createdMs&&Convert.ToInt64(d["observedCreatedMicros"])==row.createdMicros&&Convert.ToUInt32(d["waitResult"])==0;
    }
    static Exception IdentityFailure(ClientIdentity row,string message) {var e=new Exception(message);e.Data["diagnostics"]=IdentityDiagnostic(row);return e;}
    static List<ClientIdentity> ClientIdentities() {
        var processes=new List<ClientIdentity>();
        try{
            using(var search=new ManagementObjectSearcher("SELECT ProcessId,CreationDate,CommandLine,ExecutablePath FROM Win32_Process WHERE Name='ChatGPT.exe'")) {
                foreach(ManagementObject row in search.Get()) {
                    string created=Convert.ToString(row["CreationDate"]);long createdMs=0,createdMicros=0;
                    if(!String.IsNullOrEmpty(created)){try{var time=ManagementDateTimeConverter.ToDateTime(created);createdMs=Milliseconds(time);createdMicros=(time.ToUniversalTime().Ticks-621355968000000000L)/10;}catch{}}
                    processes.Add(new ClientIdentity{pid=Convert.ToInt32(row["ProcessId"]),createdMs=createdMs,createdMicros=createdMicros,command=Convert.ToString(row["CommandLine"]),executable=Convert.ToString(row["ExecutablePath"])});
                }
            }return processes;
        }catch(ManagementException e){e.Data["diagnostics"]=new Dictionary<string,object>{{"stage","enumerate-client-identities"},{"hresult",e.HResult},{"managementError",(int)e.ErrorCode}};throw;}
    }
    internal static int? SelectRebindPid(IEnumerable<ClientIdentity> processes,string executable,string profile) {
        var candidates=new List<int>();
        foreach(var row in processes) {
            if(String.IsNullOrEmpty(row.command)){
                var diagnostic=IdentityDiagnostic(row);
                if(ProvedEnded(row,diagnostic))continue;
                var error=new Exception("Client identity unavailable");error.Data["diagnostics"]=diagnostic;throw error;
            }
            var args=Arguments(row.command).Skip(1).ToArray();
            if(!args.Contains("--user-data-dir="+profile))continue;
            // Electron crash handlers inherit the profile argument. Only its browser
            // process is a client candidate; the listener owner is still verified below.
            if(args.Any(a=>a=="--type" || a.StartsWith("--type=",StringComparison.Ordinal)))continue;
            if(!String.Equals(row.executable,executable,StringComparison.OrdinalIgnoreCase))throw IdentityFailure(row,"Dedicated client executable mismatch");
            candidates.Add(row.pid);
        }
        if(candidates.Count>1)throw new Exception("Multiple dedicated candidates; refused");
        return candidates.Count==0?(int?)null:candidates[0];
    }
    static Receipt RebindCandidate(string executable) {
        executable=Path.GetFullPath(executable);NativeLease.RejectLinks(OwnProfile);NativeLease.RejectLinks(DataPaths.ProfileStorage);
        if(Path.GetFileName(executable)!="ChatGPT.exe" || !executable.StartsWith(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"WindowsApps")+"\\",StringComparison.OrdinalIgnoreCase) || !File.Exists(executable))throw new Exception("Unexpected official package identity");
        var processes=ClientIdentities();
        int? candidate=SelectRebindPid(processes,executable,OwnProfile);
        if(!candidate.HasValue)return null;
        string portFile=Path.Combine(DataPaths.ProfileStorage,"DevToolsActivePort");
        NativeLease.RejectLinks(portFile);
        if(!File.Exists(portFile))throw new Exception("Dedicated client connection file is not ready; no receipt was changed");
        int port=int.Parse(File.ReadLines(portFile).First());
        using(var process=Process.GetProcessById(candidate.Value))return Inspect(new Receipt{pid=process.Id,existingPids=new int[0],launchMs=0,startedMs=Milliseconds(process.StartTime),expectedProfile=OwnProfile,executable=executable,port=port,proofVersion=2,proofKind="explicit-rebind",confirmationId=Guid.NewGuid().ToString(),reboundMs=Milliseconds(DateTime.UtcNow)});
    }
    static int Run(string[] args) {
        if(args.Length==1&&args[0]=="--identity-diagnostics") {Console.WriteLine(Json.Serialize(new{at=DateTime.UtcNow.ToString("o"),rows=ClientIdentities().Select(row=>IdentityDiagnostic(row)).ToArray()}));return 0;}
        if(args.Length==1 && args[0]=="--data-paths"){Console.WriteLine(Json.Serialize(new{dataRoot=DataPaths.Root,profileArgument=OwnProfile,profileStorage=DataPaths.ProfileStorage}));return 0;}
        if(args.Length==2 && args[0]=="--inspect-lock")return NativeLease.Inspect(args[1]);
        if(args.Length==6 && args[0]=="--hold-lock")return NativeLease.Hold(args[1],int.Parse(args[2]),args[3],args[4],args[5]);
        if(args.Length==2 && args[0]=="--rebind-candidate") {var candidate=RebindCandidate(args[1]);Console.WriteLine(Json.Serialize(new{state=candidate==null?"absent":"verified_candidate",candidate=candidate}));return 0;}
        if(args.Length==2 && args[0]=="--startup-state") {
            string path=Path.GetFullPath(args[1]);
            if(!String.Equals(path,Path.Combine(DataPaths.Root,"launcher-receipt.json"),StringComparison.OrdinalIgnoreCase))throw new Exception("Foreign receipt path");
            NativeLease.RejectLinks(path);NativeLease.RejectLinks(OwnProfile);NativeLease.RejectLinks(DataPaths.ProfileStorage);
            bool fresh=!File.Exists(path)||ReceiptProcessAbsent(Json.Deserialize<Receipt>(File.ReadAllText(path)));
            Console.WriteLine(Json.Serialize(new{state=fresh?"fresh":"rebind"}));return 0;
        }
        if(args.Length==3 && args[0]=="--commit-rebind") {
            var candidate=Json.Deserialize<Receipt>(File.ReadAllText(args[1]));
            if(candidate.proofKind!="explicit-rebind" || Milliseconds(DateTime.UtcNow)-candidate.reboundMs>30000)throw new Exception("Recovery proof expired");
            if(!String.Equals(Path.GetFullPath(args[2]),Path.Combine(DataPaths.Root,"launcher-receipt.json"),StringComparison.OrdinalIgnoreCase))throw new Exception("Foreign receipt path");
            Inspect(candidate);WriteReceipt(args[2],candidate);Console.WriteLine(Json.Serialize(candidate));return 0;
        }

        if(args.Length==1 && args[0]=="--detect") {
            string script="$p=Get-AppxPackage -Name OpenAI.Codex | Where-Object {$_.PackageFamilyName -eq 'OpenAI.Codex_2p2nqsd0c76g0'} | Select-Object -First 1; if($p){$m=Get-AppxPackageManifest -Package $p; $a=$m.Package.Applications.Application | Where-Object {$_.Id -eq 'App'} | Select-Object -First 1; [pscustomobject]@{family=$p.PackageFamilyName;version=$p.Version.ToString();architecture=$p.Architecture.ToString();signature=$p.SignatureKind.ToString();aumid=($p.PackageFamilyName+'!App');executable=(Join-Path $p.InstallLocation $a.Executable)} | ConvertTo-Json -Compress}else{'null'}";
            var start=new ProcessStartInfo(Path.Combine(Environment.SystemDirectory,@"WindowsPowerShell\v1.0\powershell.exe"),"-NoProfile -NonInteractive -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(script))){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8};
            using(var d=Process.Start(start)){string text=d.StandardOutput.ReadToEnd();d.WaitForExit();if(d.ExitCode!=0)throw new Exception("Official package detection failed");Console.WriteLine(text.Trim());return 0;}
        }
        if(args.Length == 1 && args[0] == "--self-test") {
            if(Quote("--user-data-dir=C:\\A B\\Profile") != "\"--user-data-dir=C:\\A B\\Profile\"") return 1;
            try { Quote("bad\"argument"); return 1; } catch(ArgumentException) {}
            var current=Process.GetCurrentProcess();
            try { Inspect(new Receipt{pid=current.Id,existingPids=new[]{current.Id},expectedProfile=OwnProfile});return 1; }
            catch(Exception e) { if(!e.Message.StartsWith("Existing process refused"))throw; }
            Console.WriteLine("ActivationHost argument tests PASS; activation was not invoked.");return 0;
        }
        if(args.Length==3 && args[0]=="--confirmed-show") {
            var receipt=Inspect(Json.Deserialize<Receipt>(File.ReadAllText(args[2])));
            if(!args[1].StartsWith("OpenAI.Codex_") || !args[1].EndsWith("!App"))throw new Exception("Unexpected package identity");
            uint shown=Activate(args[1],receipt.expectedProfile,"probe");
            // MSIX can return a short-lived single-instance forwarding process.
            // Retain and revalidate the existing receipt; never adopt the returned PID.
            Inspect(receipt);
            Console.WriteLine(Json.Serialize(new {showRequested=true,verifiedPid=receipt.pid,activationReturnedSamePid=shown==receipt.pid}));return 0;
        }
        if(args.Length==2 && (args[0]=="--inspect" || args[0]=="--confirmed-stop")) {
            var receipt=Inspect(Json.Deserialize<Receipt>(File.ReadAllText(args[1])));
            if(args[0]=="--inspect"){Console.WriteLine(Json.Serialize(receipt));return 0;}
            using(var process=Process.GetProcessById(receipt.pid)) {
                if(Milliseconds(process.StartTime)!=receipt.startedMs || process.HasExited)throw new Exception("Process changed before close; no termination attempted");
                if(!process.CloseMainWindow())throw new Exception("Normal close unavailable; close only the test window manually. No force kill attempted.");
            }
            for(int n=0;n<100 && Listeners(receipt.port).Count!=0;n++)Thread.Sleep(200);
            if(Listeners(receipt.port).Count!=0)throw new Exception("Debug port still listens; manual test-window close required");
            int[] remaining=Process.GetProcessesByName("ChatGPT").Select(p=>p.Id).ToArray();
            Console.WriteLine(Json.Serialize(new {portClosed=true,clientExited=!remaining.Contains(receipt.pid),originalPidsMissing=receipt.existingPids.Where(p=>!remaining.Contains(p)).ToArray(),profilesDeleted=false}));return 0;
        }
        if(args.Length==4 && (args[0]=="--confirmed-start" || args[0]=="--confirmed-start-persistent" || args[0]=="--confirmed-start-launcher")) {
          bool persistent=args[0]!="--confirmed-start";
          using(var launchLock=new Mutex(false,"Local\\SilverScaleAtelierManagerLaunch")) {
            if(!launchLock.WaitOne(0))throw new Exception("Another theme launch is in progress");
          try {
            string app=args[1], executable=Path.GetFullPath(args[2]), receiptPath=Path.GetFullPath(args[3]);
            if(!String.Equals(receiptPath,Path.Combine(DataPaths.Root,"launcher-receipt.json"),StringComparison.OrdinalIgnoreCase))throw new Exception("Foreign receipt path");
            if(!app.StartsWith("OpenAI.Codex_") || !app.EndsWith("!App") || Path.GetFileName(executable)!="ChatGPT.exe" || !executable.StartsWith(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"WindowsApps")+"\\",StringComparison.OrdinalIgnoreCase) || !File.Exists(executable))throw new Exception("Unexpected official package identity");
            if(FileVersionInfo.GetVersionInfo(executable).FileMajorPart<1)throw new Exception("Official executable metadata unavailable");
            int[] existing=Process.GetProcessesByName("ChatGPT").Select(p=>p.Id).ToArray();
            string profile=OwnProfile;
            using(var search=new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE Name='ChatGPT.exe'")) {
                foreach(ManagementObject value in search.Get())if(Convert.ToString(value["CommandLine"]).IndexOf(profile,StringComparison.OrdinalIgnoreCase)>=0)throw new Exception("This profile already has an active client; reuse its receipt or close its window normally");
            }
            NativeLease.RejectLinks(OwnProfile);NativeLease.RejectLinks(DataPaths.ProfileStorage);NativeLease.RejectLinks(receiptPath);
            if(!persistent && Directory.Exists(DataPaths.ProfileStorage))throw new Exception("Profile collision");Directory.CreateDirectory(DataPaths.ProfileStorage);
            string portFile=Path.Combine(DataPaths.ProfileStorage,"DevToolsActivePort");
            NativeLease.RejectLinks(portFile);
            long previousPortWrite=File.Exists(portFile)?File.GetLastWriteTimeUtc(portFile).Ticks:0;
            long launch=Milliseconds(DateTime.UtcNow);
            uint started=Activate(app,profile,"probe");
            if(existing.Contains((int)started))throw new Exception("Activation returned existing PID; stopped without injection or cleanup");
            for(int n=0;n<300 && (!File.Exists(portFile) || File.GetLastWriteTimeUtc(portFile).Ticks==previousPortWrite);n++)Thread.Sleep(200);
            if(!File.Exists(portFile) || File.GetLastWriteTimeUtc(portFile).Ticks==previousPortWrite)throw new Exception("Requested profile has no fresh debug port. No injection/termination. New PID="+started);
            var record=new Receipt{pid=(int)started,existingPids=existing,launchMs=launch,expectedProfile=profile,executable=executable,port=int.Parse(File.ReadLines(portFile).First())};
            record=Inspect(record);WriteReceipt(receiptPath,record);
            Console.WriteLine(Json.Serialize(new{pid=record.pid,port=record.port,receipt=receiptPath,themeApplied=false}));return 0;
          } finally { launchLock.ReleaseMutex(); }
          }
        }
        // Raw activation is intentionally unavailable: only guarded start is exposed.
        return 2;
    }
    static uint Activate(string app,string profile,string mode) {
        string commandLine = Quote("--user-data-dir=" + profile) + " --no-first-run";
        if(mode == "probe") commandLine += " --remote-debugging-address=127.0.0.1 --remote-debugging-port=0";
        object instance = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")));
        try {
            uint pid; int status = ((IApplicationActivationManager)instance).ActivateApplication(app,commandLine,0,out pid);
            Marshal.ThrowExceptionForHR(status);return pid;
        } catch(COMException e) {throw new Exception("MSIX activation failed: 0x"+e.ErrorCode.ToString("X8"));}
        finally {Marshal.FinalReleaseComObject(instance);}
    }
}

