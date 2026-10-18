using System;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using System.Management.Automation;
using System.Management.Automation.Runspaces;

[assembly: AssemblyTitle("PokéPulse")]
[assembly: AssemblyProduct("PokéPulse")]
[assembly: AssemblyDescription("PokéPulse stream overlay")]
[assembly: AssemblyCompany("Athena")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

static class PokepulseHost {
    [STAThread]
    static int Main(string[] args) {
        string directory = AppDomain.CurrentDomain.BaseDirectory;
        try {
            int port = args.Length == 0 ? 3001 : int.Parse(args[0]);
            if (port < 1 || port > 65535) throw new ArgumentException("Invalid service port");
            Directory.SetCurrentDirectory(Path.GetDirectoryName(directory.TrimEnd(Path.DirectorySeparatorChar)));
            using (Runspace runspace = RunspaceFactory.CreateRunspace()) {
                runspace.ApartmentState = ApartmentState.STA;
                runspace.ThreadOptions = PSThreadOptions.UseCurrentThread;
                runspace.Open();
                using (PowerShell shell = PowerShell.Create()) {
                    shell.Runspace = runspace;
                    shell.AddCommand("Set-ExecutionPolicy").AddParameter("Scope", "Process").AddParameter("ExecutionPolicy", "Bypass").AddParameter("Force").Invoke();
                    shell.Commands.Clear();
                    shell.AddCommand(Path.Combine(directory, "pokepulse-overlay.ps1")).AddArgument(port).Invoke();
                    if (shell.HadErrors) throw new Exception(String.Join(Environment.NewLine, shell.Streams.Error));
                }
            }
            return 0;
        } catch (Exception error) {
            File.WriteAllText(Path.Combine(directory, "pokepulse-host-error.log"), error.ToString());
            MessageBox.Show(error.Message, "PokéPulse", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
