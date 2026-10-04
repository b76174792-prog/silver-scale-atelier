using System;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
internal sealed class UiSettingsResult {
 internal string Language="auto",WarningCode="";
 internal bool Saved;
}
internal static class UiSettings {
 internal static UiSettingsResult Read(string dataRoot){
  var result=new UiSettingsResult();string file=Path.Combine(dataRoot,"manager-ui.json");
  try{Localization.NoLinks(file);if(!File.Exists(file))return result;if(new FileInfo(file).Length>65536)throw new IOException();
   var raw=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(file,Encoding.UTF8));
   string choice=Convert.ToString(Localization.Value(raw,"language"));if(Convert.ToString(Localization.Value(raw,"schemaVersion"))!="1"||!Localization.ValidChoice(choice))throw new FormatException();result.Language=choice;
  }catch{result.WarningCode="UI_SETTINGS_INVALID";}return result;
 }
 internal static UiSettingsResult Save(string dataRoot,string choice){
  var before=Read(dataRoot);if(!Localization.ValidChoice(choice))return new UiSettingsResult{Language=before.Language,WarningCode="UI_LANGUAGE_INVALID"};
  string file=Path.Combine(dataRoot,"manager-ui.json"),temp=file+"."+Guid.NewGuid().ToString("N")+".tmp";
  try{Localization.NoLinks(file);Directory.CreateDirectory(dataRoot);
   using(var stream=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){byte[] bytes=new UTF8Encoding(false).GetBytes(new JavaScriptSerializer().Serialize(new {schemaVersion=1,language=choice}));stream.Write(bytes,0,bytes.Length);stream.Flush(true);}
   if(File.Exists(file)){string backup=String.IsNullOrEmpty(before.WarningCode)?null:Path.Combine(dataRoot,"manager-ui.corrupt-"+Guid.NewGuid().ToString("N")+".json");File.Replace(temp,file,backup);}
   else File.Move(temp,file);
   return new UiSettingsResult{Saved=true,Language=choice};
  }catch{return new UiSettingsResult{Language=before.Language,WarningCode="UI_SETTINGS_NOT_SAVED"};}
  finally{try{if(File.Exists(temp))File.Delete(temp);}catch{}}
 }
}
