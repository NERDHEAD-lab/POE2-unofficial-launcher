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

local function current_spec()
	local b = current_build()
	return b and b.spec or nil
end

local function safe_dimensions(data)
	if type(data) ~= "table" then
		return nil
	end
	local out = {}
	if type(data.width) == "number" then out.width = data.width end
	if type(data.height) == "number" then out.height = data.height end
	return next(out) and out or nil
end

local function safe_target_size(targetSize)
	if type(targetSize) ~= "table" then
		return nil
	end
	local out = safe_dimensions(targetSize) or {}
	out.overlay = safe_dimensions(targetSize.overlay)
	out.effect = safe_dimensions(targetSize.effect)
	return next(out) and out or nil
end

local function safe_art(data)
	if type(data) ~= "table" then
		return nil
	end
	local out = {}
	if type(data.image) == "string" then out.image = data.image end
	if type(data.section) == "string" then out.section = data.section end
	if type(data.name) == "string" then out.name = data.name end
	if type(data.id) == "string" then out.id = data.id end
	if type(data.x) == "number" then out.x = data.x end
	if type(data.y) == "number" then out.y = data.y end
	if type(data.width) == "number" then out.width = data.width end
	if type(data.height) == "number" then out.height = data.height end
	if type(data.offsetX) == "number" then out.offsetX = data.offsetX end
	if type(data.offsetY) == "number" then out.offsetY = data.offsetY end
	if data.isHalfImage ~= nil then out.isHalfImage = true end
	if type(data.active) == "table" then out.active = safe_dimensions(data.active) end
	if type(data.bg) == "table" then out.bg = safe_dimensions(data.bg) end
	return next(out) and out or nil
end

local function safe_overlay(overlay)
	if type(overlay) ~= "table" then
		return nil
	end
	local out = {
		alloc = type(overlay.alloc) == "string" and overlay.alloc or nil,
		unalloc = type(overlay.unalloc) == "string" and overlay.unalloc or nil,
		path = type(overlay.path) == "string" and overlay.path or nil,
	}
	return next(out) and out or nil
end

