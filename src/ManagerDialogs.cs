using System;
using System.Drawing;
using System.Windows.Forms;
using System.Collections.Generic;
internal static class LocalizedConfirm {
 internal static Form Create(IWin32Window owner,UiContext ui,string titleKey,string messageKey,Dictionary<string,object> args,MessageBoxButtons buttons){return CreateText(owner,ui,titleKey,ui.Catalogue.Text(messageKey,args),null,buttons);}
 internal static Form CreateText(IWin32Window owner,UiContext ui,string titleKey,string text,string details,MessageBoxButtons buttons){
  var form=new Form{Text=ui.Catalogue.Text(titleKey),StartPosition=FormStartPosition.CenterParent,ShowInTaskbar=false,MinimizeBox=false,MaximizeBox=false};ManagerLayout.Style(form,new Size(690,430));form.MinimumSize=new Size(540,340);
  var table=ManagerLayout.Table(form);var body=new TextBox{Text=text,Multiline=true,ReadOnly=true,BorderStyle=BorderStyle.None,BackColor=ManagerLayout.Background,ForeColor=ManagerLayout.Foreground,Dock=DockStyle.Fill,Height=String.IsNullOrEmpty(details)?240:120,ScrollBars=ScrollBars.Vertical,Name="confirm-body"};ManagerLayout.Row(table,body);
  if(!String.IsNullOrEmpty(details)){var raw=ManagerLayout.ReadOnly("confirm-details",160);raw.Text=details;ManagerLayout.Row(table,raw);}
  bool yesNo=buttons==MessageBoxButtons.YesNo;var positive=ManagerLayout.Button("confirm-ok",yesNo?"button.yes":"button.ok",ui);positive.DialogResult=yesNo?DialogResult.Yes:DialogResult.OK;
  var row=ManagerLayout.Flow(positive);form.AcceptButton=positive;
  if(buttons!=MessageBoxButtons.OK){var negative=ManagerLayout.Button("confirm-cancel",yesNo?"button.no":"button.cancel",ui);negative.DialogResult=yesNo?DialogResult.No:DialogResult.Cancel;row.Controls.Add(negative);form.CancelButton=negative;}else form.CancelButton=positive;
  ManagerLayout.Row(table,row);ManagerLayout.Apply(form,ui);body.RightToLeft=ui.Direction=="rtl"?RightToLeft.Yes:RightToLeft.No;return form;
 }
 internal static DialogResult Show(IWin32Window owner,UiContext ui,string messageKey,Dictionary<string,object> args,MessageBoxButtons buttons){using(var form=Create(owner,ui,"app.title",messageKey,args,buttons))return form.ShowDialog(owner);}
 internal static DialogResult ShowText(IWin32Window owner,UiContext ui,string titleKey,string text,MessageBoxButtons buttons=MessageBoxButtons.OK,string details=null){using(var form=CreateText(owner,ui,titleKey,text,details,buttons))return form.ShowDialog(owner);}
}
