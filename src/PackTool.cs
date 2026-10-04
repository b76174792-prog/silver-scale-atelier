using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.RegularExpressions;
class PackTool {
 static bool DataDirectory(string s){return s.EndsWith("/") && s.Length<170 && DataAllowed(s+"check.png");}
 static bool DataAllowed(string s){return s.Length<=180 && !s.Contains("\\") && !s.Split('/').Any(x=>x==""||x=="."||x==".."||Regex.IsMatch(x,@"[.: ]$|^(con|prn|aux|nul|com\d|lpt\d)(\.|$)",RegexOptions.IgnoreCase)) && Regex.IsMatch(s,@"^[-a-zA-Z0-9_./]+\.(png|md|json)$");}
 static bool Allowed(string s){return s.Length<=180 && !s.Contains("\\") && !s.Split('/').Any(x=>x==""||x=="."||x==".."||Regex.IsMatch(x,@"[.: ]$|^(con|prn|aux|nul|com\d|lpt\d)(\.|$)",RegexOptions.IgnoreCase)) && Regex.IsMatch(s,@"^(pack\.json|avatar\.webp|environment/l[123]-v3\.png|themes/(astra|q)-(day|night|focus)/(manifest\.json|styles/[a-zA-Z0-9_-]+\.css|assets/[a-zA-Z0-9_-]+\.(png|webp|svg)))$");}
 static int Main(string[] args){try{
  bool data=args.Length==3&&args[2]=="--data-pack";
  if(args.Length!=2&&!data)throw new Exception("Archive and empty destination required");
  if(new FileInfo(args[0]).Length>(data?64:160)*1024L*1024)throw new Exception("Archive too large");
  string target=Path.GetFullPath(args[1]);if(Directory.Exists(target)&&Directory.EnumerateFileSystemEntries(target).Any())throw new Exception("Destination must be empty");
  Directory.CreateDirectory(target);long total=0;int count=0;var names=new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
  using(var z=ZipFile.OpenRead(args[0])){
   foreach(var e in z.Entries){if(++count>(data?128:160)||!(data?(DataAllowed(e.FullName)||(e.Length==0&&DataDirectory(e.FullName))):Allowed(e.FullName))||!names.Add(e.FullName.TrimEnd('/'))||e.Length>8*1024*1024||((e.ExternalAttributes>>16)&0xF000)==0xA000)throw new Exception("Unsafe or oversized resource entry");total+=e.Length;if(total>(data?96:160)*1024L*1024)throw new Exception("Resource pack too large");}
   foreach(var e in z.Entries){string dest=Path.GetFullPath(Path.Combine(target,e.FullName));if(!dest.StartsWith(target+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Path containment failed");if(data&&e.FullName.EndsWith("/")){Directory.CreateDirectory(dest);continue;}Directory.CreateDirectory(Path.GetDirectoryName(dest));using(var input=e.Open())using(var output=new FileStream(dest,FileMode.CreateNew)){var buffer=new byte[65536];long written=0;int n;while((n=input.Read(buffer,0,buffer.Length))>0){written+=n;if(written>e.Length)throw new Exception("Archive length mismatch");output.Write(buffer,0,n);}if(written!=e.Length)throw new Exception("Archive truncated");}}
  }Console.WriteLine("{\"ok\":true}");return 0;
 }catch{Console.Error.WriteLine("Resource archive refused. No executable or arbitrary path is accepted.");return 10;}}
}
