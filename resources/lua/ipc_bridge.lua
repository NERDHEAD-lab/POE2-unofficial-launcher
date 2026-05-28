#@
-- JSON-RPC bridge for launcher-managed PoB headless sessions.
-- Run with cwd set to the active PoB vault directory.

io.stdout:setvbuf("no")
io.stderr:setvbuf("no")

local headlessPath = (arg and arg[1]) or "HeadlessWrapper.lua"
dofile(headlessPath)

local json = require("dkjson")
local b64 = require("base64")

local function rpc_send(obj)
	io.stdout:write(json.encode(obj) .. "\n")
	io.stdout:flush()
end

local next_internal_id = 0

local function sync_rpc_request(method, params)
	next_internal_id = next_internal_id + 1
	local id = "_lua_" .. tostring(next_internal_id)
	rpc_send({
		jsonrpc = "2.0",
		id = id,
		method = method,
		params = params or {},
	})

	while true do
		local line = io.read("*l")
		if not line then
			error("Node RPC stream closed during " .. tostring(method))
		end
		if line ~= "" then
			local response, _pos, err = json.decode(line)
			if not response then
				error("Node RPC parse error: " .. tostring(err))
			end
			if response.id == id then
				if response.error then
					error(response.error.message or "Node RPC error")
				end
				return response.result or {}
			end
			error("Unexpected Node RPC response while waiting for " .. tostring(method))
		end
	end
end

function Inflate(data)
	local response = sync_rpc_request("_internal.inflate", {
		data = b64.encode(data or ""),
	})
	return b64.decode(response.data or "")
end

function Deflate(data)
	local response = sync_rpc_request("_internal.deflate", {
		data = b64.encode(data or ""),
	})
	return b64.decode(response.data or "")
end

local function current_build()
	if launch and launch.main and launch.main.modes then
		return launch.main.modes["BUILD"]
	end
	return build
end

local function decode_attr(value)
	return (value or "")
		:gsub("&quot;", "\"")
		:gsub("&gt;", ">")
		:gsub("&lt;", "<")
		:gsub("&amp;", "&")
end

local function strip_colour_codes(value)
	if type(value) ~= "string" then
		return value
	end
	return value:gsub("%^x%x%x%x%x%x%x", ""):gsub("%^%d", "")
end

local function collect_player_stats(xml_text)
	local stats = {}
	for attrs in tostring(xml_text or ""):gmatch("<PlayerStat%s+([^>]*)") do
		local stat = attrs:match('stat="([^"]*)"')
		local value = attrs:match('value="([^"]*)"')
		if stat and value then
			local numeric = tonumber(value)
			if numeric then
				stats[decode_attr(stat)] = numeric
			end
		end
	end
	return stats
end

local function read_main_skill_name(b)
	local control = b and b.controls and b.controls.mainSkill
	local list = control and control.list
	local selected = control and control.selIndex or 1
	local entry = list and list[selected]
	if type(entry) == "table" then
		return strip_colour_codes(entry.label or entry.name or entry[1])
	end
	if type(entry) == "string" then
		return strip_colour_codes(entry)
	end
	local actor = b and b.calcsTab and b.calcsTab.mainEnv and b.calcsTab.mainEnv.player
	local skill = actor and actor.mainSkill
	local effect = skill and skill.activeEffect
	local granted = effect and effect.grantedEffect
	return granted and granted.name or nil
end

local function read_main_skill_dps(b, stats)
	local output = b and b.calcsTab and b.calcsTab.mainOutput
	if type(output) == "table" then
		for _, key in ipairs({ "FullDPS", "CombinedDPS", "TotalDPS" }) do
			if type(output[key]) == "number" then
				return output[key]
			end
		end
		if type(output.SkillDPS) == "table" then
			local best = nil
			for _, skillData in ipairs(output.SkillDPS) do
				if type(skillData) == "table" and type(skillData.dps) == "number" then
					local count = tonumber(skillData.count) or 1
					local total = skillData.dps * count
					if not best or total > best then
						best = total
					end
				end
			end
			if best then
				return best
			end
		end
	end
	for _, key in ipairs({ "FullDPS", "CombinedDPS", "TotalDPS" }) do
		if type(stats[key]) == "number" then
			return stats[key]
		end
	end
	return nil
end

local function build_summary()
	local b = current_build()
	local exported = ""
	if b and b.SaveDB then
		exported = b:SaveDB("summary")
	end
	local playerStats = collect_player_stats(exported)
	return {
		ok = true,
		className = b and b.spec and b.spec.curClassName or "",
		ascendClassName = b and b.spec and b.spec.curAscendClassName or "",
		level = b and b.characterLevel or 0,
		mainSkillName = read_main_skill_name(b),
		mainSkillDPS = read_main_skill_dps(b, playerStats),
		playerStats = playerStats,
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
	elseif method == "pob.newBuild" then
		loadBuildFromXML("<PathOfBuilding2 />", params.name or "New build")
		build = current_build()
		return build_summary()
	elseif method == "pob.exportBuildXml" then
		local b = current_build()
		if not b or not b.SaveDB then
			error("No active BUILD mode")
		end
		return { xml = b:SaveDB(params.fileName or "export") }
	elseif method == "pob.saveBuildXml" then
		local b = current_build()
		if not b or not b.SaveDB then
			error("No active BUILD mode")
		end
		return { xml = b:SaveDB(params.fileName or "build") }
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
