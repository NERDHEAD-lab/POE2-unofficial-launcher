param(
  [Parameter(Mandatory = $true)]
  [string]$Request
)

$ErrorActionPreference = 'Stop'

$requestJson = [System.IO.File]::ReadAllText($Request, [System.Text.Encoding]::UTF8)
$requestData = $requestJson | ConvertFrom-Json
Remove-Item -LiteralPath $Request -Force -ErrorAction SilentlyContinue

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

public static class HiddenWindowsJobSupervisor
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint STARTF_USESHOWWINDOW = 0x00000001;
    private const uint STARTF_USESTDHANDLES = 0x00000100;
    private const short SW_HIDE = 0;
    private const uint HANDLE_FLAG_INHERIT = 0x00000001;
    private const uint GENERIC_READ = 0x80000000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint OPEN_EXISTING = 3;
    private const uint INFINITE = 0xFFFFFFFF;
    private const uint SYNCHRONIZE = 0x00100000;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessW(
        string lpApplicationName,
        StringBuilder lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(
        out IntPtr hReadPipe,
        out IntPtr hWritePipe,
        ref SECURITY_ATTRIBUTES lpPipeAttributes,
        uint nSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(
        IntPtr hObject,
        uint dwMask,
        uint dwFlags);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateFileW(
        string lpFileName,
        uint dwDesiredAccess,
        uint dwShareMode,
        ref SECURITY_ATTRIBUTES lpSecurityAttributes,
        uint dwCreationDisposition,
        uint dwFlagsAndAttributes,
        IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObjectW(
        IntPtr lpJobAttributes,
        string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr hJob,
        int JobObjectInfoClass,
        IntPtr lpJobObjectInfo,
        uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(
        IntPtr hJob,
        IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForMultipleObjects(
        uint nCount,
        IntPtr[] lpHandles,
        bool bWaitAll,
        uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(
        uint dwDesiredAccess,
        bool bInheritHandle,
        uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    private static void ThrowLastError(string operation)
    {
        throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }

    private static string QuoteArgument(string value)
    {
        if (value.Length == 0) return "\"\"";
        if (value.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '\"' }) < 0) return value;

        var result = new StringBuilder("\"");
        var backslashes = 0;
        foreach (var character in value)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }
            if (character == '\"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('\"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(character);
        }
        result.Append('\\', backslashes * 2);
        result.Append('\"');
        return result.ToString();
    }

    private static string BuildCommandLine(string command, string[] arguments)
    {
        var commandLine = new StringBuilder(QuoteArgument(command));
        foreach (var argument in arguments)
        {
            commandLine.Append(' ');
            commandLine.Append(QuoteArgument(argument));
        }
        return commandLine.ToString();
    }

    private static void WriteStatus(string statusPath, uint targetPid, string state)
    {
        var temporaryPath = statusPath + "." +
            System.Diagnostics.Process.GetCurrentProcess().Id + ".tmp";
        var json = "{\"schemaVersion\":1,\"state\":\"" + state +
            "\",\"targetPid\":" + targetPid + "}" + Environment.NewLine;
        Directory.CreateDirectory(Path.GetDirectoryName(statusPath));
        File.WriteAllText(temporaryPath, json, new UTF8Encoding(false));
        if (File.Exists(statusPath)) File.Delete(statusPath);
        File.Move(temporaryPath, statusPath);
    }

    public static int Run(uint ownerPid, string command, string[] arguments, string cwd, string statusPath)
    {
        var security = new SECURITY_ATTRIBUTES
        {
            nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)),
            bInheritHandle = true
        };
        IntPtr stdoutRead = IntPtr.Zero;
        IntPtr stdoutWrite = IntPtr.Zero;
        IntPtr stderrRead = IntPtr.Zero;
        IntPtr stderrWrite = IntPtr.Zero;
        IntPtr stdinHandle = IntPtr.Zero;
        IntPtr jobHandle = IntPtr.Zero;
        IntPtr ownerHandle = IntPtr.Zero;
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        FileStream stdoutStream = null;
        FileStream stderrStream = null;
        var targetLifecycleComplete = false;

        try
        {
            ownerHandle = OpenProcess(SYNCHRONIZE, false, ownerPid);
            if (ownerHandle == IntPtr.Zero) ThrowLastError("OpenProcess(owner)");
            if (!CreatePipe(out stdoutRead, out stdoutWrite, ref security, 0)) ThrowLastError("CreatePipe(stdout)");
            if (!SetHandleInformation(stdoutRead, HANDLE_FLAG_INHERIT, 0)) ThrowLastError("SetHandleInformation(stdout)");
            if (!CreatePipe(out stderrRead, out stderrWrite, ref security, 0)) ThrowLastError("CreatePipe(stderr)");
            if (!SetHandleInformation(stderrRead, HANDLE_FLAG_INHERIT, 0)) ThrowLastError("SetHandleInformation(stderr)");
            stdinHandle = CreateFileW("NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                ref security, OPEN_EXISTING, 0, IntPtr.Zero);
            if (stdinHandle == new IntPtr(-1)) ThrowLastError("CreateFile(NUL)");

            jobHandle = CreateJobObjectW(IntPtr.Zero, null);
            if (jobHandle == IntPtr.Zero) ThrowLastError("CreateJobObject");
            var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            var limitsSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            var limitsPointer = Marshal.AllocHGlobal(limitsSize);
            try
            {
                Marshal.StructureToPtr(limits, limitsPointer, false);
                if (!SetInformationJobObject(jobHandle, JobObjectExtendedLimitInformation,
                    limitsPointer, (uint)limitsSize)) ThrowLastError("SetInformationJobObject");
            }
            finally
            {
                Marshal.FreeHGlobal(limitsPointer);
            }

            var startup = new STARTUPINFO
            {
                cb = Marshal.SizeOf(typeof(STARTUPINFO)),
                dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES,
                wShowWindow = SW_HIDE,
                hStdInput = stdinHandle,
                hStdOutput = stdoutWrite,
                hStdError = stderrWrite
            };
            var commandLine = new StringBuilder(BuildCommandLine(command, arguments));
            if (!CreateProcessW(command, commandLine, IntPtr.Zero, IntPtr.Zero, true,
                CREATE_SUSPENDED | CREATE_NO_WINDOW, IntPtr.Zero, cwd, ref startup, out process))
                ThrowLastError("CreateProcessW");

            if (!AssignProcessToJobObject(jobHandle, process.hProcess))
                ThrowLastError("AssignProcessToJobObject");

            WriteStatus(statusPath, process.dwProcessId, "assigned");
            if (ResumeThread(process.hThread) == 0xFFFFFFFF) ThrowLastError("ResumeThread");
            WriteStatus(statusPath, process.dwProcessId, "running");

            CloseHandle(stdoutWrite);
            stdoutWrite = IntPtr.Zero;
            CloseHandle(stderrWrite);
            stderrWrite = IntPtr.Zero;
            CloseHandle(stdinHandle);
            stdinHandle = IntPtr.Zero;
            CloseHandle(process.hThread);
            process.hThread = IntPtr.Zero;

            stdoutStream = new FileStream(new SafeFileHandle(stdoutRead, true), FileAccess.Read, 4096, false);
            stdoutRead = IntPtr.Zero;
            stderrStream = new FileStream(new SafeFileHandle(stderrRead, true), FileAccess.Read, 4096, false);
            stderrRead = IntPtr.Zero;
            var stdoutCopy = Task.Run(() => stdoutStream.CopyTo(Console.OpenStandardOutput()));
            var stderrCopy = Task.Run(() => stderrStream.CopyTo(Console.OpenStandardError()));

            var waitResult = WaitForMultipleObjects(
                2,
                new[] { process.hProcess, ownerHandle },
                false,
                INFINITE);
            if (waitResult == WAIT_OBJECT_0 + 1)
            {
                CloseHandle(jobHandle);
                jobHandle = IntPtr.Zero;
                WaitForSingleObject(process.hProcess, 5000);
                targetLifecycleComplete = true;
                return 125;
            }
            if (waitResult != WAIT_OBJECT_0) ThrowLastError("WaitForMultipleObjects");
            uint exitCode;
            if (!GetExitCodeProcess(process.hProcess, out exitCode)) ThrowLastError("GetExitCodeProcess");

            CloseHandle(jobHandle);
            jobHandle = IntPtr.Zero;
            Task.WaitAll(stdoutCopy, stderrCopy);
            targetLifecycleComplete = true;
            return unchecked((int)exitCode);
        }
        finally
        {
            if (!targetLifecycleComplete && process.hProcess != IntPtr.Zero)
            {
                TerminateProcess(process.hProcess, 125);
                WaitForSingleObject(process.hProcess, 5000);
            }
            if (stdoutStream != null) stdoutStream.Dispose();
            if (stderrStream != null) stderrStream.Dispose();
            if (jobHandle != IntPtr.Zero) CloseHandle(jobHandle);
            if (ownerHandle != IntPtr.Zero) CloseHandle(ownerHandle);
            if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
            if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
            if (stdoutRead != IntPtr.Zero) CloseHandle(stdoutRead);
            if (stdoutWrite != IntPtr.Zero) CloseHandle(stdoutWrite);
            if (stderrRead != IntPtr.Zero) CloseHandle(stderrRead);
            if (stderrWrite != IntPtr.Zero) CloseHandle(stderrWrite);
            if (stdinHandle != IntPtr.Zero && stdinHandle != new IntPtr(-1)) CloseHandle(stdinHandle);
        }
    }
}
'@

$arguments = @($requestData.arguments | ForEach-Object { [string]$_ })
$exitCode = [HiddenWindowsJobSupervisor]::Run(
  [uint32]$requestData.ownerPid,
  [string]$requestData.command,
  [string[]]$arguments,
  [string]$requestData.cwd,
  [string]$requestData.statusPath
)
exit $exitCode
