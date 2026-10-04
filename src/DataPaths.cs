using System;
using System.IO;
// MSIX virtualizes the logical LocalAppData path. Use the existing physical
// location explicitly so desktop and packaged callers share one state and lock.
static class DataPaths {
 internal static readonly string Local=Environment.GetEnvironmentVariable("LOCALAPPDATA")??Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
 internal static readonly string Root=Path.Combine(Local,"Packages","OpenAI.Codex_2p2nqsd0c76g0","LocalCache","Local","SilverScaleAtelierManager");
 internal static readonly string ProfileArgument=Path.Combine(Local,"SilverScaleAtelierManager","ClientProfile");
 internal static readonly string ProfileStorage=Path.Combine(Root,"ClientProfile");
}
