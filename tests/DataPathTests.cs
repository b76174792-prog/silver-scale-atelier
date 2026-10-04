using System;
class DataPathTests {
 static int Main(){Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.WriteLine(Entry.Json.Serialize(new{dataRoot=Entry.Data,profileArgument=DataPaths.ProfileArgument,profileStorage=DataPaths.ProfileStorage}));return 0;}
}
