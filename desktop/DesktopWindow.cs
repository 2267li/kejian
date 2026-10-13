using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KejianDesktop {
    internal sealed class DesktopWindow:Form {
        private readonly WebView2 browser=new WebView2();
        private readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=24*1024*1024};
        private bool closingConfirmed;
        internal DesktopWindow() {
            Program.Trace("window constructor");
            Text="课间 · 通知转待办";StartPosition=FormStartPosition.CenterScreen;
            ClientSize=new Size(1180,800);MinimumSize=new Size(820,620);AutoScaleMode=AutoScaleMode.Dpi;
            BackColor=Color.FromArgb(247,248,251);
            using(var icon=new MemoryStream(Program.ReadResource("app.ico")))Icon=new Icon(icon);
            browser.Dock=DockStyle.Fill;Controls.Add(browser);
            Shown+=async (sender,args)=>await Initialize();
            FormClosing+=OnClosing;
        }
        private async Task Initialize() {
            Program.Trace("window shown");
            try {
                var options=new CoreWebView2EnvironmentOptions();
                options.AdditionalBrowserArguments="--disable-background-networking --disable-component-update";
                if(Program.TestMode&&Program.DebugPort!=0)options.AdditionalBrowserArguments+=" --remote-debugging-address=127.0.0.1 --remote-debugging-port="+Program.DebugPort;
                var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.DataDir,"webview"),options);
                Program.Trace("environment ready");
                await browser.EnsureCoreWebView2Async(environment);
                Program.Trace("control ready");
                var core=browser.CoreWebView2;
                core.Settings.AreHostObjectsAllowed=false;
                core.Settings.AreDevToolsEnabled=Program.TestMode;
                core.Settings.AreDefaultContextMenusEnabled=false;
                core.Settings.IsStatusBarEnabled=false;
                core.Settings.IsZoomControlEnabled=true;
                core.Settings.IsPasswordAutosaveEnabled=false;
                core.Settings.IsGeneralAutofillEnabled=false;
                core.SetVirtualHostNameToFolderMapping("kejian.local",Program.SiteDir,CoreWebView2HostResourceAccessKind.DenyCors);
                core.NavigationStarting+=(sender,args)=>{if(!IsLocal(args.Uri))args.Cancel=true;};
                core.NewWindowRequested+=(sender,args)=>{args.Handled=true;};
                core.PermissionRequested+=(sender,args)=>{args.State=CoreWebView2PermissionState.Deny;};
                core.DownloadStarting+=(sender,args)=>{args.Cancel=true;}; // Files use the explicit save bridge.
                core.WebMessageReceived+=OnMessage;
                core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
                core.WebResourceRequested+=(sender,args)=>{
                    if(!IsLocal(args.Request.Uri)&&!args.Request.Uri.StartsWith("data:")&&!args.Request.Uri.StartsWith("blob:https://kejian.local/"))
                        args.Response=environment.CreateWebResourceResponse(new MemoryStream(),403,"Offline application","Content-Type: text/plain");
                };
                core.ProcessFailed+=(sender,args)=>{
                    Program.Log(new Exception("WebView process stopped: "+args.ProcessFailedKind));
                    if(!Program.TestMode)MessageBox.Show(this,"显示组件已停止，请关闭并重新打开课间。已保存的待办仍会保留。","课间");
                };
                core.Navigate("https://kejian.local/index.html");
            } catch(Exception error) {
                Program.Log(error);
                if(!Program.TestMode)MessageBox.Show(this,"桌面组件未能启动。请确认电脑已安装 Microsoft Edge WebView2 运行环境。\n\n说明文件中提供了微软官方下载地址。\n\n"+error.Message,"课间",MessageBoxButtons.OK,MessageBoxIcon.Error);
                closingConfirmed=true;Close();Environment.ExitCode=1;
            }
        }
        private static bool IsLocal(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.Scheme=="https"&&uri.Host=="kejian.local"&&uri.IsDefaultPort;}
        private void OnMessage(object sender,CoreWebView2WebMessageReceivedEventArgs args) {
            if(!IsLocal(args.Source))return;
            string id="";
            try {
                var request=json.Deserialize<Dictionary<string,object>>(args.WebMessageAsJson);
                id=Convert.ToString(request["id"]);
                string command=Convert.ToString(request["command"]);
                if(Program.TestMode&&command=="test-close"){closingConfirmed=true;Close();return;}
                if(command=="show-data-folder") {
                    Process.Start(new ProcessStartInfo("explorer.exe","\""+Program.DataDir+"\""){UseShellExecute=true});return;
                }
                if(command!="save-file")return;
                string name=Path.GetFileName(Convert.ToString(request["name"])),text=Convert.ToString(request["text"]),extension=Path.GetExtension(name).ToLowerInvariant();
                if(extension!=".json"&&extension!=".ics"&&extension!=".txt")throw new ArgumentException("不支持这种文件类型");
                byte[] bytes=new UTF8Encoding(false).GetBytes(text);
                if(bytes.Length>10*1024*1024)throw new ArgumentException("文件超过 10 MB，请减少记录后重试");
                string target;
                if(Program.TestMode) {
                    string folder=Path.Combine(Program.DataDir,"exports");Directory.CreateDirectory(folder);target=Path.Combine(folder,name);
                } else {
                    using(var dialog=new SaveFileDialog()) {
                        dialog.Title=extension==".json"?"保存一份课间备份":"保存文件";
                        string folder=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"备份");Directory.CreateDirectory(folder);
                        dialog.InitialDirectory=folder;dialog.FileName=name;dialog.DefaultExt=extension.Substring(1);dialog.AddExtension=true;dialog.OverwritePrompt=true;
                        dialog.Filter=extension==".json"?"课间备份 (*.json)|*.json":extension==".ics"?"日历文件 (*.ics)|*.ics":"文本文件 (*.txt)|*.txt";
                        if(dialog.ShowDialog(this)!=DialogResult.OK){Reply(id,false,null);return;}
                        target=dialog.FileName;
                    }
                }
                Program.WriteFile(target,bytes);Reply(id,true,null);
            } catch(Exception error){Program.Log(error);Reply(id,false,"没有保存成功，请检查文件夹权限和剩余空间。" );}
        }
        private void Reply(string id,bool saved,string error){browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{type="save-result",id=id,saved=saved,error=error}));}
        private async void OnClosing(object sender,FormClosingEventArgs args) {
            if(closingConfirmed||browser.CoreWebView2==null)return;
            args.Cancel=true;
            try {
                string dirty=await browser.CoreWebView2.ExecuteScriptAsync("Boolean(document.querySelector('#notice')?.value.trim() || !document.querySelector('#draftForm')?.classList.contains('hidden'))");
                if(dirty=="true"&&!Program.TestMode&&MessageBox.Show(this,"还有未保存的通知或草稿，确定关闭吗？","课间",MessageBoxButtons.OKCancel,MessageBoxIcon.Question)!=DialogResult.OK)return;
            }catch{}
            closingConfirmed=true;Close();
        }
        protected override void Dispose(bool disposing){if(disposing)browser.Dispose();base.Dispose(disposing);}
    }
}
