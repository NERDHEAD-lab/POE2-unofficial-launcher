(function () {
  "use strict";

  var fso = new ActiveXObject("Scripting.FileSystemObject");

  function readUtf8(filePath) {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2;
    stream.Charset = "utf-8";
    stream.Open();
    stream.LoadFromFile(filePath);
    var text = stream.ReadText();
    stream.Close();
    return text;
  }

  function writeUtf8(filePath, text) {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2;
    stream.Charset = "utf-8";
    stream.Open();
    stream.WriteText(text);
    stream.SaveToFile(filePath, 2);
    stream.Close();
  }

  function escapeJson(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
  }

  function writeBootstrapLog(message) {
    try {
      if (request && request.bootstrapLogPath) {
        writeUtf8(request.bootstrapLogPath, String(message) + "\r\n");
      }
    } catch (_error) {
      // The public entrypoint has a bounded missing-result failure.
    }
  }

  function quoteWindowsArgument(value) {
    var text = String(value);
    return (
      '"' + text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1") + '"'
    );
  }

  var requestPath =
    WScript.Arguments.length > 0 ? WScript.Arguments.Item(0) : "";
  if (!requestPath || !fso.FileExists(requestPath)) {
    WScript.Quit(2);
  }

  var request;
  try {
    request = eval("(" + readUtf8(requestPath) + ")");
    if (!request.windowsNodeExe || !request.workerPath || !request.resultPath) {
      throw new Error("Runner bootstrap request is incomplete.");
    }
    writeBootstrapLog("request-validated");

    var command =
      quoteWindowsArgument(request.windowsNodeExe) +
      " " +
      quoteWindowsArgument(request.workerPath) +
      " --request " +
      quoteWindowsArgument(requestPath);
    var shell = new ActiveXObject("WScript.Shell");
    shell.Run(command, 0, false);
    writeBootstrapLog("worker-launch-requested");
  } catch (error) {
    var bootstrapError =
      "bootstrap-error: " +
      String(error.description || error.message || error) +
      " (number=" +
      String(error.number || "unknown") +
      ")";
    writeBootstrapLog(bootstrapError);
    try {
      if (request && request.resultPath) {
        var errorText = String(error.description || error.message || error);
        var errorResult =
          '{"schemaVersion":1,"runId":"' +
          escapeJson(request.runId || "") +
          '","status":"bootstrap-error","exitCode":null,"signal":null,"timedOut":false,"error":"' +
          escapeJson(errorText) +
          '"}\r\n';
        writeUtf8(request.resultPath, errorResult);
      }
    } catch (_writeError) {
      // The public entrypoint will report a bounded missing-result error.
    }
    try {
      if (requestPath && fso.FileExists(requestPath)) {
        fso.DeleteFile(requestPath, true);
      }
    } catch (_deleteError) {
      // The public entrypoint also attempts a best-effort unlink.
    }
    WScript.Quit(1);
  }

  WScript.Quit(0);
})();