local function tree_snapshot()
	local spec = current_spec()
	if not spec or not spec.nodes then
		error("No active passive spec")
	end

	local nodes = {}
	for id, node in pairs(spec.nodes) do
		if type(node.x) == "number" and type(node.y) == "number" then
			local linked = {}
			if type(node.linkedId) == "table" then
				for _, otherId in ipairs(node.linkedId) do
					if type(otherId) == "number" then
						linked[#linked + 1] = otherId
					end
				end
			end
			nodes[#nodes + 1] = {
				id = id,
				x = node.x,
				y = node.y,
				name = strip_colour_codes(node.dn or node.name),
				type = node.type,
				ascendancyName = node.ascendancyName,
				isAscendancyStart = node.isAscendancyStart and true or false,
				isKeystone = node.type == "Keystone",
				isNotable = node.type == "Notable",
				isSocket = node.type == "Socket",
				isMastery = node.type == "Mastery",
				isOnlyImage = node.type == "OnlyImage",
				alloc = node.alloc and true or false,
				icon = strip_colour_codes(node.icon or node.activeIcon),
				activeEffectImage = strip_colour_codes(node.activeEffectImage),
				overlay = safe_overlay(node.overlay),
				targetSize = safe_target_size(node.targetSize),
				linked = linked,
			}
		end
	end

	local viewport = nil
	if spec.tree
		and type(spec.tree.min_x) == "number"
		and type(spec.tree.min_y) == "number"
		and type(spec.tree.max_x) == "number"
		and type(spec.tree.max_y) == "number"
	then
		viewport = {
			minX = spec.tree.min_x,
			minY = spec.tree.min_y,
			maxX = spec.tree.max_x,
			maxY = spec.tree.max_y,
		}
	end

	local treeSize = nil
	if spec.tree and type(spec.tree.size) == "number" then
		treeSize = spec.tree.size
	end

	return {
		treeVersion = spec.treeVersion,
		classId = spec.curClassId,
		className = spec.curClassName,
		ascendClassId = spec.curAscendClassId,
		ascendClassName = spec.curAscendClassName,
		allocCount = spec:CountAllocNodes(),
		viewport = viewport,
		treeSize = treeSize,
		nodes = nodes,
	}
end

local function tree_allocate(nodeId, mode)
	local spec = current_spec()
	if not spec then error("No active passive spec") end
	local node = spec.nodes[nodeId]
	if not node then error("Unknown node: " .. tostring(nodeId)) end

	if mode == "deallocate" then
		spec:DeallocNode(node)
	else
		spec:AllocNode(node)
	end

	local b = current_build()
	if b and b.buildFlag ~= nil then b.buildFlag = true end
	return tree_snapshot()
end

local function items_tab()
	local b = current_build()
	return b and b.itemsTab or nil
end

local function safe_string(value)
	if type(value) == "string" then
		return strip_colour_codes(value)
	end
	return nil
end

local function safe_number(value)
	if type(value) == "number" then
		return value
	end
	return nil
end

local function nullable_number(value)
	local number = safe_number(value)
	return number ~= nil and number or json.null
end

local function nullable_string(value)
	local text = safe_string(value)
	return text ~= nil and text or json.null
end

local function safe_bool(value)
	return value and true or false
end

local function collect_mod_lines(item, source_key)
	local lines = {}
	local source = item and item[source_key]
	if type(source) ~= "table" then
		return lines
	end
	for _, line in ipairs(source) do
		if type(line) == "table" and type(line.line) == "string" then
			lines[#lines + 1] = strip_colour_codes(line.line)
		elseif type(line) == "string" then
			lines[#lines + 1] = strip_colour_codes(line)
		end
	end
	return lines
end

local function collect_mod_line_groups(item, source_keys)
	local lines = {}
	for _, key in ipairs(source_keys) do
		for _, line in ipairs(collect_mod_lines(item, key)) do
			lines[#lines + 1] = line
		end
	end
	return lines
end

local function item_summary(item, fallback_id)
	if type(item) ~= "table" then
		return nil
	end
	local base = item.base
	return {
		id = item.id or fallback_id,
		name = safe_string(item.name) or "?",
		rarity = item.rarity or "NORMAL",
		baseName = nullable_string(item.baseName),
		title = nullable_string(item.title),
		itemLevel = nullable_number(item.itemLevel),
		quality = nullable_number(item.quality),
		corrupted = safe_bool(item.corrupted),
		mirrored = safe_bool(item.mirrored),
		shaper = safe_bool(item.shaper),
		elder = safe_bool(item.elder),
		fractured = safe_bool(item.fractured),
		influences = type(item.influences) == "table" and item.influences or json.null,
		baseType = base and base.type or json.null,
		baseSubType = base and base.subType or json.null,
		implicitLines = collect_mod_line_groups(item, { "runeModLines", "enchantModLines", "implicitModLines" }),
		explicitLines = collect_mod_lines(item, "explicitModLines"),
	}
end

local function items_snapshot()
	local tab = items_tab()
	if not tab then
		error("No active items tab")
	end

	local sets = {}
	if type(tab.itemSetOrderList) == "table" then
		for _, setId in ipairs(tab.itemSetOrderList) do
			local set = tab.itemSets and tab.itemSets[setId]
			if type(set) == "table" then
				sets[#sets + 1] = {
					id = setId,
					title = safe_string(set.title) or "",
					useSecondWeaponSet = safe_bool(set.useSecondWeaponSet),
				}
			end
		end
	end

	local active = tab.activeItemSet
	local activeSetId = tab.activeItemSetId or (sets[1] and sets[1].id) or 0
	local useSecondWeaponSet = active and safe_bool(active.useSecondWeaponSet) or false

	local slots = {}
	if type(tab.orderedSlots) == "table" then
		for _, slot in ipairs(tab.orderedSlots) do
			if type(slot) == "table" and type(slot.slotName) == "string" then
				local slotState = active and active[slot.slotName]
				local selItemId = slot.nodeId and slot.selItemId or (type(slotState) == "table" and slotState.selItemId or nil)
				local activeFlag = type(slotState) == "table" and slotState.active
				local visible = true
				if type(slot.shown) == "function" then
					local ok, result = pcall(slot.shown)
					visible = ok and result ~= false
				end
				if slot.inactive then
					visible = false
				end
				local validItemIds = {}
				if type(tab.itemOrderList) == "table" and type(tab.IsItemValidForSlot) == "function" then
					for _, itemId in ipairs(tab.itemOrderList) do
						local item = tab.items and tab.items[itemId]
						local ok, valid = pcall(tab.IsItemValidForSlot, tab, item, slot.slotName)
						if ok and valid then
							validItemIds[#validItemIds + 1] = itemId
						end
					end
				end
				slots[#slots + 1] = {
					name = slot.slotName,
					label = safe_string(slot.label) or slot.slotName,
					slotType = slot.slotType or slot.slotTypeKey,
					weaponSet = safe_number(slot.weaponSet),
					nodeId = safe_number(slot.nodeId),
					selItemId = type(selItemId) == "number" and selItemId or 0,
					visible = visible,
					active = activeFlag ~= false,
					canActivate = type(slot.controls) == "table" and slot.controls.activate ~= nil,
					validItemIds = validItemIds,
				}
			end
		end
	end

	local items = {}
	if type(tab.itemOrderList) == "table" then
		for _, itemId in ipairs(tab.itemOrderList) do
			local item = tab.items and tab.items[itemId]
			local summary = item_summary(item, itemId)
			if summary then
				items[#items + 1] = summary
			end
		end
	end

	local sharedItems = {}
	if main and type(main.sharedItemList) == "table" then
		for index, item in ipairs(main.sharedItemList) do
			local summary = item_summary(item, index)
			if summary then
				sharedItems[#sharedItems + 1] = summary
			end
		end
	end

	return {
		activeSetId = activeSetId,
		useSecondWeaponSet = useSecondWeaponSet,
		sets = sets,
		slots = slots,
		items = items,
		sharedItems = sharedItems,
	}
end

local function items_db_list(dbKey)
	local db = main and main[dbKey]
	if type(db) ~= "table" or type(db.list) ~= "table" then
		error("Unknown item DB: " .. tostring(dbKey))
	end
	local entries = {}
	for id, item in pairs(db.list) do
		local summary = item_summary(item, id)
		if summary then
			summary.id = tostring(id)
			entries[#entries + 1] = summary
		end
	end
	table.sort(entries, function(a, b)
		return (a.name or "") < (b.name or "")
	end)
	return { entries = entries }
end

local function mark_items_changed(tab, defer_populate)
	local b = current_build()
	if not defer_populate and tab and type(tab.PopulateSlots) == "function" then
		tab:PopulateSlots()
	end
	if tab and type(tab.AddUndoState) == "function" then
		tab:AddUndoState()
	end
	if b then
		b.buildFlag = true
		if type(b.SyncLoadouts) == "function" then
			b:SyncLoadouts()
		end
	end
end

local function require_item(tab, itemId)
	if type(itemId) ~= "number" then
		error("itemId must be a number")
	end
	local item = tab.items and tab.items[itemId]
	if type(item) ~= "table" then
		error("Unknown item: " .. tostring(itemId))
	end
	return item
end

local function require_slot(tab, slotName)
	if type(slotName) ~= "string" then
		error("slotName must be a string")
	end
	local slot = tab.slots and tab.slots[slotName]
	if type(slot) ~= "table" then
		error("Unknown slot: " .. tostring(slotName))
	end
	return slot
end

local function copy_item_from_raw(raw, normalise)
	if type(raw) ~= "string" or raw == "" then
		error("item raw text is required")
	end
	local item = new("Item", raw)
	if not item or not item.base then
		error("Invalid item text")
	end
	if normalise and type(item.NormaliseQuality) == "function" then
		item:NormaliseQuality()
	end
	return item
end

local function add_external_item(tab, item, equip)
	local newItem = copy_item_from_raw(item.raw or (type(item.BuildRaw) == "function" and item:BuildRaw()), true)
	tab:AddItem(newItem, not equip)
	if equip and type(tab.EquipItemInSet) == "function" then
		tab:EquipItemInSet(newItem, tab.activeItemSetId)
	else
		mark_items_changed(tab)
	end
	return items_snapshot()
end

local function items_action(action)
	local tab = items_tab()
	if not tab then
		error("No active items tab")
	end
	if type(action) ~= "table" or type(action.type) ~= "string" then
		error("pob.items.action requires action.type")
	end

	if action.type == "setActiveSet" then
		if type(action.setId) ~= "number" then
			error("setActiveSet requires setId")
		end
		tab:SetActiveItemSet(action.setId)
		mark_items_changed(tab, true)
		return items_snapshot()
	elseif action.type == "setWeaponSet" then
		if action.weaponSet ~= 1 and action.weaponSet ~= 2 then
			error("setWeaponSet requires weaponSet = 1|2")
		end
		local useSecond = action.weaponSet == 2
		if tab.activeItemSet and tab.activeItemSet.useSecondWeaponSet ~= useSecond then
			tab.activeItemSet.useSecondWeaponSet = useSecond
			local b = current_build()
			local mainSocketGroup = b and b.skillsTab and b.skillsTab.socketGroupList and b.skillsTab.socketGroupList[b.mainSocketGroup]
			if mainSocketGroup and mainSocketGroup.slot and tab.slots[mainSocketGroup.slot] then
				local currentWeaponSet = tab.slots[mainSocketGroup.slot].weaponSet
				if currentWeaponSet and currentWeaponSet ~= action.weaponSet then
					for index, socketGroup in ipairs(b.skillsTab.socketGroupList) do
						if socketGroup.slot and tab.slots[socketGroup.slot] and tab.slots[socketGroup.slot].weaponSet == action.weaponSet then
							b.mainSocketGroup = index
							break
						end
					end
				end
			end
			mark_items_changed(tab)
		end
		return items_snapshot()
	elseif action.type == "equip" then
		local slot = require_slot(tab, action.slotName)
		local itemId = action.itemId
		if type(itemId) ~= "number" then
			error("equip requires itemId")
		end
		if itemId ~= 0 then
			local item = require_item(tab, itemId)
			if type(tab.IsItemValidForSlot) == "function" and not tab:IsItemValidForSlot(item, slot.slotName) then
				error("Item is not valid for slot: " .. tostring(slot.slotName))
			end
		end
		slot:SetSelItemId(itemId)
		mark_items_changed(tab)
		return items_snapshot()
	elseif action.type == "setSlotActive" then
		local slot = require_slot(tab, action.slotName)
		if not (type(slot.controls) == "table" and slot.controls.activate) then
			error("Slot cannot be activated: " .. tostring(slot.slotName))
		end
		slot.active = action.active and true or false
		if tab.activeItemSet and tab.activeItemSet[slot.slotName] then
			tab.activeItemSet[slot.slotName].active = slot.active
		end
		mark_items_changed(tab)
		return items_snapshot()
	elseif action.type == "equipBest" then
		local item = require_item(tab, action.itemId)
		tab:EquipItemInSet(item, tab.activeItemSetId)
		return items_snapshot()
	elseif action.type == "sortItems" then
		tab:SortItemList()
		return items_snapshot()
	elseif action.type == "deleteItem" then
		local item = require_item(tab, action.itemId)
		tab:DeleteItem(item)
		return items_snapshot()
	elseif action.type == "deleteAll" then
		for _, slot in pairs(tab.slots or {}) do
			slot:SetSelItemId(0)
		end
		local b = current_build()
		if b and b.treeTab and type(b.treeTab.specList) == "table" then
			for _, spec in pairs(b.treeTab.specList) do
				for nodeId in pairs(spec.jewels or {}) do
					spec.jewels[nodeId] = 0
				end
			end
		end
		for key in pairs(tab.items or {}) do
			tab.items[key] = nil
		end
		for index = #tab.itemOrderList, 1, -1 do
			tab.itemOrderList[index] = nil
		end
		mark_items_changed(tab)
		return items_snapshot()
	elseif action.type == "deleteUnused" then
		local used = {}
		for _, itemSet in pairs(tab.itemSets or {}) do
			for _, slotState in pairs(itemSet) do
				if type(slotState) == "table" and type(slotState.selItemId) == "number" and slotState.selItemId ~= 0 then
					used[slotState.selItemId] = true
				end
			end
		end
		local b = current_build()
		if b and b.treeTab and type(b.treeTab.specList) == "table" then
			for _, spec in pairs(b.treeTab.specList) do
				for _, itemId in pairs(spec.jewels or {}) do
					if type(itemId) == "number" and itemId ~= 0 then
						used[itemId] = true
					end
				end
			end
		end
		for index = #tab.itemOrderList, 1, -1 do
			local itemId = tab.itemOrderList[index]
			if not used[itemId] and tab.items[itemId] then
				tab:DeleteItem(tab.items[itemId], true)
			end
		end
		if b and b.treeTab and type(b.treeTab.specList) == "table" then
			for _, spec in pairs(b.treeTab.specList) do
				if type(spec.BuildClusterJewelGraphs) == "function" then
					spec:BuildClusterJewelGraphs()
				end
			end
		end
		mark_items_changed(tab)
		return items_snapshot()
	elseif action.type == "addDbItem" then
		local key = action.db
		if key ~= "uniqueDB" and key ~= "rareDB" then
			error("addDbItem requires db = uniqueDB|rareDB")
		end
		local db = main and main[key]
		local source = db and db.list and (db.list[action.itemId] or db.list[tostring(action.itemId)])
		if type(source) ~= "table" then
			error("Unknown DB item: " .. tostring(action.itemId))
		end
		return add_external_item(tab, source, action.equip and true or false)
	elseif action.type == "addSharedItem" then
		if not (main and type(main.sharedItemList) == "table") then
			error("Shared item list is unavailable")
		end
		local source = main.sharedItemList[action.index]
		if type(source) ~= "table" then
			error("Unknown shared item: " .. tostring(action.index))
		end
		return add_external_item(tab, source, action.equip and true or false)
	elseif action.type == "deleteSharedItem" then
		if not (main and type(main.sharedItemList) == "table") then
			error("Shared item list is unavailable")
		end
		if type(action.index) ~= "number" or not main.sharedItemList[action.index] then
			error("Unknown shared item: " .. tostring(action.index))
		end
		table.remove(main.sharedItemList, action.index)
		return items_snapshot()
	elseif action.type == "createCustom" then
		local item = copy_item_from_raw(action.raw, true)
		tab:AddItem(item, not action.equip)
		if action.equip and type(tab.EquipItemInSet) == "function" then
			tab:EquipItemInSet(item, tab.activeItemSetId)
		else
			mark_items_changed(tab)
		end
		return items_snapshot()
	end

	error("Unknown items action: " .. tostring(action.type))
end

local skill_slot_options = {
	{ label = "None" },
	{ label = "Weapon 1", slotName = "Weapon 1" },
	{ label = "Weapon 2", slotName = "Weapon 2" },
	{ label = "Weapon 1 (Swap)", slotName = "Weapon 1 Swap" },
	{ label = "Weapon 2 (Swap)", slotName = "Weapon 2 Swap" },
	{ label = "Helmet", slotName = "Helmet" },
	{ label = "Body Armour", slotName = "Body Armour" },
	{ label = "Gloves", slotName = "Gloves" },
	{ label = "Boots", slotName = "Boots" },
	{ label = "Amulet", slotName = "Amulet" },
	{ label = "Ring 1", slotName = "Ring 1" },
	{ label = "Ring 2", slotName = "Ring 2" },
	{ label = "Ring 3", slotName = "Ring 3" },
	{ label = "Belt", slotName = "Belt" },
}

local default_gem_level_options = {
	{ label = "Normal Maximum", value = "normalMaximum" },
	{ label = "Corrupted Maximum", value = "corruptedMaximum" },
	{ label = "Awakened Maximum", value = "awakenedMaximum" },
	{ label = "Match Character Level", value = "characterLevel" },
}

local support_gem_type_options = {
	{ label = "All", value = "ALL" },
	{ label = "Non-Awakened", value = "NORMAL" },
	{ label = "Awakened", value = "AWAKENED" },
}

local sort_gem_field_options = {
	{ label = "Full DPS", value = "FullDPS" },
	{ label = "Combined DPS", value = "CombinedDPS" },
	{ label = "Hit DPS", value = "TotalDPS" },
	{ label = "Average Hit", value = "AverageDamage" },
	{ label = "DoT DPS", value = "TotalDot" },
	{ label = "Bleed DPS", value = "BleedDPS" },
	{ label = "Ignite DPS", value = "IgniteDPS" },
	{ label = "Poison DPS", value = "TotalPoisonDPS" },
	{ label = "Effective Hit Pool", value = "TotalEHP" },
}

local function skills_tab()
	local b = current_build()
	return b and b.skillsTab or nil
end

local function sync_build_frame()
	if runCallback then
		pcall(runCallback, "OnFrame")
	end
end

local function mark_skills_changed(tab, skip_undo)
	local b = current_build()
	if tab and not skip_undo and type(tab.AddUndoState) == "function" then
		tab:AddUndoState()
	end
	if b then
		b.buildFlag = true
		if type(b.SyncLoadouts) == "function" then
			b:SyncLoadouts()
		end
	end
	sync_build_frame()
end

local function skill_colour_from_effect(grantedEffect)
	if type(grantedEffect) ~= "table" then
		return "normal"
	end
	if grantedEffect.color == 1 then return "strength" end
	if grantedEffect.color == 2 then return "dexterity" end
	if grantedEffect.color == 3 then return "intelligence" end
	return "normal"
end

local function gem_granted_effect(gem)
	if type(gem) ~= "table" then
		return nil
	end
	if type(gem.grantedEffect) == "table" then
		return gem.grantedEffect
	end
	return gem.gemData and gem.gemData.grantedEffect or nil
end

local function gem_display_name(gem)
	if type(gem) ~= "table" then
		return ""
	end
	local grantedEffect = gem_granted_effect(gem)
	if gem.gemData and type(gem.gemData.name) == "string" then
		return strip_colour_codes(gem.gemData.name)
	end
	if grantedEffect and type(grantedEffect.name) == "string" then
		return strip_colour_codes(grantedEffect.name)
	end
	return safe_string(gem.nameSpec) or ""
end

local function gem_global_effects(gem)
	local effects = {}
	if type(gem) ~= "table" or not (gem.gemData and type(gem.gemData.grantedEffectList) == "table") then
		return effects
	end
	for index, grantedEffect in ipairs(gem.gemData.grantedEffectList) do
		if type(grantedEffect) == "table" and not grantedEffect.support then
			effects[#effects + 1] = {
				index = index,
				name = safe_string(grantedEffect.name) or "",
				enabled = gem["enableGlobal" .. tostring(index)] ~= false,
			}
		end
	end
	return effects
end

local function gem_count_visible(gem)
	local grantedEffect = gem_granted_effect(gem)
	if grantedEffect and not grantedEffect.support and not grantedEffect.unsupported then
		return true
	end
	if gem and gem.gemData and type(gem.gemData.grantedEffectList) == "table" then
		for index, effect in ipairs(gem.gemData.grantedEffectList) do
			if type(effect) == "table" and not effect.support and not effect.unsupported and (not effect.hasGlobalEffect or gem["enableGlobal" .. tostring(index)] ~= false) then
				return true
			end
		end
	end
	return false
end

local function gem_summary(gem, index, socketGroup)
	local grantedEffect = gem_granted_effect(gem)
	local displayEffect = gem.displayEffect or gem
	return {
		index = index,
		gemId = gem.gemId and tostring(gem.gemId) or nil,
		skillId = gem.skillId and tostring(gem.skillId) or nil,
		nameSpec = safe_string(gem.nameSpec) or "",
		displayName = gem_display_name(gem),
		level = safe_number(gem.level),
		quality = safe_number(gem.quality),
		enabled = gem.enabled ~= false,
		enableGlobal1 = gem.enableGlobal1 ~= false,
		enableGlobal2 = gem.enableGlobal2 == true,
		count = safe_number(gem.count) or 1,
		errMsg = safe_string(gem.errMsg),
		reqLevel = safe_number(gem.reqLevel),
		reqStr = safe_number(gem.reqStr),
		reqDex = safe_number(gem.reqDex),
		reqInt = safe_number(gem.reqInt),
		naturalMaxLevel = safe_number(gem.naturalMaxLevel),
		color = skill_colour_from_effect(grantedEffect),
		isSupport = grantedEffect and grantedEffect.support and true or false,
		isVaal = gem.gemData and gem.gemData.vaalGem and true or false,
		fromItem = gem.fromItem and true or false,
		fromTree = gem.fromTree and true or false,
		triggered = gem.triggered and true or false,
		countVisible = gem_count_visible(gem),
		canEdit = socketGroup.source == nil,
		canDelete = socketGroup.source == nil,
		globalEffects = gem_global_effects(gem),
		displayLevel = safe_number(displayEffect.level),
		displayQuality = safe_number(displayEffect.quality),
	}
end

local function active_skill_summary(activeSkill, index)
	local effect = activeSkill and activeSkill.activeEffect
	local grantedEffect = effect and effect.grantedEffect
	local source = effect and effect.srcInstance
	local explodeSource = source and source.explodeSource
	local label = nil
	if explodeSource then
		label = "From " .. (safe_string(explodeSource.name or explodeSource.dn) or "?")
	elseif grantedEffect then
		label = safe_string(grantedEffect.name)
	end
	return {
		index = index,
		label = label or ("Active Skill " .. tostring(index)),
		skillPartName = safe_string(activeSkill and activeSkill.skillPartName),
		disableReason = safe_string(activeSkill and activeSkill.disableReason),
		color = skill_colour_from_effect(grantedEffect),
	}
end

local function source_note(socketGroup)
	if type(socketGroup) ~= "table" or not socketGroup.source then
		return nil
	end
	if socketGroup.explodeSources then
		local parts = { "This is a special group created for the enemy explosion effect." }
		for _, source in pairs(socketGroup.explodeSources) do
			parts[#parts + 1] = safe_string(source.name or source.dn) or "?"
		end
		return table.concat(parts, "\n")
	end
	local activeGem = socketGroup.gemList and socketGroup.gemList[1]
	local skillName = activeGem and gem_display_name(activeGem) or "?"
	local sourceName = "?"
	if socketGroup.sourceItem then
		sourceName = safe_string(socketGroup.sourceItem.name) or sourceName
	elseif socketGroup.sourceNode then
		sourceName = safe_string(socketGroup.sourceNode.name) or sourceName
	end
	return "This is a special group for '" .. skillName .. "' provided by '" .. sourceName .. "'."
end

local function skill_group_summary(tab, socketGroup, index)
	if type(tab.ProcessSocketGroup) == "function" then
		pcall(tab.ProcessSocketGroup, tab, socketGroup)
	end
	local gems = {}
	if type(socketGroup.gemList) == "table" then
		for gemIndex, gem in ipairs(socketGroup.gemList) do
			gems[#gems + 1] = gem_summary(gem, gemIndex, socketGroup)
		end
	end
	local activeSkills = {}
	if type(socketGroup.displaySkillList) == "table" then
		for skillIndex, activeSkill in ipairs(socketGroup.displaySkillList) do
			activeSkills[#activeSkills + 1] = active_skill_summary(activeSkill, skillIndex)
		end
	end
	return {
		index = index,
		label = safe_string(socketGroup.label) or "",
		displayLabel = safe_string(socketGroup.displayLabel) or safe_string(socketGroup.label) or "<No active skills>",
		slot = socketGroup.slot,
		source = safe_string(socketGroup.source),
		sourceNote = source_note(socketGroup),
		enabled = socketGroup.enabled ~= false,
		slotEnabled = socketGroup.slotEnabled ~= false,
		includeInFullDPS = socketGroup.includeInFullDPS and true or false,
		groupCount = safe_number(socketGroup.groupCount) or 1,
		mainActiveSkill = safe_number(socketGroup.mainActiveSkill) or 1,
		mainActiveSkillCalcs = safe_number(socketGroup.mainActiveSkillCalcs) or 1,
		isMain = current_build() and current_build().mainSocketGroup == index or false,
		canDelete = socketGroup.source == nil,
		noSupports = socketGroup.noSupports and true or false,
		gems = gems,
		activeSkills = activeSkills,
	}
end

local function available_gems(tab)
	local entries = {}
	local gems = tab.build and tab.build.data and tab.build.data.gems
	if type(gems) ~= "table" then
		return entries
	end
	for gemId, gemData in pairs(gems) do
		if type(gemData) == "table" and type(gemData.name) == "string" then
			local grantedEffect = gemData.grantedEffect
			entries[#entries + 1] = {
				id = tostring(gemData.id or gemId),
				name = strip_colour_codes(gemData.name),
				color = skill_colour_from_effect(grantedEffect),
				isSupport = grantedEffect and grantedEffect.support and true or false,
				naturalMaxLevel = safe_number(gemData.naturalMaxLevel),
				tagString = safe_string(gemData.tagString),
			}
		end
	end
	table.sort(entries, function(a, b)
		return (a.name or "") < (b.name or "")
	end)
	return entries
end

local function skills_snapshot()
	local tab = skills_tab()
	if not tab then
		error("No active skills tab")
	end
	sync_build_frame()

	local sets = {}
	if type(tab.skillSetOrderList) == "table" then
		for _, setId in ipairs(tab.skillSetOrderList) do
			local set = tab.skillSets and tab.skillSets[setId]
			if type(set) == "table" then
				sets[#sets + 1] = {
					id = setId,
					title = safe_string(set.title) or "Default",
				}
			end
		end
	end

	local groups = {}
	if type(tab.socketGroupList) == "table" then
		for index, socketGroup in ipairs(tab.socketGroupList) do
			groups[#groups + 1] = skill_group_summary(tab, socketGroup, index)
		end
	end

	local b = current_build()
	return {
		activeSetId = tab.activeSkillSetId or 1,
		mainSocketGroup = b and b.mainSocketGroup or 1,
		calcsSocketGroup = b and b.calcsTab and b.calcsTab.input and b.calcsTab.input.skill_number or 1,
		sets = sets,
		groups = groups,
		availableGems = available_gems(tab),
		slotOptions = skill_slot_options,
		defaultGemLevelOptions = default_gem_level_options,
		supportGemTypeOptions = support_gem_type_options,
		sortGemFieldOptions = sort_gem_field_options,
		options = {
			sortGemsByDPS = tab.sortGemsByDPS and true or false,
			sortGemsByDPSField = tab.sortGemsByDPSField or "CombinedDPS",
			defaultGemLevel = tab.defaultGemLevel or "normalMaximum",
			defaultGemQuality = safe_number(tab.defaultGemQuality) or 0,
			showSupportGemTypes = tab.showSupportGemTypes or "ALL",
		},
	}
end

local function require_skill_group(tab, groupIndex)
	if type(groupIndex) ~= "number" then
		error("groupIndex must be a number")
	end
	local group = tab.socketGroupList and tab.socketGroupList[groupIndex]
	if type(group) ~= "table" then
		error("Unknown socket group: " .. tostring(groupIndex))
	end
	return group
end

local function ensure_skill_gem(tab, group, gemIndex)
	if type(gemIndex) ~= "number" or gemIndex < 1 then
		error("gemIndex must be a positive number")
	end
	local gem = group.gemList[gemIndex]
	if type(gem) ~= "table" then
		gem = {
			nameSpec = "",
			level = 1,
			quality = tab.defaultGemQuality or 0,
			enabled = true,
			enableGlobal1 = true,
			enableGlobal2 = true,
			count = 1,
			new = true,
		}
		group.gemList[gemIndex] = gem
	end
	return gem
end

local function remove_group_at(tab, groupIndex)
	local b = current_build()
	table.remove(tab.socketGroupList, groupIndex)
	if b and b.mainSocketGroup and b.mainSocketGroup > groupIndex then
		b.mainSocketGroup = b.mainSocketGroup - 1
	end
	if b and b.calcsTab and b.calcsTab.input and b.calcsTab.input.skill_number and b.calcsTab.input.skill_number > groupIndex then
		b.calcsTab.input.skill_number = b.calcsTab.input.skill_number - 1
	end
end

local function action_title(title, suffix)
	if type(title) ~= "string" or title == "" then
		return "Default" .. suffix
	end
	return title .. suffix
end

local function copy_skill_set(tab, sourceSetId)
	local source = tab.skillSets and tab.skillSets[sourceSetId]
	if type(source) ~= "table" then
		error("Unknown skill set: " .. tostring(sourceSetId))
	end
	local newSet = copyTable(source, true)
	newSet.socketGroupList = {}
	for _, socketGroup in ipairs(source.socketGroupList or {}) do
		local newGroup = copyTable(socketGroup, true)
		newGroup.gemList = {}
		for gemIndex, gem in ipairs(socketGroup.gemList or {}) do
			newGroup.gemList[gemIndex] = copyTable(gem, true)
		end
		table.insert(newSet.socketGroupList, newGroup)
	end
	newSet.id = 1
	while tab.skillSets[newSet.id] do
		newSet.id = newSet.id + 1
	end
	newSet.title = action_title(newSet.title or "Default", " Copy")
	tab.skillSets[newSet.id] = newSet
	table.insert(tab.skillSetOrderList, newSet.id)
	tab:SetActiveSkillSet(newSet.id)
end

local function skills_action(action)
	local tab = skills_tab()
	if not tab then
		error("No active skills tab")
	end
	if type(action) ~= "table" or type(action.type) ~= "string" then
		error("pob.skills.action requires action.type")
	end

	if action.type == "setActiveSkillSet" then
		if type(action.setId) ~= "number" then error("setActiveSkillSet requires setId") end
		tab:SetActiveSkillSet(action.setId)
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "newSkillSet" then
		local skillSet = tab:NewSkillSet()
		skillSet.title = safe_string(action.title) or "Default"
		table.insert(tab.skillSetOrderList, skillSet.id)
		tab:SetActiveSkillSet(skillSet.id)
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "copySkillSet" then
		if type(action.setId) ~= "number" then error("copySkillSet requires setId") end
		copy_skill_set(tab, action.setId)
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "renameSkillSet" then
		if type(action.setId) ~= "number" then error("renameSkillSet requires setId") end
		local set = tab.skillSets and tab.skillSets[action.setId]
		if type(set) ~= "table" then error("Unknown skill set: " .. tostring(action.setId)) end
		set.title = safe_string(action.title) or "Default"
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "deleteSkillSet" then
		if type(action.setId) ~= "number" then error("deleteSkillSet requires setId") end
		if #tab.skillSetOrderList <= 1 then error("Cannot delete the only skill set") end
		for index, setId in ipairs(tab.skillSetOrderList) do
			if setId == action.setId then
				table.remove(tab.skillSetOrderList, index)
				tab.skillSets[action.setId] = nil
				if tab.activeSkillSetId == action.setId then
					tab:SetActiveSkillSet(tab.skillSetOrderList[math.max(1, index - 1)])
				end
				mark_skills_changed(tab)
				return skills_snapshot()
			end
		end
		error("Unknown skill set: " .. tostring(action.setId))
	elseif action.type == "setOptions" then
		local options = action.options
		if type(options) ~= "table" then error("setOptions requires options") end
		if options.sortGemsByDPS ~= nil then tab.sortGemsByDPS = options.sortGemsByDPS and true or false end
		if type(options.sortGemsByDPSField) == "string" then tab.sortGemsByDPSField = options.sortGemsByDPSField end
		if type(options.defaultGemLevel) == "string" then tab.defaultGemLevel = options.defaultGemLevel end
		if type(options.defaultGemQuality) == "number" then tab.defaultGemQuality = math.max(0, math.min(options.defaultGemQuality, 23)) end
		if type(options.showSupportGemTypes) == "string" then tab.showSupportGemTypes = options.showSupportGemTypes end
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "addGroup" then
		local newGroup = { label = safe_string(action.label) or "", enabled = true, gemList = {} }
		table.insert(tab.socketGroupList, newGroup)
		if tab.SetDisplayGroup then tab:SetDisplayGroup(newGroup) end
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "deleteGroup" then
		local group = require_skill_group(tab, action.groupIndex)
		if group.source then error("Cannot delete generated socket group") end
		remove_group_at(tab, action.groupIndex)
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "deleteAllGroups" then
		for index = #tab.socketGroupList, 1, -1 do
			table.remove(tab.socketGroupList, index)
		end
		local b = current_build()
		if b then b.mainSocketGroup = 1 end
		if b and b.calcsTab and b.calcsTab.input then b.calcsTab.input.skill_number = 1 end
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "setMainGroup" then
		local b = current_build()
		require_skill_group(tab, action.groupIndex)
		if b then b.mainSocketGroup = action.groupIndex end
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "setGroup" then
		local group = require_skill_group(tab, action.groupIndex)
		local patch = action.patch
		if type(patch) ~= "table" then error("setGroup requires patch") end
		if patch.label ~= nil then group.label = safe_string(patch.label) or "" end
		if patch.slot ~= nil and group.source == nil then group.slot = patch.slot ~= "" and patch.slot or nil end
		if patch.enabled ~= nil then group.enabled = patch.enabled and true or false end
		if patch.includeInFullDPS ~= nil then group.includeInFullDPS = patch.includeInFullDPS and true or false end
		if type(patch.groupCount) == "number" then group.groupCount = patch.groupCount end
		if type(patch.mainActiveSkill) == "number" then group.mainActiveSkill = patch.mainActiveSkill end
		if type(tab.ProcessSocketGroup) == "function" then tab:ProcessSocketGroup(group) end
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "setGem" then
		local group = require_skill_group(tab, action.groupIndex)
		local gem = ensure_skill_gem(tab, group, action.gemIndex)
		local patch = action.patch
		if type(patch) ~= "table" then error("setGem requires patch") end
		if patch.gemId ~= nil then
			local nextGemId = patch.gemId ~= "" and tostring(patch.gemId) or nil
			local gems = tab.build and tab.build.data and tab.build.data.gems
			if nextGemId and type(gems) == "table" and not gems[nextGemId] and tonumber(nextGemId) and gems[tonumber(nextGemId)] then
				nextGemId = tonumber(nextGemId)
			end
			gem.gemId = nextGemId
			gem.skillId = nil
			if gem.gemId and gems and gems[gem.gemId] then
				gem.nameSpec = gems[gem.gemId].name
			end
		end
		if patch.nameSpec ~= nil then
			gem.nameSpec = safe_string(patch.nameSpec) or ""
			if gem.nameSpec == "" then
				gem.gemId = nil
				gem.skillId = nil
			end
		end
		if type(patch.level) == "number" then gem.level = patch.level end
		if type(patch.quality) == "number" then gem.quality = patch.quality end
		if patch.enabled ~= nil then gem.enabled = patch.enabled and true or false end
		if patch.enableGlobal1 ~= nil then gem.enableGlobal1 = patch.enableGlobal1 and true or false end
		if patch.enableGlobal2 ~= nil then gem.enableGlobal2 = patch.enableGlobal2 and true or false end
		if type(patch.count) == "number" then gem.count = patch.count end
		if type(tab.ProcessSocketGroup) == "function" then tab:ProcessSocketGroup(group) end
		mark_skills_changed(tab)
		return skills_snapshot()
	elseif action.type == "deleteGem" then
		local group = require_skill_group(tab, action.groupIndex)
		if group.source then error("Cannot delete gem from generated socket group") end
		if type(action.gemIndex) ~= "number" or not group.gemList[action.gemIndex] then
			error("Unknown gem: " .. tostring(action.gemIndex))
		end
		table.remove(group.gemList, action.gemIndex)
		if type(tab.ProcessSocketGroup) == "function" then tab:ProcessSocketGroup(group) end
		mark_skills_changed(tab)
		return skills_snapshot()
	end

	error("Unknown skills action: " .. tostring(action.type))
end

-- ============================================================================
-- Calcs tab RPC (PR-6.4)
-- Mirrors PoB Classes/CalcsTab.lua + Modules/CalcSections.lua + CalcFormat.lua.
-- ============================================================================

local CALC_COLOR_KEYS = {
	"OFFENCE", "DEFENCE", "LIFE", "MANA", "SPIRIT", "ES", "ARMOUR", "EVASION",
	"FIRE", "COLD", "LIGHTNING", "CHAOS", "POSITIVE", "NEGATIVE", "NORMAL", "PHYS",
	"RAGE", "ENCHANTED", "RELIC", "TIP", "WARNING",
}

local CALC_BUFF_MODES = { "UNBUFFED", "BUFFED", "COMBAT", "EFFECTIVE" }
local CALC_BUFF_MODE_LABELS = {
	UNBUFFED = "Unbuffed",
	BUFFED = "Buffed",
	COMBAT = "In Combat",
	EFFECTIVE = "Effective DPS",
}

local function calcs_tab()
	local b = current_build()
	return b and b.calcsTab or nil
end

local function colour_key_for(value)
	if type(value) ~= "string" then return nil end
	for _, key in ipairs(CALC_COLOR_KEYS) do
		if colorCodes and value == colorCodes[key] then
			return key
		end
	end
	return nil
end

local function ensure_calcs_built(tab)
	if not tab.mainEnv or not tab.calcsEnv or tab.build.buildFlag then
		tab:BuildOutput()
	end
end

local function calc_actor(tab)
	if tab.input and tab.input.showMinion then
		if tab.calcsEnv and tab.calcsEnv.minion then
			return tab.calcsEnv.minion
		end
		if tab.mainEnv and tab.mainEnv.minion then
			return tab.mainEnv.minion
		end
	end
	local candidate = tab.calcsEnv and tab.calcsEnv.player
	if candidate and candidate.mainSkill then
		return candidate
	end
	-- calcsEnv may have been built without a mainSkill (build half-loaded);
	-- fall back to mainEnv which the sidebar uses for FullDPS etc.
	local fallback = tab.mainEnv and tab.mainEnv.player
	if fallback then return fallback end
	return candidate
end

local function format_cell_format(format, actor, rowData)
	if type(format) ~= "string" or format == "" then
		return "", nil
	end
	local prefixColour
	local stripped = format:gsub("^(%^x%x%x%x%x%x%x)", function(c)
		prefixColour = c
		return ""
	end)
	stripped = stripped:gsub("^%^[%a%d]", function(c)
		prefixColour = prefixColour or c
		return ""
	end)
	local resolved = stripped
	if actor and formatCalcStr then
		local ok, result = pcall(formatCalcStr, stripped, actor, rowData)
		if ok and type(result) == "string" then
			resolved = result
		end
	end
	-- Any unresolved {output:...} / {N:output:...} / {N:mod:...} tokens mean
	-- the actor / output entry was missing. Surface them as "-" instead of
	-- leaking the raw template back to the UI.
	resolved = resolved:gsub("{%d*:?output:[%a%.:]+}", "-")
	resolved = resolved:gsub("{%d+:mod:[%d,]+}", "-")
	resolved = resolved:gsub("^%s*%-%%%s*$", "-")
	resolved = resolved:gsub("^%s*%-+%s+to%s+%-+%s*$", "-")
	local cellColour = colour_key_for(prefixColour)
	return strip_colour_codes(resolved), cellColour
end

local function dropdown_options(control)
	local options = {}
	if not control or type(control.list) ~= "table" then
		return options
	end
	for index, entry in ipairs(control.list) do
		local label = nil
		if type(entry) == "table" then
			label = entry.label
		elseif type(entry) == "string" then
			label = entry
		end
		options[#options + 1] = {
			index = index,
			label = strip_colour_codes(safe_string(label) or tostring(index)),
		}
	end
	return options
end

local function selected_dropdown_index(control)
	if not control then return nil end
	local idx = safe_number(control.selIndex)
	if idx and idx > 0 then return idx end
	return nil
end

local function control_is_shown(control)
	if not control then return false end
	if type(control.IsShown) == "function" then
		local ok, shown = pcall(control.IsShown, control)
		if ok then return shown and true or false end
	end
	if type(control.shown) == "function" then
		local ok, shown = pcall(control.shown, control)
		if ok then return shown and true or false end
	end
	return control.shown ~= false
end

local function control_is_enabled(control)
	if not control then return false end
	if type(control.IsEnabled) == "function" then
		local ok, enabled = pcall(control.IsEnabled, control)
		if ok then return enabled and true or false end
	end
	return control.enabled ~= false
end

local function button_payload(control, fallbackLabel)
	return {
		label = strip_colour_codes(safe_string(control and control.label) or fallbackLabel),
		shown = control_is_shown(control),
		enabled = control_is_enabled(control),
	}
end

local function refresh_skill_select(tab)
	local section = tab.sectionList and tab.sectionList[1]
	if section and tab.build and type(tab.build.RefreshSkillSelectControls) == "function" then
		pcall(tab.build.RefreshSkillSelectControls, tab.build, section.controls, tab.input.skill_number or 1, "Calcs")
	end
end

local function skill_select_snapshot(tab)
	refresh_skill_select(tab)
	local section = tab.sectionList and tab.sectionList[1]
	local controls = section and section.controls or {}
	local modeOptions = {}
	for _, key in ipairs(CALC_BUFF_MODES) do
		modeOptions[#modeOptions + 1] = { value = key, label = CALC_BUFF_MODE_LABELS[key] or key }
	end
	return {
		skillNumber = safe_number(tab.input.skill_number) or 1,
		buffMode = safe_string(tab.input.misc_buffMode) or "EFFECTIVE",
		buffModeOptions = modeOptions,
		showMinion = safe_bool(tab.input.showMinion),
		showMinionShown = control_is_shown(controls.showMinion),
		socketGroup = {
			selected = selected_dropdown_index(controls.mainSocketGroup) or (safe_number(tab.input.skill_number) or 1),
			options = dropdown_options(controls.mainSocketGroup),
		},
		mainSkill = {
			selected = selected_dropdown_index(controls.mainSkill),
			enabled = control_is_enabled(controls.mainSkill),
			shown = control_is_shown(controls.mainSkill),
			options = dropdown_options(controls.mainSkill),
		},
		statSet = {
			selected = selected_dropdown_index(controls.statSet),
			enabled = control_is_enabled(controls.statSet),
			shown = control_is_shown(controls.statSet),
			options = dropdown_options(controls.statSet),
		},
		skillPart = {
			selected = selected_dropdown_index(controls.mainSkillPart),
			shown = control_is_shown(controls.mainSkillPart),
			options = dropdown_options(controls.mainSkillPart),
		},
		skillStages = {
			value = controls.mainSkillStageCount and safe_string(controls.mainSkillStageCount.buf) or nil,
			shown = control_is_shown(controls.mainSkillStageCount),
		},
		mineCount = {
			value = controls.mainSkillMineCount and safe_string(controls.mainSkillMineCount.buf) or nil,
			shown = control_is_shown(controls.mainSkillMineCount),
		},
		minion = {
			selected = selected_dropdown_index(controls.mainSkillMinion),
			shown = control_is_shown(controls.mainSkillMinion),
			options = dropdown_options(controls.mainSkillMinion),
		},
		spectreLibrary = button_payload(controls.mainSkillMinionLibrary, "Manage Spectres..."),
		beastLibrary = button_payload(controls.mainSkillBeastLibrary, "Manage Beasts..."),
		minionSkill = {
			selected = selected_dropdown_index(controls.mainSkillMinionSkill),
			shown = control_is_shown(controls.mainSkillMinionSkill),
			options = dropdown_options(controls.mainSkillMinionSkill),
		},
		minionSkillStatSet = {
			selected = selected_dropdown_index(controls.mainSkillMinionSkillStatSet),
			shown = control_is_shown(controls.mainSkillMinionSkillStatSet),
			options = dropdown_options(controls.mainSkillMinionSkillStatSet),
		},
	}
end

local function row_label_text(rowData)
	local label = safe_string(rowData.label)
	if label and label ~= "" then return label end
	return ""
end

local function cell_breakdown_key(sectionId, subIndex, rowIndex, colIndex, colData)
	if not colData then return nil end
	if not colData.breakdown and not colData.modName then
		return nil
	end
	return string.format("%s:%d:%d:%d", tostring(sectionId or "?"), subIndex, rowIndex, colIndex)
end

local function section_rows(tab, actor, section, subSection, subIndex)
	local rows = {}
	if type(subSection.data) ~= "table" then return rows end
	for rowIndex, rowData in ipairs(subSection.data) do
		if tab:CheckFlag(rowData) then
			local cells = {}
			for colIndex, colData in ipairs(rowData) do
				if type(colData) == "table" then
					local text, colour = format_cell_format(colData.format, actor, rowData)
					cells[#cells + 1] = {
						text = text,
						colour = colour or json.null,
						breakdownKey = cell_breakdown_key(section.id, subIndex, rowIndex, colIndex, colData) or json.null,
					}
				else
					cells[#cells + 1] = { text = "", colour = json.null, breakdownKey = json.null }
				end
			end
			rows[#rows + 1] = {
				label = row_label_text(rowData),
				cells = cells,
			}
		end
	end
	return rows
end

local function sub_section_extra(actor, subSection)
	local extra = subSection.data and subSection.data.extra
	if type(extra) ~= "string" or extra == "" then return nil end
	local text, _ = format_cell_format(extra, actor, subSection.data)
	if text == "" then return nil end
	return text
end

local function section_payload(tab, actor, section)
	local subs = {}
	for subIndex, subSection in ipairs(section.subSection or {}) do
		subs[#subs + 1] = {
			id = subSection.id,
			label = safe_string(subSection.label) or "",
			collapsed = safe_bool(subSection.collapsed),
			defaultCollapsed = safe_bool(subSection.defaultCollapsed),
			extra = sub_section_extra(actor, subSection) or json.null,
			colWidth = nullable_number(subSection.data and subSection.data.colWidth),
			rows = section_rows(tab, actor, section, subSection, subIndex),
		}
	end
	return {
		id = section.id,
		group = safe_number(section.group) or 0,
		widthCols = safe_number(section.widthCols) or 1,
		colour = colour_key_for(section.colour) or json.null,
		enabled = safe_bool(section.enabled),
		subSections = subs,
	}
end

local function calcs_snapshot()
	local tab = calcs_tab()
	if not tab then error("No active calcs tab") end
	ensure_calcs_built(tab)
	for _, section in ipairs(tab.sectionList or {}) do
		if type(section.UpdateSize) == "function" then
			pcall(section.UpdateSize, section)
		end
	end
	local actor = calc_actor(tab)
	local sections = {}
	for _, section in ipairs(tab.sectionList or {}) do
		sections[#sections + 1] = section_payload(tab, actor, section)
	end
	local mainOutput = tab.mainOutput or {}
	return {
		search = tab.controls.search and safe_string(tab.controls.search.buf) or "",
		skillSelect = skill_select_snapshot(tab),
		sections = sections,
		summary = {
			combinedDPS = safe_number(mainOutput.CombinedDPS),
			fullDPS = safe_number(mainOutput.FullDPS),
			totalEHP = safe_number(mainOutput.TotalEHP),
			life = safe_number(mainOutput.Life),
			energyShield = safe_number(mainOutput.EnergyShield),
			mana = safe_number(mainOutput.Mana),
		},
	}
end

local function find_section_cell(tab, sectionId, subIndex, rowIndex, colIndex)
	for _, section in ipairs(tab.sectionList or {}) do
		if section.id == sectionId then
			local subSection = section.subSection and section.subSection[subIndex]
			if not subSection then return nil end
			local rowData = subSection.data and subSection.data[rowIndex]
			if type(rowData) ~= "table" then return nil end
			local colData = rowData[colIndex]
			if type(colData) ~= "table" then return nil end
			return rowData, colData
		end
	end
	return nil
end

local function parse_breakdown_key(key)
	if type(key) ~= "string" then return nil end
	local sectionId, subIndex, rowIndex, colIndex = key:match("^([^:]+):(%d+):(%d+):(%d+)$")
	if not sectionId then return nil end
	return sectionId, tonumber(subIndex), tonumber(rowIndex), tonumber(colIndex)
end

local function mod_section_payload(actor, rowData, colData)
	local modNames = colData.modName
	if type(modNames) ~= "table" then modNames = { modNames } end
	local entries = {}
	local modStore = (colData.enemy and actor.enemy and actor.enemy.modDB)
		or (colData.cfg and actor.mainSkill and actor.mainSkill.skillModList)
		or actor.modDB
	if not modStore then return entries end
	local modCfg = (colData.cfg and actor.mainSkill and actor.mainSkill[colData.cfg .. "Cfg"]) or {}
	for _, modName in ipairs(modNames) do
		local list = modStore:Tabulate(colData.modType or "BASE", modCfg, modName) or {}
		for _, entry in ipairs(list) do
			local mod = entry.mod or {}
			entries[#entries + 1] = {
				name = safe_string(mod.name),
				type = safe_string(mod.type),
				value = safe_number(mod.value),
				source = safe_string(mod.source),
				sourceLine = safe_string(entry.sourceLine),
			}
		end
	end
	return {
		label = safe_string(colData.label) or row_label_text(rowData),
		modName = modNames,
		modType = safe_string(colData.modType) or "BASE",
		entries = entries,
	}
end

local function flatten_breakdown(actor, sectionData, colData)
	local key = colData.breakdown or sectionData and sectionData.breakdown
	if not key then return nil end
	local ns, name = key:match("^(%a+)%.(%a+)$")
	local breakdown
	if ns then
		breakdown = actor.breakdown and actor.breakdown[ns] and actor.breakdown[ns][name]
	else
		breakdown = actor.breakdown and actor.breakdown[key]
	end
	if type(breakdown) ~= "table" then return nil end
	local lines = {}
	if #breakdown > 0 then
		for _, line in ipairs(breakdown) do
			if type(line) == "string" then
				lines[#lines + 1] = strip_colour_codes(line)
			end
		end
	end
	local rowList
	if type(breakdown.rowList) == "table" then
		rowList = {}
		local colList = breakdown.colList or {}
		for _, row in ipairs(breakdown.rowList) do
			local out = {}
			for _, col in ipairs(colList) do
				out[col.key or col.label or "value"] = strip_colour_codes(safe_string(row[col.key]) or "")
			end
			rowList[#rowList + 1] = out
		end
	end
	return {
		stat = key,
		label = safe_string(breakdown.label),
		footer = safe_string(breakdown.footer),
		lines = lines,
		rowList = rowList,
		colList = breakdown.colList and (function()
			local cols = {}
			for _, col in ipairs(breakdown.colList) do
				cols[#cols + 1] = {
					key = safe_string(col.key) or "",
					label = strip_colour_codes(safe_string(col.label) or ""),
				}
			end
			return cols
		end)() or nil,
	}
end

local function calcs_breakdown(params)
	local tab = calcs_tab()
	if not tab then error("No active calcs tab") end
	ensure_calcs_built(tab)
	local sectionId, subIndex, rowIndex, colIndex = parse_breakdown_key(params and params.key)
	if not sectionId then error("pob.calcs.breakdown requires params.key") end
	local rowData, colData = find_section_cell(tab, sectionId, subIndex, rowIndex, colIndex)
	if not colData then error("Unknown breakdown cell: " .. tostring(params.key)) end
	local actor = calc_actor(tab)
	if not actor then error("No calc actor available") end

	local payload = { key = params.key, sections = {} }
	if colData.breakdown then
		local section = flatten_breakdown(actor, rowData, colData)
		if section then payload.sections[#payload.sections + 1] = { type = "BREAKDOWN", data = section } end
	end
	if colData.modName then
		local section = mod_section_payload(actor, rowData, colData)
		if section then payload.sections[#payload.sections + 1] = { type = "MODS", data = section } end
	end
	for _, child in ipairs(rowData) do
		if type(child) == "table" and child ~= colData and child.modName and not child.format then
			local section = mod_section_payload(actor, rowData, child)
			if section and #section.entries > 0 then
				payload.sections[#payload.sections + 1] = { type = "MODS", data = section }
			end
		end
	end
	return payload
end

local function mark_calcs_changed(tab)
	if tab.AddUndoState then pcall(tab.AddUndoState, tab) end
	tab.modFlag = true
	tab.build.buildFlag = true
	if type(sync_build_frame) == "function" then sync_build_frame() end
end

local function require_number(action, key)
	if type(action[key]) ~= "number" then
		error("calcs action requires numeric " .. key)
	end
	return action[key]
end

local function set_edit_control(control, value)
	if not control then return end
	control.buf = tostring(value or "")
end

local function find_section(tab, sectionId)
	for _, section in ipairs(tab.sectionList or {}) do
		if section.id == sectionId then return section end
	end
	return nil
end

local function calcs_action(action)
	local tab = calcs_tab()
	if not tab then error("No active calcs tab") end
	if type(action) ~= "table" or type(action.type) ~= "string" then
		error("pob.calcs.action requires action.type")
	end
	ensure_calcs_built(tab)
	local section = tab.sectionList and tab.sectionList[1]
	local controls = section and section.controls or {}

	local actionType = action.type
	if actionType == "setSkillNumber" then
		tab.input.skill_number = require_number(action, "value")
	elseif actionType == "setBuffMode" then
		if type(action.value) ~= "string" then error("setBuffMode requires string value") end
		tab.input.misc_buffMode = action.value
	elseif actionType == "setShowMinion" then
		tab.input.showMinion = action.value and true or false
	elseif actionType == "setMainActiveSkill" then
		local idx = require_number(action, "value")
		local mainSocketGroup = tab.build.skillsTab.socketGroupList[tab.input.skill_number]
		if mainSocketGroup then mainSocketGroup.mainActiveSkillCalcs = idx end
	elseif actionType == "setStatSet" then
		local idx = require_number(action, "value")
		local mainSocketGroup = tab.build.skillsTab.socketGroupList[tab.input.skill_number]
		local active = mainSocketGroup and mainSocketGroup.displaySkillListCalcs and mainSocketGroup.displaySkillListCalcs[mainSocketGroup.mainActiveSkillCalcs]
		local srcInstance = active and active.activeEffect and active.activeEffect.srcInstance
		if srcInstance then
			srcInstance.statSetCalcs = srcInstance.statSetCalcs or {}
			local list = controls.statSet and controls.statSet.list or {}
			local entry = list[idx]
			if entry and entry.grantedEffectId then
				srcInstance.statSetCalcs[entry.grantedEffectId] = idx
			end
		end
	elseif actionType == "setSkillPart" then
		local idx = require_number(action, "value")
		local mainSocketGroup = tab.build.skillsTab.socketGroupList[tab.input.skill_number]
		local active = mainSocketGroup and mainSocketGroup.displaySkillListCalcs and mainSocketGroup.displaySkillListCalcs[mainSocketGroup.mainActiveSkillCalcs]
		local srcInstance = active and active.activeEffect and active.activeEffect.srcInstance
		if srcInstance then srcInstance.skillPartCalcs = idx end
	elseif actionType == "setSkillStages" then
		local value = action.value
		local mainSocketGroup = tab.build.skillsTab.socketGroupList[tab.input.skill_number]
		local active = mainSocketGroup and mainSocketGroup.displaySkillListCalcs and mainSocketGroup.displaySkillListCalcs[mainSocketGroup.mainActiveSkillCalcs]
		local srcInstance = active and active.activeEffect and active.activeEffect.srcInstance
		if srcInstance then srcInstance.skillStageCountCalcs = tonumber(value) end
		set_edit_control(controls.mainSkillStageCount, value)
	elseif actionType == "setMines" then
		local value = action.value
		local mainSocketGroup = tab.build.skillsTab.socketGroupList[tab.input.skill_number]
		local active = mainSocketGroup and mainSocketGroup.displaySkillListCalcs and mainSocketGroup.displaySkillListCalcs[mainSocketGroup.mainActiveSkillCalcs]
		local srcInstance = active and active.activeEffect and active.activeEffect.srcInstance
		if srcInstance then srcInstance.skillMineCountCalcs = tonumber(value) end
		set_edit_control(controls.mainSkillMineCount, value)
	elseif actionType == "setMinion" then
		local idx = require_number(action, "value")
		local list = controls.mainSkillMinion and controls.mainSkillMinion.list or {}
		local entry = list[idx]
		local mainSocketGroup = tab.build.skillsTab.socketGroupList[tab.input.skill_number]
		local active = mainSocketGroup and mainSocketGroup.displaySkillListCalcs and mainSocketGroup.displaySkillListCalcs[mainSocketGroup.mainActiveSkillCalcs]
		local srcInstance = active and active.activeEffect and active.activeEffect.srcInstance
		if entry and srcInstance then
			if entry.itemSetId then
				srcInstance.skillMinionItemSetCalcs = entry.itemSetId
				srcInstance.skillMinionItemSet = entry.itemSetId
			elseif entry.minionId then
				srcInstance.skillMinionCalcs = entry.minionId
				srcInstance.skillMinion = entry.minionId
			end
		end
	elseif actionType == "setMinionSkill" then
		local idx = require_number(action, "value")
		local mainSocketGroup = tab.build.skillsTab.socketGroupList[tab.input.skill_number]
		local active = mainSocketGroup and mainSocketGroup.displaySkillListCalcs and mainSocketGroup.displaySkillListCalcs[mainSocketGroup.mainActiveSkillCalcs]
		local srcInstance = active and active.activeEffect and active.activeEffect.srcInstance
		if srcInstance then srcInstance.skillMinionSkillCalcs = idx end
	elseif actionType == "setMinionSkillStatSet" then
		local idx = require_number(action, "value")
		local list = controls.mainSkillMinionSkillStatSet and controls.mainSkillMinionSkillStatSet.list or {}
		local entry = list[idx]
		local mainSocketGroup = tab.build.skillsTab.socketGroupList[tab.input.skill_number]
		local active = mainSocketGroup and mainSocketGroup.displaySkillListCalcs and mainSocketGroup.displaySkillListCalcs[mainSocketGroup.mainActiveSkillCalcs]
		local srcInstance = active and active.activeEffect and active.activeEffect.srcInstance
		if entry and srcInstance and entry.grantedEffectId then
			srcInstance.skillMinionSkillStatSetIndexLookupCalcs = srcInstance.skillMinionSkillStatSetIndexLookupCalcs or {}
			srcInstance.skillMinionSkillStatSetIndexLookupCalcs[entry.grantedEffectId] = srcInstance.skillMinionSkillStatSetIndexLookupCalcs[entry.grantedEffectId] or {}
			srcInstance.skillMinionSkillStatSetIndexLookupCalcs[entry.grantedEffectId][srcInstance.skillMinionSkillCalcs] = idx
		end
	elseif actionType == "toggleSubsection" then
		if type(action.sectionId) ~= "string" then error("toggleSubsection requires sectionId") end
		if type(action.subSectionId) ~= "string" then error("toggleSubsection requires subSectionId") end
		local target = find_section(tab, action.sectionId)
		if target and target.subSection then
			for _, sub in ipairs(target.subSection) do
				if sub.id == action.subSectionId then
					sub.collapsed = not sub.collapsed
					break
				end
			end
		end
		tab.modFlag = true
		return calcs_snapshot()
	else
		error("Unknown calcs action: " .. tostring(actionType))
	end

	mark_calcs_changed(tab)
	return calcs_snapshot()
end

-- ============================================================================
-- Config tab RPC
-- Mirrors PoB Classes/ConfigTab.lua + Modules/ConfigOptions.lua.
-- ============================================================================

local CONFIG_OPTION_LIST

local function config_option_list()
	if not CONFIG_OPTION_LIST then
		CONFIG_OPTION_LIST = LoadModule("Modules/ConfigOptions")
	end
	return CONFIG_OPTION_LIST or {}
end

local function config_tab()
	local b = current_build()
	return b and b.configTab or nil
end

local function json_scalar(value)
	local kind = type(value)
	if kind == "string" or kind == "number" or kind == "boolean" then
		return value
	end
	return json.null
end

local function control_tooltip_text(control)
	if not control or type(control.GetProperty) ~= "function" then return nil end
	local ok, text = pcall(control.GetProperty, control, "tooltipText")
	if ok and type(text) == "string" and text ~= "" then
		return strip_colour_codes(text)
	end
	return nil
end

local function config_sets_payload(tab)
	local sets = {}
	for index, configSetId in ipairs(tab.configSetOrderList or {}) do
		local configSet = tab.configSets and tab.configSets[configSetId] or {}
		sets[#sets + 1] = {
			id = configSetId,
			index = index,
			title = safe_string(configSet.title) or "Default",
			active = configSetId == tab.activeConfigSetId,
		}
	end
	return sets
end

local function config_list_options(varData, control)
	local options = {}
	if type(varData.list) ~= "table" then return options end
	for index, entry in ipairs(varData.list) do
		if type(entry) == "table" then
			options[#options + 1] = {
				index = index,
				value = json_scalar(entry.val),
				label = strip_colour_codes(safe_string(entry.label) or tostring(entry.val or index)),
			}
		end
	end
	return options, selected_dropdown_index(control)
end

local function config_option_payload(tab, varData, control, sectionIndex, optionIndex)
	local configSet = tab.configSets and tab.configSets[tab.activeConfigSetId] or {}
	local input = configSet.input or {}
	local placeholder = configSet.placeholder or {}
	local var = safe_string(varData.var)
	local current = var and input[var] or nil
	local defaultValue
	if var and type(tab.GetDefaultState) == "function" then
		local ok, result = pcall(tab.GetDefaultState, tab, var, type(current))
		if ok then defaultValue = result end
	end
	local options, selectedIndex = config_list_options(varData, control)
	local shown = control_is_shown(control)
	return {
		id = var or string.format("section-%d-label-%d", sectionIndex, optionIndex),
		var = var,
		kind = safe_string(varData.type) or "label",
		label = strip_colour_codes(safe_string(varData.label) or ""),
		value = json_scalar(current),
		defaultValue = json_scalar(defaultValue),
		placeholder = var and json_scalar(placeholder[var]) or nil,
		shown = shown,
		enabled = control_is_enabled(control),
		modified = var and current ~= nil and current ~= defaultValue or false,
		tooltip = control_tooltip_text(control),
		options = options,
		selectedIndex = selectedIndex,
		resizable = safe_bool(varData.resizable),
		hideIfInvalid = safe_bool(varData.hideIfInvalid),
		doNotHighlight = safe_bool(varData.doNotHighlight),
	}
end

local function config_snapshot()
	local b = current_build()
	local tab = config_tab()
	if not tab then error("No active config tab") end
	if b and b.calcsTab then
		ensure_calcs_built(b.calcsTab)
	end
	if type(tab.BuildModList) == "function" then pcall(tab.BuildModList, tab) end
	if type(tab.UpdateControls) == "function" then pcall(tab.UpdateControls, tab) end

	for _, section in ipairs(tab.sectionList or {}) do
		section.shown = true
	end

	local sections = {}
	local sectionIndex = 0
	local optionIndex = 0
	local currentSection
	local currentControlSection
	for _, varData in ipairs(config_option_list()) do
		if varData.section then
			sectionIndex = sectionIndex + 1
			optionIndex = 0
			currentControlSection = tab.sectionList and tab.sectionList[sectionIndex]
			currentSection = {
				id = string.format("section-%d", sectionIndex),
				label = strip_colour_codes(safe_string(varData.section) or ""),
				col = safe_number(varData.col),
				shown = false,
				options = {},
			}
			sections[#sections + 1] = currentSection
		elseif currentSection then
			optionIndex = optionIndex + 1
			local control = currentControlSection and currentControlSection.varControlList and currentControlSection.varControlList[optionIndex]
			local option = config_option_payload(tab, varData, control, sectionIndex, optionIndex)
			if option.shown then currentSection.shown = true end
			currentSection.options[#currentSection.options + 1] = option
		end
	end

	return {
		activeConfigSetId = tab.activeConfigSetId,
		configSets = config_sets_payload(tab),
		search = tab.controls and tab.controls.search and safe_string(tab.controls.search.buf) or "",
		showAll = safe_bool(tab.toggleConfigs),
		sections = sections,
	}
end

local function require_config_var(var)
	if type(var) ~= "string" or var == "" then
		error("config action requires var")
	end
	for _, varData in ipairs(config_option_list()) do
		if varData.var == var then
			return varData
		end
	end
	error("Unknown config option: " .. tostring(var))
end

local function require_config_set(tab, setId)
	if type(setId) ~= "number" then
		error("config set id must be a number")
	end
	local configSet = tab.configSets and tab.configSets[setId]
	if type(configSet) ~= "table" then
		error("Unknown config set: " .. tostring(setId))
	end
	return configSet
end

local function config_title(title)
	if type(title) ~= "string" or not title:match("%S") then
		return "Default"
	end
	return title
end

local function action_value(value)
	if value == json.null then return nil end
	return value
end

local function mark_config_input_changed(tab)
	if type(tab.AddUndoState) == "function" then pcall(tab.AddUndoState, tab) end
	if type(tab.BuildModList) == "function" then pcall(tab.BuildModList, tab) end
	if type(tab.UpdateControls) == "function" then pcall(tab.UpdateControls, tab) end
	local b = current_build()
	if b then b.buildFlag = true end
end

local function mark_config_set_changed(tab)
	tab.modFlag = true
	if type(tab.AddUndoState) == "function" then pcall(tab.AddUndoState, tab) end
	local b = current_build()
	if b then
		b.buildFlag = true
		if type(b.SyncLoadouts) == "function" then pcall(b.SyncLoadouts, b) end
	end
end

local function next_config_set_id(tab)
	local id = 1
	while tab.configSets and tab.configSets[id] do
		id = id + 1
	end
	return id
end

local function set_config_option(tab, varData, rawValue)
	local configSet = tab.configSets and tab.configSets[tab.activeConfigSetId] or {}
	configSet.input = configSet.input or {}
	local input = configSet.input
	local value = action_value(rawValue)
	local kind = varData.type
	if kind == "check" then
		input[varData.var] = value and true or false
	elseif kind == "count" or kind == "integer" or kind == "countAllowZero" or kind == "float" then
		input[varData.var] = tonumber(value)
	elseif kind == "list" then
		for _, entry in ipairs(varData.list or {}) do
			if type(entry) == "table" and entry.val == value then
				input[varData.var] = entry.val
				return
			end
		end
		error("Invalid list value for config option: " .. tostring(varData.var))
	elseif kind == "text" then
		input[varData.var] = safe_string(value) or ""
	else
		error("Config option is not editable: " .. tostring(varData.var))
	end
end

local function config_action(action)
	local tab = config_tab()
	if not tab then error("No active config tab") end
	if type(action) ~= "table" or type(action.type) ~= "string" then
		error("pob.config.action requires action.type")
	end

	if action.type == "setActiveConfigSet" then
		require_config_set(tab, action.setId)
		tab:SetActiveConfigSet(action.setId)
		if type(tab.AddUndoState) == "function" then pcall(tab.AddUndoState, tab) end
		return config_snapshot()
	elseif action.type == "setSearch" then
		local text = safe_string(action.value) or ""
		if tab.controls and tab.controls.search then
			tab.controls.search.buf = text:sub(1, 100)
		end
		if type(tab.UpdateControls) == "function" then pcall(tab.UpdateControls, tab) end
		return config_snapshot()
	elseif action.type == "setShowAll" then
		tab.toggleConfigs = action.value and true or false
		if type(tab.UpdateControls) == "function" then pcall(tab.UpdateControls, tab) end
		return config_snapshot()
	elseif action.type == "setOption" then
		local varData = require_config_var(action.var)
		set_config_option(tab, varData, action.value)
		mark_config_input_changed(tab)
		return config_snapshot()
	elseif action.type == "newConfigSet" then
		local configSet = tab:NewConfigSet(nil, config_title(action.title))
		table.insert(tab.configSetOrderList, configSet.id)
		mark_config_set_changed(tab)
		return config_snapshot()
	elseif action.type == "copyConfigSet" then
		local source = require_config_set(tab, action.setId)
		local configSet = copyTable(source)
		configSet.id = next_config_set_id(tab)
		configSet.title = config_title(action.title)
		tab.configSets[configSet.id] = configSet
		table.insert(tab.configSetOrderList, configSet.id)
		mark_config_set_changed(tab)
		return config_snapshot()
	elseif action.type == "renameConfigSet" then
		local configSet = require_config_set(tab, action.setId)
		configSet.title = config_title(action.title)
		mark_config_set_changed(tab)
		return config_snapshot()
	elseif action.type == "deleteConfigSet" then
		require_config_set(tab, action.setId)
		if #(tab.configSetOrderList or {}) <= 1 then
			error("Cannot delete the only config set")
		end
		for index, setId in ipairs(tab.configSetOrderList) do
			if setId == action.setId then
				table.remove(tab.configSetOrderList, index)
				tab.configSets[setId] = nil
				if tab.activeConfigSetId == setId then
					tab:SetActiveConfigSet(tab.configSetOrderList[math.max(1, index - 1)])
				end
				mark_config_set_changed(tab)
				return config_snapshot()
			end
		end
		error("Unknown config set: " .. tostring(action.setId))
	end

	error("Unknown config action: " .. tostring(action.type))
end

local function handle_method(method, params)
	params = params or {}
	if method == "pob.ping" then
		return {
			pong = true,
			pobVersion = launch and launch.versionNumber or "?",
		}
	elseif method == "pob.tree.snapshot" then
		return tree_snapshot()
	elseif method == "pob.tree.metadata" then
		local spec = current_spec()
		if not spec or not spec.tree then
			error("No active passive tree")
		end
		
		local safe_connectors = {}
		for _, c in ipairs(spec.tree.connectors) do
			local safe_c = {
				type = c.type,
				nodeId1 = c.nodeId1,
				nodeId2 = c.nodeId2,
				vert = {}
			}
			if type(c.vert) == "table" then
				for k, v in pairs(c.vert) do
					if type(v) == "table" and type(v[1]) == "number" then
						safe_c.vert[k] = {v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]}
					end
				end
			end
			table.insert(safe_connectors, safe_c)
		end

		local safe_assets = {}
		if spec.tree.assets then
			for k, v in pairs(spec.tree.assets) do
				if type(v) == "table" and type(v[1]) == "string" then
					safe_assets[k] = v[1]
				elseif type(v) == "string" then
					safe_assets[k] = v
				end
			end
		end

		local class_background = nil
		local class_data = spec.tree.classes and spec.tree.classes[spec.curClassId]
		if type(class_data) == "table" and class_data.background then
			class_background = safe_art(class_data.background)
			local ascend_data = class_data.classes and class_data.classes[spec.curAscendClassId]
			if spec.curAscendClassId ~= 0
				and class_background
				and type(ascend_data) == "table"
				and ascend_data.background
				and type(ascend_data.background.image) == "string"
			then
				class_background.image = ascend_data.background.image
			end
			-- BGTreeActive rotates toward the start node. See PassiveTreeView.lua:590-596.
			if class_background and type(class_data.startNodeId) == "number" then
				local start_node = spec.nodes[class_data.startNodeId]
				if type(start_node) == "table"
					and type(start_node.x) == "number"
					and type(start_node.y) == "number"
				then
					class_background.startNodeX = start_node.x
					class_background.startNodeY = start_node.y
				end
			end
		end

		local ascendancy_backgrounds = {}
		if type(spec.tree.ascendNameMap) == "table" then
			for name, data in pairs(spec.tree.ascendNameMap) do
				local ascendancy = data.ascendClass
				local drawn = true
				if type(ascendancy) == "table" then
					if ascendancy.replaceBy and ascendancy.replaceBy == spec.curAscendClassBaseName then
						drawn = false
					elseif ascendancy.replace and name ~= spec.curAscendClassBaseName then
						drawn = false
					end
					if drawn and ascendancy.background then
						local art = safe_art(ascendancy.background)
						if art then
							art.selected = name == spec.curAscendClassBaseName
							table.insert(ascendancy_backgrounds, art)
						end
					end
				end
			end
		end

		local group_backgrounds = {}
		if type(spec.tree.groups) == "table" then
			for _, group in pairs(spec.tree.groups) do
				if type(group) == "table" and not group.isProxy and group.background then
					local art = safe_art(group.background)
					if art then
						if type(group.x) == "number" then art.x = group.x end
						if type(group.y) == "number" then art.y = group.y end
						if art.offsetX and art.offsetY then
							art.x = (group.x or 0) + art.offsetX
							art.y = (group.y or 0) + art.offsetY
						end
						table.insert(group_backgrounds, art)
					end
				end
			end
		end

		return {
			assets = safe_assets,
			ddsCoords = spec.tree.ddsCoords or {},
			nodeOverlay = spec.tree.nodeOverlay or {},
			skillSprites = spec.tree.skillSprites,
			connectors = safe_connectors,
			classBackground = class_background,
			ascendancyBackgrounds = ascendancy_backgrounds,
			groupBackgrounds = group_backgrounds,
		}
	elseif method == "pob.tree.allocate" then
		if type(params.nodeId) ~= "number" then
			error("pob.tree.allocate requires params.nodeId")
		end
		return tree_allocate(params.nodeId, "allocate")
	elseif method == "pob.tree.deallocate" then
		if type(params.nodeId) ~= "number" then
			error("pob.tree.deallocate requires params.nodeId")
		end
		return tree_allocate(params.nodeId, "deallocate")
	elseif method == "pob.items.snapshot" then
		return items_snapshot()
	elseif method == "pob.items.dbList" then
		local key = params.db
		if key ~= "uniqueDB" and key ~= "rareDB" then
			error("pob.items.dbList requires params.db = uniqueDB|rareDB")
		end
		return items_db_list(key)
	elseif method == "pob.items.action" then
		return items_action(params)
	elseif method == "pob.skills.snapshot" then
		return skills_snapshot()
	elseif method == "pob.skills.action" then
		return skills_action(params)
	elseif method == "pob.calcs.snapshot" then
		return calcs_snapshot()
	elseif method == "pob.calcs.breakdown" then
		return calcs_breakdown(params)
	elseif method == "pob.calcs.action" then
		return calcs_action(params)
	elseif method == "pob.config.snapshot" then
		return config_snapshot()
	elseif method == "pob.config.action" then
		return config_action(params)
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
