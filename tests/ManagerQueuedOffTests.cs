using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

class ManagerQueuedOffTests {
 sealed class Case {
  internal readonly ManualResetEvent Entered=new ManualResetEvent(false),Release=new ManualResetEvent(false);
  internal int Status,Off,Stop;
  internal bool Block;
 }
 static Dictionary<string,object> D(params object[] pairs){var d=new Dictionary<string,object>();for(int i=0;i<pairs.Length;i+=2)d.Add((string)pairs[i],pairs[i+1]);return d;}
 static Dictionary<string,object> Run(Case c,string action,string value){
  if(action=="status"){
   Interlocked.Increment(ref c.Status);
   if(c.Block){c.Entered.Set();if(!c.Release.WaitOne(8000))throw new Exception("Synthetic status was not released");}
   return D("compatibility","supported","resources",true,"host",true,"applied",true,"restoration","unknown","preference",D("theme","astra-night","environmentDensity","balanced"));
  }
  if(action=="off"){Interlocked.Increment(ref c.Off);return D("operationId","synthetic-off","restoration","confirmed");}
  if(action=="stop"){Interlocked.Increment(ref c.Stop);return D("restoration","confirmed");}
  throw new Exception("Unexpected Manager action: "+action);
 }
 class Quiet:ManagerForm {internal Quiet(Case c,UiContext ui):base((action,value)=>Run(c,action,value),ui){StartPosition=FormStartPosition.Manual;Location=new Point(-10000,-10000);}protected override bool ShowWithoutActivation{get{return true;}}}
 static Button Button(ManagerForm form,string name){var found=form.Controls.Find(name,true);if(found.Length!=1)throw new Exception("Missing "+name);return (Button)found[0];}
 static bool Flag(ManagerForm form,string name){return (bool)typeof(ManagerForm).GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(form);}
 static void Exercise(UiContext ui,bool exitWins){
  var c=new Case();var form=new Quiet(c,ui);var timer=new System.Windows.Forms.Timer{Interval=10};
  var clock=System.Diagnostics.Stopwatch.StartNew();int step=0;long enteredStep=0;Exception failure=null;
  timer.Tick+=(s,e)=>{
   try{
    if(clock.ElapsedMilliseconds-enteredStep>5000){
     string message=step==3&&c.Off==0&&!exitWins?"Queued off was lost after status":"Manager queue did not drain";
     throw new Exception(message+": step="+step+" status="+c.Status+" off="+c.Off+" stop="+c.Stop+" busy="+Flag(form,"busy")+" queued="+Flag(form,"operationQueued"));
    }
    if(step==0){
     if(c.Status<1||Flag(form,"busy"))return;
     if(!Button(form,"off").Enabled)throw new Exception("Off was not available before polling");
     c.Block=true;Button(form,"refresh").PerformClick();step=1;enteredStep=clock.ElapsedMilliseconds;
    }else if(step==1){
     if(!c.Entered.WaitOne(0))return;
     Button(form,"off").PerformClick();Button(form,"off").PerformClick();Button(form,"refresh").PerformClick();
     step=2;enteredStep=clock.ElapsedMilliseconds;
    }else if(step==2){
     if(clock.ElapsedMilliseconds-enteredStep<100)return;
     if(c.Off!=0)throw new Exception("Off ran concurrently with status");
     if(c.Status!=2)throw new Exception("Another status request overtook queued off");
     if(exitWins){form.Close();form.Close();}
     c.Block=false;c.Release.Set();step=3;enteredStep=clock.ElapsedMilliseconds;
    }else if(!exitWins&&step==3){
     if(c.Off<1||Flag(form,"busy"))return;
     if(c.Off!=1)throw new Exception("Repeated off clicks were not coalesced");
     form.Close();step=4;enteredStep=clock.ElapsedMilliseconds;
    }
   }catch(Exception ex){failure=ex;c.Release.Set();timer.Stop();form.Dispose();}
  };
  form.Shown+=(s,e)=>timer.Start();form.FormClosed+=(s,e)=>timer.Stop();
  try{Application.Run(form);if(failure!=null)throw failure;if(c.Off!=(exitWins?0:1)||c.Stop!=1||form.LastExitRestoration!="confirmed")throw new Exception("Exit raced queued off: off="+c.Off+" stop="+c.Stop);}
  finally{c.Release.Set();timer.Dispose();form.Dispose();c.Entered.Dispose();c.Release.Dispose();}
 }
 [STAThread] static int Main(string[] args){
  try{
   Entry.Root=args[0];Entry.Data=Path.Combine(args[1],"state");Directory.CreateDirectory(Entry.Data);
   var ui=UiContext.Create("en","en",Path.Combine(Entry.Root,"localization"));Entry.Ui=ui;Application.EnableVisualStyles();
   Exercise(ui,false);Exercise(ui,true);
   Console.WriteLine("Queued off once after status; repeated clicks coalesce; exit outranks queued off PASS");return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}
 }
}
