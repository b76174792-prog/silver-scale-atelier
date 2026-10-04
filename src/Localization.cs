using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Globalization;
using System.Web.Script.Serialization;
internal sealed class Localization {
 internal const string Unavailable="Interface text is unavailable.";
 internal static readonly string[] Locales={"zh-CN","en","es","fr","ar","ru"};
 internal string Locale {get;private set;}
 internal string Direction {get{return Locale=="ar"?"rtl":"ltr";}}
 readonly Dictionary<string,object> definitions;
 readonly Dictionary<string,string> messages=new Dictionary<string,string>();
 Localization(string locale,Dictionary<string,object> schema){Locale=locale;definitions=schema;}
 internal static string NormalizeLocale(string tag){string value=(tag??"").Replace('_','-').ToLowerInvariant().Split('-')[0];return value=="zh"?"zh-CN":Array.IndexOf(Locales,value)>=0?value:"en";}
 internal static bool ValidChoice(string choice){return choice=="auto"||Array.IndexOf(Locales,choice)>=0;}
 internal static string ResolveLocale(string choice,string systemUiLocale){if(choice=="auto")return NormalizeLocale(systemUiLocale);if(!ValidChoice(choice))throw new ArgumentException("Invalid language choice");return choice;}
 internal static Dictionary<string,object> Object(object value){return value as Dictionary<string,object>??new Dictionary<string,object>();}
 internal static object Value(Dictionary<string,object> value,string key){object result;return value.TryGetValue(key,out result)?result:null;}
 internal static void NoLinks(string path){for(var item=new FileInfo(Path.GetFullPath(path));item!=null;item=item.Directory==null?null:new FileInfo(item.Directory.FullName)){if((File.Exists(item.FullName)||Directory.Exists(item.FullName))&&(File.GetAttributes(item.FullName)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked path refused");}}
 static Dictionary<string,object> Read(string path){try{NoLinks(path);if(new FileInfo(path).Length>1024*1024)return new Dictionary<string,object>();return new JavaScriptSerializer{MaxJsonLength=1024*1024,RecursionLimit=24}.Deserialize<Dictionary<string,object>>(File.ReadAllText(path,Encoding.UTF8))??new Dictionary<string,object>();}catch{return new Dictionary<string,object>();}}
 static Dictionary<string,object> Words(string directory,string locale){var data=Read(Path.Combine(directory,locale+".json"));return Convert.ToString(Value(data,"locale"))==locale&&Convert.ToString(Value(data,"schemaVersion"))=="1"?Object(Value(data,"messages")):new Dictionary<string,object>();}
 static bool ValidText(string text,Dictionary<string,object> args){
  if(String.IsNullOrWhiteSpace(text)||text.Length>12000||text.IndexOfAny(new[]{'<','>'})>=0)return false;
  var names=new HashSet<string>();foreach(Match m in Regex.Matches(text,@"\{([A-Za-z0-9_]+)\}"))names.Add(m.Groups[1].Value);
  if(Regex.IsMatch(Regex.Replace(text,@"\{[A-Za-z0-9_]+\}",""),"[{}]"))return false;
  foreach(string key in args.Keys)if(!names.Contains(key))return false;foreach(string key in names)if(!args.ContainsKey(key))return false;return true;
 }
 static bool ValidSchema(Dictionary<string,object> schema){
  if(!(Value(schema,"schemaVersion") is int)||(int)Value(schema,"schemaVersion")!=1)return false;
  var defs=Value(schema,"messages") as Dictionary<string,object>;if(defs==null||defs.Count<1||defs.Count>512)return false;
  var languages=Object(Value(schema,"locales"));foreach(string locale in Locales)if(Convert.ToString(Value(Object(Value(languages,locale)),"direction"))!=(locale=="ar"?"rtl":"ltr"))return false;
  foreach(var pair in defs){if(!Regex.IsMatch(pair.Key,@"\A[A-Za-z0-9_.-]+\z"))return false;var args=Value(Object(pair.Value),"args") as Dictionary<string,object>;if(args==null)return false;
   foreach(var arg in args){if(!Regex.IsMatch(arg.Key,@"\A[A-Za-z0-9_]+\z"))return false;var rule=Object(arg.Value);string type=Convert.ToString(Value(rule,"type"));if(Array.IndexOf(new[]{"number","code","version","enum"},type)<0)return false;
    if(type=="enum"){var values=Value(rule,"values") as System.Collections.IList;if(values==null||values.Count<1||values.Count>64)return false;foreach(object value in values)if(!(value is string)||((string)value).Length>80)return false;}
   }
  }return true;
 }
 internal static Localization Load(string directory,string locale){
  locale=NormalizeLocale(locale);var raw=Read(Path.Combine(directory,"catalogue.json"));var defs=ValidSchema(raw)?Object(Value(raw,"messages")):new Dictionary<string,object>();
  var result=new Localization(locale,defs);var english=Words(directory,"en");var selected=locale=="en"?english:Words(directory,locale);
  foreach(var pair in defs){var args=Object(Value(Object(pair.Value),"args"));string chosen=Value(selected,pair.Key) as string,fallback=Value(english,pair.Key) as string;result.messages[pair.Key]=ValidText(chosen,args)?chosen:ValidText(fallback,args)?fallback:Unavailable;}
  return result;
 }
 internal string Text(string key,Dictionary<string,object> args=null){
  object definition;string text;if(!definitions.TryGetValue(key,out definition)||!messages.TryGetValue(key,out text))return Unavailable;
  var allowed=Object(Value(Object(definition),"args"));args=args??new Dictionary<string,object>();if(args.Count!=allowed.Count)return Unavailable;
  foreach(var pair in allowed){object value;if(!args.TryGetValue(pair.Key,out value))return Unavailable;var rule=Object(pair.Value);string type=Convert.ToString(Value(rule,"type"));
   if(type=="number"){if(!(value is int||value is long||value is double||value is decimal||value is float))return Unavailable;double n=Convert.ToDouble(value,CultureInfo.InvariantCulture);if(Double.IsNaN(n)||Double.IsInfinity(n)||Math.Abs(n)>1e12)return Unavailable;}
   else if(type=="code"){if(!(value is string)||!Regex.IsMatch((string)value,@"\A[A-Z0-9_.-]{1,80}\z"))return Unavailable;}
   else if(type=="version"){if(!(value is string)||((string)value).Length>48||!Regex.IsMatch((string)value,@"\A[0-9]+(?:\.[0-9]+){0,3}\z"))return Unavailable;}
   else if(type=="enum"){bool found=false;var values=Value(rule,"values") as System.Collections.IEnumerable;if(!(value is string)||values==null)return Unavailable;foreach(object entry in values)if(entry is string&&(string)entry==(string)value)found=true;if(!found)return Unavailable;}
   else return Unavailable;
  }
  return Regex.Replace(text,@"\{([A-Za-z0-9_]+)\}",m=>Convert.ToString(args[m.Groups[1].Value],CultureInfo.InvariantCulture));
 }
}
