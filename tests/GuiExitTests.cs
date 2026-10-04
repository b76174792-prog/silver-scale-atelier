using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
class GuiExitTests {
 class QuietManagerForm:ManagerForm {protected override bool ShowWithoutActivation {get{return true;}}public QuietManagerForm(){StartPosition=FormStartPosition.Manual;Location=new System.Drawing.Point(-10000,-10000);}}
 [STAThread] static int Main(string[] args){
  Entry.Root=args[0];Entry.Data=DataPaths.Root;Directory.CreateDirectory(Entry.Data);Entry.Ui=UiContext.Create("zh-CN","zh-CN",Path.Combine(Entry.Root,"localization"));
  Application.EnableVisualStyles();
  for(int n=0;n<10;n++){
   var form=new QuietManagerForm();bool closed=false;int ticks=0;
   var timer=new Timer{Interval=25};
   timer.Tick+=(s,e)=>{if(++ticks==2)form.Close();if(ticks>300)throw new Exception("Queued close was not drained");};
   form.FormClosed+=(s,e)=>{closed=true;timer.Stop();};
   form.Shown+=(s,e)=>{if(n==0){using(var bitmap=new System.Drawing.Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new System.Drawing.Rectangle(0,0,bitmap.Width,bitmap.Height));bitmap.Save(Path.Combine(args[1],"gui-preview.png"));}}timer.Start();};Application.Run(form);timer.Dispose();form.Dispose();
   if(!closed)throw new Exception("Form close unconfirmed");
   if(form.LastExitRestoration!="unknown")throw new Exception("Absent host falsely claimed restoration: "+form.LastExitRestoration);
  }
  if(!ManagerForm.RestorationText("lease_pending").Contains("尚未确认")||!ManagerForm.RestorationText("unknown").Contains("未确认"))throw new Exception("Unconfirmed restoration label missing");
  Console.WriteLine("10/10 production ManagerForm close events drained after in-flight status polling.");return 0;
 }
}
