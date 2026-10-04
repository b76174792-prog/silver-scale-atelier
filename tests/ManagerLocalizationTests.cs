using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Web.Script.Serialization;
class ManagerLocalizationTests {
 static string phase="setup";
 static readonly string longPath=@"C:\Исследования\银鳞书庭\اختبار\a very long folder name\assets\1.2.3\FILE_NOT_FOUND";
 static Dictionary<string,object> D(params object[] values){var d=new Dictionary<string,object>();for(int i=0;i<values.Length;i+=2)d.Add((string)values[i],values[i+1]);return d;}
 static Dictionary<string,object> Run(string action,string value){if(action=="packs")return D("enabledPacks",new object[0],"candidateSelection",D("character","__legacy__","scene","__legacy__"));if(action=="stop")return D("restoration","unknown");return D("client",null,"compatibility","missing","resources",true,"host",false,"applied",false,"ownedClient",false,"restoration","unknown","portState","raw-port","installRoot",longPath,"dataRoot",longPath,"preference",D("theme","astra-night","environmentDensity","balanced"),"warnings",new object[0]);}
 class QuietManager:ManagerForm {internal QuietManager(UiContext ui):base(Run,ui){StartPosition=FormStartPosition.Manual;Location=new Point(-10000,-10000);}protected override bool ShowWithoutActivation{get{return true;}}}
 class QuietPack:PackForm {internal QuietPack(UiContext ui):base(Run,ui){StartPosition=FormStartPosition.Manual;Location=new Point(-10000,-10000);}protected override bool ShowWithoutActivation{get{return true;}}}
 static void Check(bool value,string name){if(!value)throw new Exception(name);}
 static Control Find(Control root,string name){var all=root.Controls.Find(name,true);Check(all.Length==1,"Control identity: "+name);return all[0];}
 static IEnumerable<Control> All(Control root){foreach(Control child in root.Controls){yield return child;foreach(Control nested in All(child))yield return nested;}}
 static void LayoutCheck(Form form,string locale){foreach(Control control in All(form)){var button=control as Button;if(button!=null&&button.Visible){int width=TextRenderer.MeasureText(button.Text,button.Font).Width;Check(button.Width>=width+8,locale+" button clipped: "+button.Name);Check(button.Height>=TextRenderer.MeasureText(button.Text,button.Font).Height+6,locale+" button height");}var label=control as Label;if(label!=null&&label.Visible&&label.Text.Length>0&&label.Width>0)Check(label.Height+2>=label.GetPreferredSize(new Size(label.Width,0)).Height,locale+" label clipped: "+label.Name);}}
 static void CloseQuietly(Form form){form.Close();var watch=System.Diagnostics.Stopwatch.StartNew();while(!form.IsDisposed&&watch.ElapsedMilliseconds<5000){Application.DoEvents();System.Threading.Thread.Sleep(1);}Check(form.IsDisposed,"Close did not drain: "+phase);}
 [STAThread] static int Main(string[] args){try{
  Console.OutputEncoding=new UTF8Encoding(false);Entry.Root=args[0];Entry.Data=Path.Combine(args[1],"state");Directory.CreateDirectory(Entry.Data);Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);Application.EnableVisualStyles();
  int combinations=0;foreach(string locale in Localization.Locales)foreach(float scale in new[]{1f,1.25f,1.5f,2f}){
   phase=locale+"/"+scale+" manager";Console.WriteLine(phase);var ui=UiContext.Create(locale,"en-US",Path.Combine(Entry.Root,"localization"));Entry.Ui=ui;
   var manager=new QuietManager(ui);manager.Show();Application.DoEvents();manager.Scale(new SizeF(scale,scale));manager.PerformLayout();Application.DoEvents();
   Check(manager.RightToLeft==(locale=="ar"?RightToLeft.Yes:RightToLeft.No),"Manager direction");Check(((ComboBox)Find(manager,"languageChoice")).Items.Count==7,"Seven language choices");
   Check(Find(manager,"installPath").RightToLeft==RightToLeft.No,"Path is LTR");Check(Find(manager,"installPath").Text==longPath,"Path characters unchanged");Check(Find(manager,"enable").Text==ui.Catalogue.Text("button.enable"),"Localized action label");
   var theme=(ComboBox)Find(manager,"themeChoice");int selected=theme.SelectedIndex;manager.ApplyLocale(UiContext.Create(locale=="ar"?"en":"ar","en-US",Path.Combine(Entry.Root,"localization")));Check(theme.SelectedIndex==selected,"Language keeps theme selection");manager.ApplyLocale(ui);LayoutCheck(manager,locale);
   if(scale==1f&&(locale=="ar"||locale=="ru"))using(var bitmap=new Bitmap(manager.Width,manager.Height)){manager.DrawToBitmap(bitmap,new Rectangle(0,0,bitmap.Width,bitmap.Height));bitmap.Save(Path.Combine(args[2],"manager-"+locale+".png"));}
   phase=locale+"/"+scale+" manager-close";CloseQuietly(manager);
   var pack=new QuietPack(ui);pack.Show();Application.DoEvents();pack.Scale(new SizeF(scale,scale));pack.PerformLayout();LayoutCheck(pack,locale);Check(pack.RightToLeft==(locale=="ar"?RightToLeft.Yes:RightToLeft.No),"Pack direction");pack.ApplyLocale(ui);CloseQuietly(pack);
   phase=locale+"/"+scale+" dialog";using(var dialog=LocalizedConfirm.Create(null,ui,"confirm.enableTitle","confirm.enable",null,MessageBoxButtons.OKCancel)){dialog.CreateControl();dialog.PerformLayout();Check(Find(dialog,"confirm-ok").Text==ui.Catalogue.Text("button.ok"),"Confirm language");Check(dialog.RightToLeft==(locale=="ar"?RightToLeft.Yes:RightToLeft.No),"Confirm direction");phase+=" dispose";}
   combinations++;
  }
  foreach(string locale in Localization.Locales){Entry.Ui=UiContext.Create(locale,"en-US",Path.Combine(Entry.Root,"localization"));try{Entry.ParseRuntimeResponse("{\"ok\":false,\"errorCode\":\"HELPER_FAILED\",\"error\":\"RAW-UNCHANGED\",\"messageKey\":\"error.helper_failed\",\"args\":{}}");throw new Exception("Failure JSON accepted");}catch(Exception e){Check(e.Message=="[HELPER_FAILED] RAW-UNCHANGED","Original exception message");Check(Convert.ToString(e.Data["messageKey"])=="error.helper_failed","Description survives real parser");Check(Entry.ExceptionText(e).Contains(Entry.Ui.Catalogue.Text("error.helper_failed")),"Localized failure reaches display");}}
  File.WriteAllText(Path.Combine(args[2],"matrix.json"),new JavaScriptSerializer().Serialize(new {environment="synthetic-offscreen-winforms",combinations=combinations,realSystemDpiVerified=false}),new UTF8Encoding(false));
  Console.WriteLine("24 locale-scale combinations PASS; original failure parser PASS; no official client started.");return 0;
 }catch(Exception e){Console.Error.WriteLine("Phase: "+phase+"\n"+e);return 1;}}
}
