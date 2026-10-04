using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Globalization;
[assembly:System.Reflection.AssemblyVersion("1.0.0.1")]
[assembly:System.Reflection.AssemblyFileVersion("1.0.0.1")]
[assembly:System.Reflection.AssemblyInformationalVersion("1.0.0-beta.1")]
static class Entry {
 internal static string Root=AppDomain.CurrentDomain.BaseDirectory;
 internal static string Data=DataPaths.Root;
 internal static JavaScriptSerializer Json=new JavaScriptSerializer();
 internal static UiContext Ui;
 internal static UiContext CurrentUi {get{if(Ui==null){var settings=UiSettings.Read(Data);Ui=UiContext.Create(settings.Language,CultureInfo.CurrentUICulture.Name,Path.Combine(Root,"localization"));Ui.WarningCode=settings.WarningCode;}return Ui;}}
 internal static string Quote(string s){if(s.IndexOfAny(new[]{'"','\r','\n'})>=0||s.EndsWith("\\"))throw LocalError("INVALID_OPERATION_ID","无效路径参数","error.invalidRequest");return "\""+s+"\"";}
 internal const int OperationBudgetMs=120000,CleanupReserveMs=10000;
 static readonly object ActiveGate=new object();static string activeOperation;
 internal static Exception LocalError(string code,string message,string key){var e=new Exception(message);e.Data["errorCode"]=code;e.Data["messageKey"]=key;e.Data["args"]=new Dictionary<string,object>();return e;}
 internal static Dictionary<string,object> ExceptionRecord(Exception e){return new Dictionary<string,object>{{"error",e.Data["error"]??e.Message},{"errorCode",e.Data["errorCode"]??"LOCAL_FAILURE"},{"messageKey",e.Data["messageKey"]??""},{"args",e.Data["args"]??new Dictionary<string,object>()},{"operationId",e.Data["operationId"]}};}
 internal static string ExceptionText(Exception e){var record=ExceptionRecord(e);return DiagnosticPresentation.Render(record,CurrentUi.Catalogue)+Environment.NewLine+DiagnosticPresentation.RawDetails(record);}
 internal static void CancelActive(){lock(ActiveGate){if(activeOperation!=null){Directory.CreateDirectory(Data);File.WriteAllText(Path.Combine(Data,"cancel-"+activeOperation+".request"),"cancel");}}}
 internal static Dictionary<string,object> ParseRuntimeResponse(string text){
  Dictionary<string,object> result;try{result=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(text.Trim());if(result==null||!result.ContainsKey("ok")||!(result["ok"] is bool))throw new FormatException();}catch{throw LocalError("HELPER_PROTOCOL","[HELPER_PROTOCOL] 帮助进程没有返回可核验结果，请保留诊断。","error.protocol");}
  if(!(bool)result["ok"]){string code=Convert.ToString(Localization.Value(result,"errorCode")??"LOCAL_FAILURE"),raw=Convert.ToString(Localization.Value(result,"error")??"操作未确认");var error=new Exception("["+code+"] "+raw);error.Data["errorCode"]=code;error.Data["error"]=raw;
   string key=Convert.ToString(Localization.Value(result,"messageKey"));var args=Localization.Object(Localization.Value(result,"args"));
   if((key.StartsWith("error.",StringComparison.Ordinal)||key=="diagnostic.generic")&&CurrentUi.Catalogue.Text(key,args)!=Localization.Unavailable){error.Data["messageKey"]=key;error.Data["args"]=args;}
   throw error;
  }return result;
 }
 internal static Dictionary<string,object> Run(string action,string value=null){
  string id=Guid.NewGuid().ToString();bool mutation=action!="status"&&action!="detect"&&action!="packs"&&action!="pack-details";
  long deadline=(DateTime.UtcNow.Ticks-621355968000000000L)/10000+OperationBudgetMs;
  string arguments=Quote(Path.Combine(Root,"runtime","manager.mjs"))+" "+Quote(action)+" "+Quote(value??"")+" "+Quote(id)+" "+deadline;
  var start=new ProcessStartInfo(Path.Combine(Root,"bin","node.exe"),arguments){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};start.EnvironmentVariables["SILVER_SCALE_UI_LOCALE"]=Localization.ResolveLocale(UiSettings.Read(Data).Language,CultureInfo.CurrentUICulture.Name);
  if(mutation)lock(ActiveGate)activeOperation=id;
  try{using(var process=Process.Start(start)){
   var stderr=process.StandardError.ReadToEndAsync();var stdout=process.StandardOutput.ReadToEndAsync();
   if(!process.WaitForExit(OperationBudgetMs-CleanupReserveMs)){
    if(mutation){Directory.CreateDirectory(Data);File.WriteAllText(Path.Combine(Data,"cancel-"+id+".request"),"deadline");}
    if(!process.WaitForExit(CleanupReserveMs))throw LocalError("UNKNOWN","[UNKNOWN] 操作已超时并请求取消，最终状态待确认。请重新检测或停止连接。","error.deadline");
   }
   var result=ParseRuntimeResponse(stdout.GetAwaiter().GetResult());stderr.GetAwaiter().GetResult();if(mutation)result["operationId"]=id;return result;
  }}catch(Exception e){if(mutation)e.Data["operationId"]=id;throw;}finally{if(mutation)lock(ActiveGate){if(activeOperation==id)activeOperation=null;}}
 }
 internal static void RequestShutdown(Action stop,string mutexName,int waitMs){
  Directory.CreateDirectory(Data);File.WriteAllText(Path.Combine(Data,"gui-exit.request"),DateTime.UtcNow.ToString("o"));
  // The GUI owns restoration until it exits. Hold the same mutex during fallback cleanup.
  using(var mutex=new Mutex(false,mutexName)){
   bool acquired=false;
   try{
    try{acquired=mutex.WaitOne(waitMs);}catch(AbandonedMutexException){acquired=true;}
    if(!acquired)throw LocalError("UNKNOWN","[UNKNOWN] 管理器尚未安全退出，请在窗口中完成停止后重试。","error.deadline");
    stop();
   }finally{if(acquired)mutex.ReleaseMutex();}
  }
 }
 [STAThread] static int Main(string[] args){
  try{
   if(args.Length>0){if(args[0]=="--shutdown"){RequestShutdown(()=>Run("stop"),"Local\\SilverScaleAtelierManagerGUI",OperationBudgetMs+CleanupReserveMs);return 0;}if(args[0]=="--cleanup"){Run("cleanup");return 0;}if(args[0]=="--check"){var result=Run("status");File.WriteAllText(Path.Combine(Data,"manager-check.json"),Json.Serialize(result),Encoding.UTF8);return 0;}return 2;}
   bool created;using(var mutex=new Mutex(true,"Local\\SilverScaleAtelierManagerGUI",out created)){
    if(!created){LocalizedConfirm.ShowText(null,CurrentUi,"app.title",CurrentUi.Catalogue.Text("app.alreadyOpen"));return 0;}
    Directory.CreateDirectory(Data);string signal=Path.Combine(Data,"gui-exit.request");if(File.Exists(signal))File.Delete(signal);
    Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new ManagerForm());return 0;
   }
  }catch(Exception){if(args.Length==0)LocalizedConfirm.ShowText(null,CurrentUi,"app.title",CurrentUi.Catalogue.Text("app.failed"));return 10;}
 }
}
class ManagerForm:Form {
 internal string LastExitRestoration="unknown";
 UiContext ui;readonly Func<string,string,Dictionary<string,object>> run;
 string lastActionOperationId;Dictionary<string,object> lastAction,lastStatus;
 Label detected,live,resource,summary,languageStatus;TextBox detail,installPath,dataPath,clientDetails;
 ComboBox theme,density,language;Button enable,off,import,disconnect;bool busy,operationQueued,closing,loading,initialized;
 int localeGeneration;bool localeSaveFailed;Dictionary<string,object> localeFailure;string failedLocale;
 readonly ExitRequest exitRequest=new ExitRequest();readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
 readonly string[] themeIds={"astra-night","astra-day","astra-focus"},densities={"simple","balanced","rich"};
 static string Value(Dictionary<string,object> d,string key){return d!=null&&d.ContainsKey(key)?Convert.ToString(d[key]):"";}
 static bool Flag(Dictionary<string,object> d,string key){return d!=null&&d.ContainsKey(key)&&d[key] is bool&&(bool)d[key];}
 string T(string key){return ui.Catalogue.Text(key);}
 internal static string DiagnosticText(Dictionary<string,object> status,string fallback,string localOperationId=null){
  var locale=Entry.CurrentUi.Catalogue;string text=fallback;var operation=Localization.Object(Localization.Value(status,"operation"));
  bool operationFailure=(Value(operation,"result")=="failed"||Value(operation,"result")=="unknown"||Value(operation,"result")=="cancelled")&&!String.IsNullOrEmpty(Value(operation,"error"));
  bool currentOperation=!String.Equals(Value(operation,"reconciled"),"True",StringComparison.OrdinalIgnoreCase)&&(String.IsNullOrEmpty(localOperationId)||Value(operation,"operationId")==localOperationId);
  if(!String.IsNullOrEmpty(Value(status,"failure")))text=DiagnosticPresentation.Render(status,locale)+"\r\n"+DiagnosticPresentation.RawDetails(status);
  else if(operationFailure&&currentOperation){
   text=DiagnosticPresentation.Render(operation,locale)+"\r\n"+DiagnosticPresentation.RawDetails(operation);
   if(!String.IsNullOrEmpty(Value(operation,"finishedAt")))text+="\r\n"+locale.Text("label.time")+": "+Value(operation,"finishedAt");
   string uncertainty=Value(operation,"uncertaintyReason");if(uncertainty=="local_migration_committed")text+="\r\n"+locale.Text("status.localMigration");else if(uncertainty=="external_request_unconfirmed")text+="\r\n"+locale.Text("status.externalPending");else if(uncertainty=="local_change_committed")text+="\r\n"+locale.Text("status.localChange");
  }
  if(operationFailure&&!currentOperation)text+="\r\n"+locale.Text("status.historicalOperation")+" ("+(String.IsNullOrEmpty(Value(operation,"finishedAt"))?locale.Text("status.missingTime"):Value(operation,"finishedAt"))+"; operation-current.json): "+DiagnosticPresentation.Render(operation,locale)+"\r\n"+DiagnosticPresentation.RawDetails(operation);
  var history=Localization.Value(status,"historicalFailure") as Dictionary<string,object>;if(history!=null)text+="\r\n"+locale.Text("status.historicalError")+" ("+Value(history,"at")+"; "+Value(history,"source")+"): "+DiagnosticPresentation.Render(history,locale)+"\r\n"+DiagnosticPresentation.RawDetails(history);
  return text;
 }
 internal static string RestorationText(object value){string state=Convert.ToString(value);return Entry.CurrentUi.Catalogue.Text("restoration."+(state=="confirmed"||state=="lease_pending"?state:"unknown"));}
 public ManagerForm():this(Entry.Run,Entry.CurrentUi){}
 internal ManagerForm(Func<string,string,Dictionary<string,object>> runner,UiContext context){
  run=runner;ui=context;Entry.Ui=ui;ManagerLayout.Style(this,new Size(960,820));StartPosition=FormStartPosition.CenterScreen;try{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);}catch{}
  var table=ManagerLayout.Table(this);var title=ManagerLayout.Label("heading","app.title",ui);title.Font=new Font(Font.FontFamily,18,FontStyle.Bold);ManagerLayout.Row(table,title);ManagerLayout.Row(table,ManagerLayout.Label("subtitle","app.subtitle",ui));
  language=ManagerLayout.Combo("languageChoice");language.Width=380;ManagerLayout.Row(table,ManagerLayout.Flow(ManagerLayout.Label("languageLabel","label.language",ui),language));languageStatus=ManagerLayout.Label("languageStatus","status.localePending",ui);languageStatus.Tag=null;languageStatus.Text="";ManagerLayout.Row(table,languageStatus);
  detected=ManagerLayout.Label("detected","status.detecting",ui);ManagerLayout.Row(table,detected);clientDetails=ManagerLayout.ReadOnly("clientDetails",42);ManagerLayout.Row(table,clientDetails);
  resource=ManagerLayout.Label("resource","status.resourcesReady",ui);live=ManagerLayout.Label("live","status.disconnected",ui);live.ForeColor=Color.FromArgb(220,204,156);ManagerLayout.Row(table,resource);ManagerLayout.Row(table,live);
  theme=ManagerLayout.Combo("themeChoice");density=ManagerLayout.Combo("densityChoice");density.Width=450;ManagerLayout.Row(table,ManagerLayout.Flow(theme,density));ManagerLayout.Row(table,ManagerLayout.Label("modeHint","app.modeHint",ui));
  enable=ManagerLayout.Button("enable","button.enable",ui);off=ManagerLayout.Button("off","button.off",ui);disconnect=ManagerLayout.Button("stop","button.stop",ui);var refresh=ManagerLayout.Button("refresh","button.refresh",ui);ManagerLayout.Row(table,ManagerLayout.Flow(enable,off,disconnect,refresh));
  import=ManagerLayout.Button("import","button.importResources",ui);Button packs=ManagerLayout.Button("packs","button.packs",ui),diagnostics=ManagerLayout.Button("diagnostics","button.diagnostics",ui);ManagerLayout.Row(table,ManagerLayout.Flow(import,packs,diagnostics));
  Button rebind=ManagerLayout.Button("rebind","button.rebind",ui),reconcile=ManagerLayout.Button("reconcile","button.reconcile",ui),quit=ManagerLayout.Button("quit","button.quit",ui);ManagerLayout.Row(table,ManagerLayout.Flow(rebind,reconcile,quit));
  summary=ManagerLayout.Label("summary","app.support",ui);ManagerLayout.Row(table,summary);detail=ManagerLayout.ReadOnly("diagnosticDetail",130);ManagerLayout.Row(table,detail);
  ManagerLayout.Row(table,ManagerLayout.Label("programLabel","label.program",ui));installPath=ManagerLayout.ReadOnly("installPath",38);ManagerLayout.Row(table,installPath);ManagerLayout.Row(table,ManagerLayout.Label("dataLabel","label.data",ui));dataPath=ManagerLayout.ReadOnly("dataPath",38);ManagerLayout.Row(table,dataPath);ManagerLayout.Row(table,ManagerLayout.Label("closeHint","app.closeHint",ui));
  foreach(var label in new[]{detected,resource,live,summary})label.Tag=null;
  enable.Click+=async(s,e)=>{if(LocalizedConfirm.ShowText(this,ui,"confirm.enableTitle",T("confirm.enable"),MessageBoxButtons.OKCancel)==DialogResult.OK)await Operation("enable",ManagerLayout.ChoiceValue(theme,"astra-night"));};off.Click+=async(s,e)=>await Operation("off");disconnect.Click+=async(s,e)=>await Operation("stop");refresh.Click+=async(s,e)=>await RefreshState();rebind.Click+=async(s,e)=>await Operation("rebind");reconcile.Click+=async(s,e)=>await Operation("reconcile");quit.Click+=(s,e)=>Close();
  density.SelectedIndexChanged+=async(s,e)=>{if(!loading)await Operation("density",ManagerLayout.ChoiceValue(density,"balanced"));};language.SelectedIndexChanged+=(s,e)=>{if(!loading)ChangeLanguage();};
  import.Click+=async(s,e)=>{using(var picker=new OpenFileDialog{Filter=T("picker.zip")+"|*.zip",Title=T("picker.resources")})if(picker.ShowDialog(this)==DialogResult.OK&&LocalizedConfirm.ShowText(this,ui,"confirm.rightsTitle",T("confirm.rights"),MessageBoxButtons.YesNo)==DialogResult.Yes){await Operation("stop");await Operation("import",picker.FileName);}};
  packs.Click+=(s,e)=>{using(var form=new PackForm(run,ui))form.ShowDialog(this);};diagnostics.Click+=async(s,e)=>{await RefreshState();LocalizedConfirm.ShowText(this,ui,"diagnostic.title",T("diagnostic.privacy"),MessageBoxButtons.OK,detail.Text+"\r\n"+installPath.Text+"\r\n"+dataPath.Text);};
  Shown+=async(s,e)=>await RefreshState();FormClosing+=async(s,e)=>{if(closing)return;e.Cancel=true;exitRequest.Request();timer.Stop();live.Text=T("status.exitQueued");Entry.CancelActive();await DrainExit();};FormClosed+=(s,e)=>timer.Dispose();
  Resize+=(s,e)=>ManagerLayout.FitLabels(this,ClientSize.Width-55);ApplyLocale(ui);
  timer.Interval=5000;timer.Tick+=async(s,e)=>{if(File.Exists(Path.Combine(Entry.Data,"gui-exit.request"))){Close();return;}if(!busy&&!operationQueued)await RefreshState(false);};timer.Start();
 }
 internal void ApplyLocale(UiContext context){
  string selectedTheme=ManagerLayout.ChoiceValue(theme,"astra-night"),selectedDensity=ManagerLayout.ChoiceValue(density,"balanced");bool previousLoading=loading;loading=true;ui=context;Entry.Ui=context;
  Text=T("app.title")+" 1.0.0-beta.1";ManagerLayout.Apply(this,ui);ManagerLayout.Choices(theme,themeIds,new[]{"theme.night","theme.day","theme.focus"},ui,selectedTheme);ManagerLayout.Choices(density,densities,new[]{"density.simple","density.balanced","density.rich"},ui,selectedDensity);
  language.Items.Clear();language.Items.Add(new UiChoice("auto",T("language.auto")));var names=new[]{"简体中文","English","Español","Français","العربية","Русский"};for(int i=0;i<Localization.Locales.Length;i++)language.Items.Add(new UiChoice(Localization.Locales[i],names[i]));language.SelectedIndex=context.Choice=="auto"?0:Array.IndexOf(Localization.Locales,context.Choice)+1;loading=previousLoading;
  if(lastStatus!=null)RenderStatus(lastStatus);else{detected.Text=T("status.detecting");resource.Text=T("status.resourcesReady");live.Text=T("status.disconnected");summary.Text=T("app.support");}
  if(!String.IsNullOrEmpty(context.WarningCode))languageStatus.Text=T("status.corruptConfig");ManagerLayout.FitLabels(this,ClientSize.Width-55);PerformLayout();
 }
 void ChangeLanguage(){string choice=ManagerLayout.ChoiceValue(language,"auto");var saved=UiSettings.Save(Entry.Data,choice);if(!saved.Saved){localeSaveFailed=true;ApplyLocale(ui);languageStatus.Text=T("status.notSaved");return;}localeSaveFailed=false;localeFailure=null;localeGeneration++;ApplyLocale(UiContext.Create(choice,CultureInfo.CurrentUICulture.Name,Path.Combine(Entry.Root,"localization")));languageStatus.Text=T("status.localePending");if(IsHandleCreated&&!exitRequest.Requested)BeginInvoke(new Action(async()=>await RefreshState(false)));}
 static Dictionary<string,object> OwnedUi(Dictionary<string,object> status){
  var value=Localization.Value(status,"ui") as Dictionary<string,object>;if(!Flag(status,"host")||value==null||String.IsNullOrEmpty(Value(status,"hostInstanceId"))||Value(value,"hostInstanceId")!=Value(status,"hostInstanceId"))return null;
  var capabilities=Localization.Value(value,"capabilities") as System.Collections.IEnumerable;if(capabilities!=null)foreach(var capability in capabilities)if(Convert.ToString(capability)=="ui-locale-v1")return value;return null;
 }
 bool LocaleConfirmed(Dictionary<string,object> value){return value!=null&&Value(value,"requestedLocale")==ui.Locale&&Value(value,"appliedLocale")==ui.Locale&&Value(value,"acceptedRevision")==Value(value,"appliedRevision")&&String.IsNullOrEmpty(Value(value,"pendingReason"));}
 void LanguageStatus(Dictionary<string,object> status){var state=OwnedUi(status);languageStatus.Text=T(localeSaveFailed?"status.notSaved":LocaleConfirmed(state)?"status.localeSynced":localeFailure!=null&&failedLocale==ui.Locale?"status.localeFailed":"status.localePending");}
 async Task SyncLatestLocale(Dictionary<string,object> status){
  if(busy||operationQueued||exitRequest.Requested||IsDisposed||localeSaveFailed)return;var state=OwnedUi(status);if(state==null)return;
  var operation=Localization.Object(Localization.Value(status,"operation"));if((Value(operation,"result")=="unknown"||Value(operation,"result")=="pending")&&!Flag(operation,"reconciled"))return;
  string wanted=ui.Locale,pending=Value(state,"pendingReason");if(LocaleConfirmed(state)||localeFailure!=null&&failedLocale==wanted||Value(state,"requestedLocale")==wanted&&pending!="cancelled"&&pending!="deadline")return;
  int generation=localeGeneration;busy=true;languageStatus.Text=T("status.localePending");
  try{var response=await Task.Run(()=>run("ui-language",wanted));if(generation==localeGeneration&&!IsDisposed){var confirmed=Localization.Value(response,"ui") as Dictionary<string,object>;if(confirmed!=null&&Value(confirmed,"hostInstanceId")==Value(status,"hostInstanceId")){status["ui"]=confirmed;lastStatus=status;}LanguageStatus(status);}}
  catch(Exception e){if(generation==localeGeneration&&!IsDisposed){localeFailure=Entry.ExceptionRecord(e);failedLocale=wanted;languageStatus.Text=T("status.localeFailed");detail.Text=DiagnosticPresentation.Render(localeFailure,ui.Catalogue)+"\r\n"+DiagnosticPresentation.RawDetails(localeFailure);}}
  finally{busy=false;}if(exitRequest.Requested)await DrainExit();else if(generation!=localeGeneration&&!IsDisposed)await RefreshState(false);
 }
 string ActionText(){if(lastAction==null)return T("app.support");if(lastAction.ContainsKey("restoration"))return RestorationText(lastAction["restoration"]);return DiagnosticPresentation.Render(lastAction,ui.Catalogue);}
 void RenderStatus(Dictionary<string,object> status){
  var client=Localization.Value(status,"client") as Dictionary<string,object>;string compatibility=Value(status,"compatibility");detected.Text=client==null?T("status.noClient"):T("label.client")+" · "+T(compatibility=="supported"?"status.supported":"status.unsupported");clientDetails.Text=client==null?"":Value(client,"family")+"\r\n"+Value(client,"version")+" · "+Value(client,"architecture");
  resource.Text=T(Flag(status,"resources")?"status.resourcesReady":"status.resourcesMissing");bool host=Flag(status,"host");live.Text=Flag(status,"applied")?T("status.applied"):host?T("status.hostActive"):RestorationText(Localization.Value(status,"restoration"))+" · "+T(Flag(status,"ownedClient")?"port.listening":"port.absent");
  var preference=Localization.Object(Localization.Value(status,"preference"));bool previousLoading=loading;loading=true;if(!initialized){theme.SelectedIndex=Math.Max(0,Array.IndexOf(themeIds,Value(preference,"theme")));initialized=true;}density.SelectedIndex=Math.Max(0,Array.IndexOf(densities,Value(preference,"environmentDensity")));loading=previousLoading;
  enable.Enabled=compatibility=="supported"&&Flag(status,"resources")&&!exitRequest.Requested;off.Enabled=disconnect.Enabled=host&&!exitRequest.Requested;import.Enabled=!exitRequest.Requested;
  installPath.Text=Value(status,"installRoot");dataPath.Text=Value(status,"dataRoot");string fallback=ActionText();if(String.IsNullOrEmpty(lastActionOperationId)&&status.ContainsKey("warnings")&&Entry.Json.Serialize(status["warnings"])!="[]")fallback=T("status.corruptConfig");summary.Text=fallback;detail.Text=DiagnosticText(status,fallback,lastActionOperationId);if(lastAction!=null)detail.Text+="\r\n"+DiagnosticPresentation.RawDetails(lastAction);LanguageStatus(status);
 }
 async Task DrainExit(){
  if(!exitRequest.TryBegin(busy))return;busy=true;live.Text=T("status.restoring");
  try{var result=await Task.Run(()=>run("stop",null));LastExitRestoration=Value(result,"restoration");if(String.IsNullOrEmpty(LastExitRestoration))LastExitRestoration="unknown";live.Text=RestorationText(LastExitRestoration);detail.Text=live.Text+"; "+T("status.clientKept");closing=true;timer.Stop();Close();}
  catch(Exception e){exitRequest.Failed();live.Text=T("status.exitUnconfirmed");detail.Text=Entry.ExceptionText(e);timer.Start();LocalizedConfirm.ShowText(this,ui,"status.exitUnconfirmed",DiagnosticPresentation.Render(Entry.ExceptionRecord(e),ui.Catalogue),MessageBoxButtons.OK,DiagnosticPresentation.RawDetails(Entry.ExceptionRecord(e)));}finally{busy=false;}
 }
 async Task Operation(string action,string value=null){
  if(operationQueued||exitRequest.Requested)return;operationQueued=true;live.Text=T("status.working");
  while(busy&&!exitRequest.Requested&&!IsDisposed)await Task.Delay(50);
  operationQueued=false;if(exitRequest.Requested||IsDisposed)return;
  busy=true;enable.Enabled=off.Enabled=import.Enabled=disconnect.Enabled=false;
  try{lastAction=await Task.Run(()=>run(action,value));lastActionOperationId=Value(lastAction,"operationId");if(action=="reconcile")localeFailure=null;summary.Text=ActionText();detail.Text=DiagnosticPresentation.RawDetails(lastAction);}
  catch(Exception e){lastActionOperationId=Convert.ToString(e.Data["operationId"]);lastAction=Entry.ExceptionRecord(e);summary.Text=ActionText();detail.Text=DiagnosticPresentation.RawDetails(lastAction);if(!exitRequest.Requested)LocalizedConfirm.ShowText(this,ui,"diagnostic.failed",summary.Text,MessageBoxButtons.OK,detail.Text);}finally{busy=false;}
  if(exitRequest.Requested){await DrainExit();return;}await RefreshState(false);
 }
 async Task RefreshState(bool explain=true){if(busy||operationQueued||exitRequest.Requested)return;if(explain)localeFailure=null;busy=true;bool observed=false;try{lastStatus=await Task.Run(()=>run("status",null));RenderStatus(lastStatus);observed=true;}catch(Exception e){summary.Text=DiagnosticPresentation.Render(Entry.ExceptionRecord(e),ui.Catalogue);detail.Text=DiagnosticPresentation.RawDetails(Entry.ExceptionRecord(e));enable.Enabled=false;}finally{busy=false;}if(exitRequest.Requested)await DrainExit();else if(observed)await SyncLatestLocale(lastStatus);}
}
class PackChoice {public string Key,Name,Preview;public override string ToString(){return Name;}}
class PackForm:Form {
 UiContext ui;readonly Func<string,string,Dictionary<string,object>> run;ComboBox characters,scenes;PictureBox characterPreview,scenePreview;Label status;TextBox identities;bool busy;Dictionary<string,object> catalogue;
 string T(string key){return ui.Catalogue.Text(key);}
 public PackForm():this(Entry.Run,Entry.CurrentUi){}
 internal PackForm(Func<string,string,Dictionary<string,object>> runner,UiContext context){
  run=runner;ui=context;ManagerLayout.Style(this,new Size(1000,760));StartPosition=FormStartPosition.CenterParent;var table=ManagerLayout.Table(this);ManagerLayout.Row(table,ManagerLayout.Label("packSummary","pack.summary",ui));
  characters=ManagerLayout.Combo("characters");scenes=ManagerLayout.Combo("scenes");characters.Width=scenes.Width=440;ManagerLayout.Row(table,ManagerLayout.Flow(characters,scenes));
  characterPreview=Picture();scenePreview=Picture();var pictures=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Height=275};pictures.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));pictures.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));pictures.Controls.Add(characterPreview,0,0);pictures.Controls.Add(scenePreview,1,0);ManagerLayout.Row(table,pictures);
  Button applyCharacter=ManagerLayout.Button("applyCharacter","pack.applyCharacter",ui),applyScene=ManagerLayout.Button("applyScene","pack.applyScene",ui),infoCharacter=ManagerLayout.Button("infoCharacter","pack.characterLicense",ui),infoScene=ManagerLayout.Button("infoScene","pack.sceneLicense",ui);ManagerLayout.Row(table,ManagerLayout.Flow(applyCharacter,applyScene,infoCharacter,infoScene));
  Button removeCharacter=ManagerLayout.Button("removeCharacter","pack.removeCharacter",ui),removeScene=ManagerLayout.Button("removeScene","pack.removeScene",ui),reset=ManagerLayout.Button("reset","pack.reset",ui);ManagerLayout.Row(table,ManagerLayout.Flow(removeCharacter,removeScene,reset));
  Button import=ManagerLayout.Button("packImport","pack.import",ui),refresh=ManagerLayout.Button("packRefresh","pack.refresh",ui);ManagerLayout.Row(table,ManagerLayout.Flow(import,refresh));status=ManagerLayout.Label("packStatus","pack.loading",ui);status.Tag=null;ManagerLayout.Row(table,status);identities=ManagerLayout.ReadOnly("packIdentities",45);ManagerLayout.Row(table,identities);
  characters.SelectedIndexChanged+=(s,e)=>Preview(characters,characterPreview);scenes.SelectedIndexChanged+=(s,e)=>Preview(scenes,scenePreview);
  applyCharacter.Click+=async(s,e)=>await Action(async()=>{await Task.Run(()=>run("character",Choice(characters).Key));});applyScene.Click+=async(s,e)=>await Action(async()=>{await Task.Run(()=>run("scene",Choice(scenes).Key));});reset.Click+=async(s,e)=>await Action(async()=>{await Task.Run(()=>run("character","__legacy__"));await Task.Run(()=>run("scene","__legacy__"));});
  infoCharacter.Click+=async(s,e)=>await Info(characters);infoScene.Click+=async(s,e)=>await Info(scenes);removeCharacter.Click+=async(s,e)=>await Remove("character",characters);removeScene.Click+=async(s,e)=>await Remove("scene",scenes);
  import.Click+=async(s,e)=>{using(var picker=new OpenFileDialog{Filter=T("picker.zip")+"|*.zip",Title=T("picker.resources")})if(picker.ShowDialog(this)==DialogResult.OK)await Action(async()=>{await Task.Run(()=>run("pack-import",picker.FileName));});};refresh.Click+=async(s,e)=>await Reload();Shown+=async(s,e)=>await Reload();
  FormClosing+=(s,e)=>{if(busy){e.Cancel=true;status.Text=T("pack.busy");}};FormClosed+=(s,e)=>{if(characterPreview.Image!=null)characterPreview.Image.Dispose();if(scenePreview.Image!=null)scenePreview.Image.Dispose();};Resize+=(s,e)=>ManagerLayout.FitLabels(this,ClientSize.Width-55);ApplyLocale(ui);
 }
 static PictureBox Picture(){return new PictureBox{Dock=DockStyle.Fill,SizeMode=PictureBoxSizeMode.Zoom,BackColor=Color.FromArgb(43,46,62),Margin=new Padding(4)};}
 internal void ApplyLocale(UiContext context){ui=context;Text=T("pack.title");ManagerLayout.Apply(this,ui);if(catalogue!=null)FillChoices();status.Text=T(busy?"pack.busy":catalogue==null?"pack.loading":"pack.ready");ManagerLayout.FitLabels(this,ClientSize.Width-55);}
 PackChoice Choice(ComboBox combo){if(combo.SelectedItem==null)throw Entry.LocalError("PACK_FAILED",T("pack.none"),"error.pack");return (PackChoice)combo.SelectedItem;}
 void Preview(ComboBox combo,PictureBox picture){var previous=picture.Image;picture.Image=null;if(previous!=null)previous.Dispose();if(combo.SelectedItem==null)return;var choice=(PackChoice)combo.SelectedItem;identities.Text=choice.Key;string file=choice.Preview;if(String.IsNullOrEmpty(file))return;try{using(var image=Image.FromFile(file))picture.Image=new Bitmap(image);}catch{status.Text=T("status.resourcesMissing");}}
 void FillChoices(){
  var selection=Localization.Object(Localization.Value(catalogue,"candidateSelection"));characters.Items.Clear();scenes.Items.Clear();characters.Items.Add(new PackChoice{Key="__legacy__",Name=T("pack.originalCharacter")});scenes.Items.Add(new PackChoice{Key="__legacy__",Name=T("pack.originalScene")});
  var rows=Localization.Value(catalogue,"enabledPacks") as System.Collections.IEnumerable;if(rows!=null)foreach(var value in rows){var item=Localization.Object(value);var display=Localization.Object(Localization.Value(item,"display"));string nameKey=Convert.ToString(Localization.Value(display,"nameKey")),capabilityKey=Convert.ToString(Localization.Value(display,"capabilityKey"));string name=String.IsNullOrEmpty(nameKey)?Convert.ToString(Localization.Value(item,"name")):T(nameKey),capability=String.IsNullOrEmpty(capabilityKey)?Convert.ToString(Localization.Value(item,"capability")):T(capabilityKey);var combo=Convert.ToString(Localization.Value(item,"kind"))=="character"?characters:scenes;combo.Items.Add(new PackChoice{Key=Convert.ToString(Localization.Value(item,"key")),Name=name+" · "+Localization.Value(item,"version")+" · "+capability,Preview=Convert.ToString(Localization.Value(item,"previewPath"))});}
  foreach(var pair in new[]{new{Kind="character",Combo=characters},new{Kind="scene",Combo=scenes}}){pair.Combo.SelectedIndex=0;for(int i=0;i<pair.Combo.Items.Count;i++)if(((PackChoice)pair.Combo.Items[i]).Key==Convert.ToString(Localization.Value(selection,pair.Kind)))pair.Combo.SelectedIndex=i;}
 }
 async Task Reload(){try{catalogue=await Task.Run(()=>run("packs",null));FillChoices();status.Text=T("pack.ready");}catch(Exception e){status.Text=DiagnosticPresentation.Render(Entry.ExceptionRecord(e),ui.Catalogue);}}
 static void EnableActions(Control root,bool enabled){foreach(Control control in root.Controls){if(control is Button||control is ComboBox)control.Enabled=enabled;EnableActions(control,enabled);}}
 async Task Action(Func<Task> action){if(busy)return;busy=true;EnableActions(this,false);status.Text=T("status.working");try{await action();await Reload();}catch(Exception e){status.Text=DiagnosticPresentation.Render(Entry.ExceptionRecord(e),ui.Catalogue);LocalizedConfirm.ShowText(this,ui,"error.pack",status.Text,MessageBoxButtons.OK,DiagnosticPresentation.RawDetails(Entry.ExceptionRecord(e)));}finally{busy=false;EnableActions(this,true);}}
 async Task Info(ComboBox combo){if(Choice(combo).Key=="__legacy__"){LocalizedConfirm.ShowText(this,ui,"pack.characterLicense",T("pack.builtinLicense"));return;}await Action(async()=>{var result=await Task.Run(()=>run("pack-details",Choice(combo).Key));LocalizedConfirm.ShowText(this,ui,"pack.characterLicense",Convert.ToString(Localization.Value(result,"name")),MessageBoxButtons.OK,Convert.ToString(Localization.Value(result,"distribution"))+"\r\n"+Localization.Value(result,"credits")+"\r\n"+Localization.Value(result,"provenance"));});}
 async Task Remove(string kind,ComboBox combo){string key=Choice(combo).Key;if(key=="__legacy__")return;if(LocalizedConfirm.ShowText(this,ui,"confirm.removeTitle",T("confirm.remove"),MessageBoxButtons.YesNo)!=DialogResult.Yes)return;await Action(async()=>{var result=await Task.Run(()=>run("packs",null));var selected=Localization.Object(Localization.Value(result,"candidateSelection"));if(Convert.ToString(Localization.Value(selected,kind))==key)await Task.Run(()=>run(kind,"__legacy__"));await Task.Run(()=>run("pack-remove",key));});}
}
// UI-thread state only: polling and mutations finish through the same exit gate.
class ExitRequest {
 public bool Requested {get;private set;}bool stopping;
 public void Request(){Requested=true;}
 public bool TryBegin(bool busy){if(!Requested||stopping||busy)return false;stopping=true;return true;}
 public void Failed(){stopping=false;Requested=false;}
}
