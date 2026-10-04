using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class ManagerShutdownTests {
 sealed class GuiOwner : IDisposable {
  internal readonly string Name="Local\\SilverScaleAtelierShutdownTest-"+Guid.NewGuid().ToString("N");
  internal readonly ManualResetEvent Ready=new ManualResetEvent(false),Release=new ManualResetEvent(false);
  internal readonly Thread Thread;
  internal Exception Failure;
  internal int Holding;
  internal GuiOwner(){
   Thread=new Thread(()=>{
    bool owned=false;
    try{
     bool created;using(var mutex=new Mutex(true,Name,out created)){
      if(!created)throw new Exception("Unique test mutex already existed");
      owned=true;System.Threading.Thread.VolatileWrite(ref Holding,1);Ready.Set();
      try{if(!Release.WaitOne(8000))throw new Exception("Synthetic GUI was not released");}
      finally{System.Threading.Thread.VolatileWrite(ref Holding,0);if(owned)mutex.ReleaseMutex();}
     }
    }catch(Exception e){Failure=e;Ready.Set();}
   });
   Thread.IsBackground=true;Thread.Start();
   if(!Ready.WaitOne(2000)||Failure!=null)throw new Exception("Synthetic GUI did not acquire its mutex");
  }
  public void Dispose(){Release.Set();if(!Thread.Join(3000))throw new Exception("Synthetic GUI owner did not exit");Ready.Dispose();Release.Dispose();if(Failure!=null)throw Failure;}
 }
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static void Data(string work,string name){Entry.Data=Path.Combine(work,name);Directory.CreateDirectory(Entry.Data);}
 static void WaitForSignal(Thread request){
  var clock=Stopwatch.StartNew();string signal=Path.Combine(Entry.Data,"gui-exit.request");
  while(!File.Exists(signal)&&request.IsAlive&&clock.ElapsedMilliseconds<2000)Thread.Sleep(10);
  Check(File.Exists(signal),"Shutdown did not signal the synthetic GUI");
 }
 static void HeldGuiThenRelease(string work){
  Data(work,"held-gui");int stops=0;Exception failure=null;Thread request=null;
  using(var gui=new GuiOwner()){
   request=new Thread(()=>{try{Entry.RequestShutdown(()=>{Check(System.Threading.Thread.VolatileRead(ref gui.Holding)==0,"Stop ran while GUI still owned its mutex");Interlocked.Increment(ref stops);},gui.Name,4000);}catch(Exception e){failure=e;}});
   request.IsBackground=true;
   try{
    request.Start();WaitForSignal(request);Thread.Sleep(100);
    Check(System.Threading.Thread.VolatileRead(ref stops)==0,"Stop ran before the GUI exited");
    Check(request.IsAlive,"Shutdown did not wait for the existing GUI");
    gui.Release.Set();Check(request.Join(3000),"Shutdown did not finish after GUI release");
    if(failure!=null)throw failure;
    Check(stops==1,"Shutdown must call stop exactly once after GUI release");
   }finally{gui.Release.Set();if(request.IsAlive)request.Join(3000);}
  }
 }
 static void HeldGuiTimeout(string work){
  Data(work,"timeout");int stops=0;
  using(var gui=new GuiOwner()){
   var clock=Stopwatch.StartNew();
   try{Entry.RequestShutdown(()=>Interlocked.Increment(ref stops),gui.Name,180);}catch(Exception){}
   Check(stops==0,"Timeout must not call stop while the GUI is alive");
   Check(clock.ElapsedMilliseconds>=100&&clock.ElapsedMilliseconds<3000,"Shutdown did not respect the bounded GUI wait");
   Check(File.Exists(Path.Combine(Entry.Data,"gui-exit.request")),"Timed-out shutdown did not request GUI exit");
  }
 }
 static void NoGui(string work){
  Data(work,"no-gui");int stops=0;string name="Local\\SilverScaleAtelierShutdownTest-"+Guid.NewGuid().ToString("N");
  Entry.RequestShutdown(()=>Interlocked.Increment(ref stops),name,1000);
  Check(stops==1,"Shutdown without a GUI must call stop exactly once");
  Check(File.Exists(Path.Combine(Entry.Data,"gui-exit.request")),"Shutdown without GUI did not write its request");
 }
 static int Main(string[] args){
  try{Entry.Root=args[0];HeldGuiThenRelease(args[1]);HeldGuiTimeout(args[1]);NoGui(args[1]);Console.WriteLine("Shutdown waits for GUI release; timeout never stops; absent GUI stops once PASS");return 0;}
  catch(Exception e){Console.Error.WriteLine(e.GetType().Name+": "+e.Message);return 1;}
 }
}
