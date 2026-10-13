using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace KejianDesktop {
    internal static class Program {
        internal static string DataDir, RuntimeDir, SiteDir;
        internal static bool TestMode;
        internal static int DebugPort;
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        private static extern bool SetDllDirectory(string path);

        [STAThread]
        private static void Main(string[] args) {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try {
                TestMode=Array.IndexOf(args,"--test-mode")>=0;
                DataDir=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"课间数据");
                // Automation is opt-in and uses a separate profile; ordinary launches expose no port.
                if(TestMode)foreach(string arg in args) {
                    if(arg.StartsWith("--data-dir="))DataDir=Path.GetFullPath(arg.Substring(11));
                    if(arg.StartsWith("--debug-port="))DebugPort=int.Parse(arg.Substring(13));
                }
                if(DebugPort!=0&&(DebugPort<1024||DebugPort>65535))throw new ArgumentException("测试端口无效");
                Directory.CreateDirectory(DataDir);
                Trace("start "+System.Diagnostics.Process.GetCurrentProcess().Id);
                string temp=Path.Combine(DataDir,"temp");Directory.CreateDirectory(temp);
                Environment.SetEnvironmentVariable("TEMP",temp);Environment.SetEnvironmentVariable("TMP",temp);
                string mutexKey=Hash(Encoding.UTF8.GetBytes(DataDir.ToUpperInvariant())).Substring(0,24);
                using(var mutex=new Mutex(false,"Local\\Kejian-"+mutexKey)) {
                    bool ownsMutex;
                    try{ownsMutex=mutex.WaitOne(0);}catch(AbandonedMutexException){ownsMutex=true;}
                    if(!ownsMutex){if(!TestMode)MessageBox.Show("课间已经打开，请切回原来的窗口。","课间");Environment.ExitCode=2;return;}
                    try {
                    Trace("mutex acquired");
                    PrepareFiles();
                    Trace("resources ready");
                    AppDomain.CurrentDomain.AssemblyResolve+=(sender,eventArgs)=>{
                        string name=new AssemblyName(eventArgs.Name).Name;
                        if(name!="Microsoft.Web.WebView2.Core"&&name!="Microsoft.Web.WebView2.WinForms")return null;
                        return Assembly.LoadFrom(Path.Combine(RuntimeDir,name+".dll"));
                    };
                    if(!SetDllDirectory(RuntimeDir))throw new IOException("无法加载桌面组件");
                        Trace("create window");RunWindow();Trace("window closed");
                    }finally{mutex.ReleaseMutex();}
                }
            } catch(Exception error) {
                Log(error);
                if(!TestMode)MessageBox.Show("课间未能启动。请把程序放在可写入的文件夹后重试。\n\n"+error.Message,"课间",MessageBoxButtons.OK,MessageBoxIcon.Error);
                Environment.ExitCode=1;
            }
        }
        [MethodImpl(MethodImplOptions.NoInlining)]
        private static void RunWindow(){Application.Run(new DesktopWindow());}

        private static void PrepareFiles() {
            var assembly=Assembly.GetExecutingAssembly();
            RuntimeDir=Path.Combine(DataDir,"runtime");Directory.CreateDirectory(RuntimeDir);
            foreach(string name in new[]{"Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll","WebView2Loader.dll"}) {
                byte[] bytes=ReadResource("runtime."+name);string target=Path.Combine(RuntimeDir,name);
                if(!File.Exists(target)||Hash(File.ReadAllBytes(target))!=Hash(bytes))WriteFile(target,bytes);
            }
            byte[] site=ReadResource("site.zip");
            SiteDir=Path.Combine(DataDir,"app",Hash(site).Substring(0,16));
            if(!File.Exists(Path.Combine(SiteDir,".complete"))) {
                Directory.CreateDirectory(SiteDir);
                using(var stream=new MemoryStream(site))using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)) {
                    foreach(var entry in zip.Entries) {
                        if(entry.FullName.EndsWith("/"))continue;
                        string target=Path.GetFullPath(Path.Combine(SiteDir,entry.FullName));
                        if(!target.StartsWith(SiteDir+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new IOException("无效的程序文件路径");
                        Directory.CreateDirectory(Path.GetDirectoryName(target));
                        using(var source=entry.Open())using(var output=File.Create(target))source.CopyTo(output);
                    }
                }
                File.WriteAllText(Path.Combine(SiteDir,".complete"),"ok");
            }
        }
        internal static byte[] ReadResource(string name) {
            using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream(name)) {
                if(stream==null)throw new IOException("缺少程序文件："+name);
                using(var memory=new MemoryStream()){stream.CopyTo(memory);return memory.ToArray();}
            }
        }
        internal static void WriteFile(string target,byte[] bytes) {
            string temp=target+".writing-"+Guid.NewGuid().ToString("N");
            try{File.WriteAllBytes(temp,bytes);if(File.Exists(target))File.Replace(temp,target,null);else File.Move(temp,target);}
            finally{if(File.Exists(temp))File.Delete(temp);}
        }
        private static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
        internal static void Log(Exception error) {
            try{if(DataDir!=null)File.AppendAllText(Path.Combine(DataDir,"startup.log"),DateTimeOffset.Now+" "+error+Environment.NewLine);}catch{}
        }
        internal static void Trace(string message){if(TestMode&&DataDir!=null)File.AppendAllText(Path.Combine(DataDir,"test-lifecycle.log"),DateTimeOffset.Now+" "+message+Environment.NewLine);}
    }
}
