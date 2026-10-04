using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
static class LocalizationTests {
 static void Check(bool value,string name){if(!value)throw new Exception(name);}
 static int Main(string[] args){try{
  Console.OutputEncoding=new UTF8Encoding(false);var json=new JavaScriptSerializer();
  var cases=json.Deserialize<List<Dictionary<string,object>>>(File.ReadAllText(args[1],Encoding.UTF8));var locales=new List<string>();
  foreach(var row in cases)locales.Add(Localization.ResolveLocale(Convert.ToString(row["choice"]),Convert.ToString(row["system"])));
  var en=Localization.Load(args[0],"en");Check(en.Text("diagnostic.generic",new Dictionary<string,object>{{"code","HELPER_FAILED"}})=="Operation could not be confirmed. Code: HELPER_FAILED","English format");
  Check(en.Text("diagnostic.generic",new Dictionary<string,object>{{"code","<script>"}})=="Interface text is unavailable.","Unsafe parameter");
  Check(en.Text("diagnostic.generic",new Dictionary<string,object>{{"code","HELPER_FAILED"},{"command","SECRET"}})=="Interface text is unavailable.","Extra parameter");
  Check(en.Text("app.version",new Dictionary<string,object>{{"version","١.٢"}})=="Interface text is unavailable.","Version is ASCII in both runtimes");
  string copy=Path.Combine(args[2],"catalogue");Directory.CreateDirectory(copy);foreach(string file in Directory.GetFiles(args[0],"*.json"))File.Copy(file,Path.Combine(copy,Path.GetFileName(file)));
  var fr=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(copy,"fr.json"),Encoding.UTF8));((Dictionary<string,object>)fr["messages"]).Remove("button.enable");File.WriteAllText(Path.Combine(copy,"fr.json"),json.Serialize(fr),Encoding.UTF8);
  Check(Localization.Load(copy,"fr").Text("button.enable")==en.Text("button.enable"),"English fallback");File.WriteAllText(Path.Combine(copy,"en.json"),"{broken");Check(Localization.Load(copy,"en").Text("button.enable")=="Interface text is unavailable.","Built-in fallback");
  var schema=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(copy,"catalogue.json"),Encoding.UTF8));((Dictionary<string,object>)schema["messages"])["button.enable"]=null;File.WriteAllText(Path.Combine(copy,"catalogue.json"),json.Serialize(schema),Encoding.UTF8);Check(Localization.Load(copy,"fr").Text("button.enable")=="Interface text is unavailable.","Malformed schema fallback");
  string data=Path.Combine(args[2],"preferences"),path=Path.Combine(data,"manager-ui.json");Directory.CreateDirectory(data);File.WriteAllText(path,"CORRUPT-KEEP",Encoding.UTF8);byte[] before=File.ReadAllBytes(path);
  var read=UiSettings.Read(data);Check(read.Language=="auto"&&!String.IsNullOrEmpty(read.WarningCode),"Corrupt default");Check(Convert.ToBase64String(File.ReadAllBytes(path))==Convert.ToBase64String(before),"Read must not rewrite");
  Check(!UiSettings.Save(data,"../en").Saved,"Invalid choice rejected");Check(Convert.ToBase64String(File.ReadAllBytes(path))==Convert.ToBase64String(before),"Invalid choice preserves bytes");
  Check(UiSettings.Save(data,"ar").Saved&&UiSettings.Read(data).Language=="ar","Explicit save");string[] backups=Directory.GetFiles(data,"manager-ui.corrupt-*.json");Check(backups.Length==1&&Convert.ToBase64String(File.ReadAllBytes(backups[0]))==Convert.ToBase64String(before),"Corrupt bytes backed up");
  Check(UiSettings.Save(data,"auto").Saved&&UiSettings.Read(data).Language=="auto","Persist auto choice");
  using(var locked=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.None)){Check(!UiSettings.Save(data,"ru").Saved,"Locked preference does not report success");}
  Check(UiSettings.Read(data).Language=="auto","Failed save preserves choice");
  Console.WriteLine(json.Serialize(new {locales=locales,preferences=true,fallback=true,safeParameters=true}));return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
