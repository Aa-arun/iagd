namespace IAGrim.UI
{
    partial class AppHost {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing) {
            if (disposing && (components != null)) {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// 只保留**真的还要用**的三样：托盘图标、托盘菜单、状态栏。
        ///
        /// 曾经的 TabControl + 四个 TabPage + 四个空 Panel（旧的 Items / Online / Settings / Mods 页）
        /// 随界面搬到网页一起删了。`statusStrip` 留着是因为代码仍往 `statusLabel` 写状态文本
        /// ——窗口虽然永不显示，但那几处赋值同时也是给日志和错误提示用的。
        /// </summary>
        private void InitializeComponent() {
            components = new System.ComponentModel.Container();
            var resources = new System.ComponentModel.ComponentResourceManager(typeof(AppHost));
            statusStrip = new StatusStrip();
            statusLabel = new ToolStripStatusLabel();
            tsVersionNumber = new ToolStripStatusLabel();
            notifyIcon1 = new NotifyIcon(components);
            trayContextMenuStrip = new ContextMenuStrip(components);
            openToolStripMenuItem = new ToolStripMenuItem();
            exitToolStripMenuItem = new ToolStripMenuItem();
            statusStrip.SuspendLayout();
            trayContextMenuStrip.SuspendLayout();
            SuspendLayout();
            // 
            // statusStrip
            // 
            statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel, tsVersionNumber });
            statusStrip.Location = new Point(0, 625);
            statusStrip.Name = "statusStrip";
            statusStrip.Padding = new Padding(1, 0, 16, 0);
            statusStrip.Size = new Size(1210, 22);
            statusStrip.TabIndex = 25;
            statusStrip.Text = "statusStrip1";
            // 
            // statusLabel
            // 
            statusLabel.Name = "statusLabel";
            statusLabel.Size = new Size(1032, 17);
            statusLabel.Spring = true;
            statusLabel.Text = "GD Item Assistant";
            statusLabel.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // tsVersionNumber
            // 
            tsVersionNumber.ImageAlign = ContentAlignment.MiddleRight;
            tsVersionNumber.Name = "tsVersionNumber";
            tsVersionNumber.Size = new Size(69, 17);
            tsVersionNumber.Tag = "";
            tsVersionNumber.Text = "placeholder";
            tsVersionNumber.TextAlign = ContentAlignment.MiddleRight;
            // 
            // notifyIcon1
            // 
            notifyIcon1.BalloonTipTitle = "Item Assistant";
            notifyIcon1.ContextMenuStrip = trayContextMenuStrip;
            notifyIcon1.Icon = (Icon)resources.GetObject("notifyIcon1.Icon");
            notifyIcon1.Text = "GD Item Assistant";
            notifyIcon1.Visible = true;
            // 
            // trayContextMenuStrip
            // 
            trayContextMenuStrip.Items.AddRange(new ToolStripItem[] { openToolStripMenuItem, exitToolStripMenuItem });
            trayContextMenuStrip.Name = "trayContextMenuStrip";
            trayContextMenuStrip.Size = new Size(104, 48);
            trayContextMenuStrip.Opening += trayContextMenuStrip_Opening;
            // 
            // openToolStripMenuItem
            // 
            openToolStripMenuItem.Name = "openToolStripMenuItem";
            openToolStripMenuItem.Size = new Size(103, 22);
            openToolStripMenuItem.Tag = "iatag_ui_tray_open";
            openToolStripMenuItem.Text = "Open";
            openToolStripMenuItem.Click += openToolStripMenuItem_Click;
            // 
            // exitToolStripMenuItem
            // 
            exitToolStripMenuItem.Name = "exitToolStripMenuItem";
            exitToolStripMenuItem.Size = new Size(103, 22);
            exitToolStripMenuItem.Tag = "iatag_ui_tray_exit";
            exitToolStripMenuItem.Text = "Exit";
            exitToolStripMenuItem.Click += exitToolStripMenuItem_Click;
            // 
            // AppHost
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = SystemColors.Control;
            ClientSize = new Size(1210, 647);
            Icon = (Icon)resources.GetObject("$this.Icon");
            Margin = new Padding(4, 3, 4, 3);
            MinimumSize = new Size(931, 686);
            Name = "AppHost";
            Text = "Grim Dawn Item Assistant";
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            trayContextMenuStrip.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private System.Windows.Forms.StatusStrip statusStrip;
        private System.Windows.Forms.ToolStripStatusLabel statusLabel;
        private System.Windows.Forms.ToolStripStatusLabel tsVersionNumber;
        private System.Windows.Forms.NotifyIcon notifyIcon1;
        private System.Windows.Forms.ContextMenuStrip trayContextMenuStrip;
        private System.Windows.Forms.ToolStripMenuItem openToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem exitToolStripMenuItem;
    }
}
