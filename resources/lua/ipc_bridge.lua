#@
-- JSON-RPC bridge for launcher-managed PoB headless sessions.
-- Run with cwd set to the active PoB vault directory.

io.stdout:setvbuf("no")
io.stderr:setvbuf("no")

local headlessPath = (arg and arg[1]) or "HeadlessWrapper.lua"
dofile(headlessPath)

local json = require("dkjson")

local function rpc_send(obj)
	io.stdout:write(json.encode(obj) .. "\n")
	io.stdout:flush()
end

local function current_build()
	if launch and launch.main and launch.main.modes then
		return launch.main.modes["BUILD"]
	end
	return build
end

local function build_summary()
	local b = current_build()
	return {
		ok = true,
		className = b and b.spec and b.spec.curClassName or "",
		ascendClassName = b and b.spec and b.spec.curAscendClassName or "",
		level = b and b.characterLevel or 0,
	}
end

local function handle_method(method, params)
	params = params or {}
	if method == "pob.ping" then
		return {
			pong = true,
			pobVersion = launch and launch.versionNumber or "?",
		}
	elseif method == "pob.loadBuildXml" then
		if type(params.xml) ~= "string" then
			error("pob.loadBuildXml requires params.xml")
		end
		loadBuildFromXML(params.xml, params.name or "RPC build")
		build = current_build()
		return build_summary()
	elseif method == "pob.exportBuildXml" then
		local b = current_build()
		if not b or not b.SaveDB then
			error("No active BUILD mode")
		end
		return { xml = b:SaveDB(params.fileName or "export") }
	else
		error("Unknown method: " .. tostring(method))
	end
end

rpc_send({
	jsonrpc = "2.0",
	method = "_ready",
	params = { pobVersion = launch and launch.versionNumber or "?" },
})

while true do
	local line = io.read("*l")
	if not line then
		break
	end
	if line ~= "" then
		local req, _pos, err = json.decode(line)
		if not req then
			rpc_send({
				jsonrpc = "2.0",
				error = { code = -32700, message = err or "Parse error" },
			})
		else
			local ok, result = pcall(handle_method, req.method, req.params)
			if ok then
				rpc_send({ jsonrpc = "2.0", id = req.id, result = result })
			else
				rpc_send({
					jsonrpc = "2.0",
					id = req.id,
					error = { code = -32603, message = tostring(result) },
				})
			end
		end
	end
end
