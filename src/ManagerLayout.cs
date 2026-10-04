using System;
using System.Drawing;
using System.Windows.Forms;
internal sealed class UiContext {
 internal string Choice,Locale,WarningCode="";
 internal Localization Catalogue;
 internal string Direction {get{return Catalogue.Direction;}}
 internal static UiContext Create(string choice,string systemUiLocale,string catalogueDirectory){string locale=Localization.ResolveLocale(choice,systemUiLocale);return new UiContext{Choice=choice,Locale=locale,Catalogue=Localization.Load(catalogueDirectory,locale)};}
}
internal sealed class UiChoice {
 internal string Value,Text;
 internal UiChoice(string value,string text){Value=value;Text=text;}
 public override string ToString(){return Text;}
}
internal sealed class UiTextBinding {internal string Key;internal UiTextBinding(string key){Key=key;}}
internal static class ManagerLayout {
 internal static readonly Color Background=Color.FromArgb(28,31,45),Foreground=Color.FromArgb(239,238,247);
 internal static void Style(Form form,Size size){form.ClientSize=size;form.MinimumSize=new Size(800,650);form.BackColor=Background;form.ForeColor=Foreground;form.Font=new Font("Segoe UI",10);form.AutoScaleMode=AutoScaleMode.Dpi;}
 internal static TableLayoutPanel Table(Form form){var table=new TableLayoutPanel{Dock=DockStyle.Fill,AutoScroll=true,ColumnCount=1,Padding=new Padding(18),Name="content"};table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));form.Controls.Add(table);return table;}
 internal static void Row(TableLayoutPanel table,Control control){int row=table.RowCount++;table.RowStyles.Add(new RowStyle(SizeType.AutoSize));control.Margin=new Padding(0,4,0,6);table.Controls.Add(control,0,row);}
 internal static Label Label(string name,string key,UiContext ui){var label=new Label{Name=name,AutoSize=true,Dock=DockStyle.Fill,MaximumSize=new Size(900,0)};Bind(label,key,ui);return label;}
 internal static void Bind(Control control,string key,UiContext ui){control.Tag=new UiTextBinding(key);control.Text=ui.Catalogue.Text(key);control.AccessibleName=control.Text;}
 internal static Button Button(string name,string key,UiContext ui){var button=new Button{Name=name,AutoSize=true,AutoSizeMode=AutoSizeMode.GrowAndShrink,MinimumSize=new Size(130,40),Padding=new Padding(12,6,12,6),Margin=new Padding(0,0,10,8),FlatStyle=FlatStyle.Flat,BackColor=Color.FromArgb(62,66,91),ForeColor=Foreground};button.FlatAppearance.BorderColor=Color.FromArgb(151,148,180);Bind(button,key,ui);return button;}
 internal static FlowLayoutPanel Flow(params Control[] controls){var row=new FlowLayoutPanel{Dock=DockStyle.Fill,AutoSize=true,AutoSizeMode=AutoSizeMode.GrowAndShrink,WrapContents=true,FlowDirection=FlowDirection.LeftToRight};row.Controls.AddRange(controls);return row;}
 internal static ComboBox Combo(string name){return new ComboBox{Name=name,DropDownStyle=ComboBoxStyle.DropDownList,Width=330,DropDownWidth=600,Margin=new Padding(0,3,12,6)};}
 internal static TextBox ReadOnly(string name,int height){return new TextBox{Name=name,ReadOnly=true,Multiline=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill,Height=height,MinimumSize=new Size(100,height),BackColor=Color.FromArgb(40,44,62),ForeColor=Foreground,RightToLeft=RightToLeft.No,BorderStyle=BorderStyle.FixedSingle};}
 internal static void Apply(Control root,UiContext ui){
  root.RightToLeft=ui.Direction=="rtl"?RightToLeft.Yes:RightToLeft.No;
  var form=root as Form;if(form!=null)form.RightToLeftLayout=ui.Direction=="rtl";
  ApplyText(root,ui);root.PerformLayout();
 }
 static void ApplyText(Control root,UiContext ui){
  var binding=root.Tag as UiTextBinding;if(binding!=null){root.Text=ui.Catalogue.Text(binding.Key);root.AccessibleName=root.Text;}
  foreach(Control child in root.Controls){if(child is TextBox&&((TextBox)child).ReadOnly)child.RightToLeft=RightToLeft.No;ApplyText(child,ui);}
 }
 internal static void FitLabels(Control root,int available){foreach(Control control in root.Controls){var label=control as Label;if(label!=null)label.MaximumSize=new Size(Math.Max(120,Math.Min(available,label.Parent.ClientSize.Width-8)),0);FitLabels(control,available);}}
 internal static string ChoiceValue(ComboBox combo,string fallback){var choice=combo.SelectedItem as UiChoice;return choice==null?fallback:choice.Value;}
 internal static void Choices(ComboBox combo,string[] values,string[] keys,UiContext ui,string selected){combo.BeginUpdate();combo.Items.Clear();for(int i=0;i<values.Length;i++)combo.Items.Add(new UiChoice(values[i],ui.Catalogue.Text(keys[i])));combo.SelectedIndex=Math.Max(0,Array.IndexOf(values,selected));combo.EndUpdate();}
}
