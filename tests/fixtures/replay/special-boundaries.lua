-- Trusted test code, never read from an imported replay. These boundary tests
-- control the triggering chain; the separate Monk/Ryko fixture covers a full
-- native duel and fails when GetFlipEffect is deliberately removed.
local nativeCard, nativeDuel = Card, Duel
local chain = nil
local getChainInfo = Duel.GetChainInfo
Duel.GetChainInfo = function() return chain end
local c = Debug.AddCard(21502796, 0, 0, LOCATION_MZONE, 0, POS_FACEUP_ATTACK)
assert(c:GetFlipEffect(), 'Actual Ryko effect registration')
local warning = Effect.CreateEffect(c)
warning:SetCode(EVENT_FLIP_SUMMON)
warning:SetCategory(CATEGORY_DISABLE_SUMMON)
chain = warning
Debug.PreSummon(c, SUMMON_TYPE_FLIP)
assert(not c:IsFaceup() and c:GetPosition() == POS_FACEDOWN)
Debug.PreSummon(c, SUMMON_TYPE_NORMAL)
assert(c:IsFaceup() and c:GetPosition() == POS_FACEUP_ATTACK)
Debug.PreSummon(c, SUMMON_TYPE_FLIP)
local oldCondition = function() return true end
local redirect = Effect.CreateEffect(c)
redirect:SetType(EFFECT_TYPE_SINGLE)
redirect:SetCode(EFFECT_LEAVE_FIELD_REDIRECT)
redirect:SetCondition(oldCondition)
c:RegisterEffect(redirect)
assert(not redirect:GetCondition()(redirect), 'Negated flip must not redirect')
chain = nil
assert(redirect:GetCondition()(redirect), 'Ordinary leave-field keeps condition')
local global = Effect.CreateEffect(c)
global:SetType(EFFECT_TYPE_FIELD)
global:SetCode(EFFECT_TO_GRAVE_REDIRECT)
global:SetProperty(EFFECT_FLAG_IGNORE_RANGE)
global:SetCondition(oldCondition)
c:RegisterEffect(global)
chain = warning
assert(global:GetCondition() == oldCondition and global:GetCondition()(global),
  'Global ignore-range effect must remain unchanged')
Duel.GetChainInfo = getChainInfo

-- Previous state/reason and negate-summon arguments are isolated mocks, so
-- these assertions do not pretend to be a full Solemn Warning duel fixture.
local flipList = Auxiliary.__flip_effect_list
Auxiliary.__flip_effect_list = {}
Card = {
  IsPreviousLocation = function(c, location) return (c.previous & location) ~= 0 end,
  GetPreviousLocation = function(c) return c.previous end,
  IsFaceup = function(c) return (c.position & POS_FACEUP) ~= 0 end,
  GetPosition = function(c) return c.position end,
  RegisterEffect = function(c, e) c.registered = e; return 7 end,
}
local negations = 0
Duel = {
  GetChainInfo = function() return chain end,
  NegateSummon = function() negations = negations + 1; return 9 end,
}
Auxiliary.PreloadUds()
local reason = { GetCode = function() return EVENT_FLIP_SUMMON end,
  GetCategory = function() return CATEGORY_DISABLE_SUMMON end }
local mock = setmetatable({ previous = LOCATION_MZONE, position = POS_FACEUP_ATTACK,
  flip = true, reason = reason, status = true }, { __index = Card })
mock.GetReasonEffect = function(c) return c.reason end
mock.IsSummonType = function(c) return c.flip end
mock.IsReason = function() return true end
mock.IsLocation = function() return true end
mock.SetStatus = function(c, status, value)
  assert(status == STATUS_PROC_COMPLETE); c.status = value
end
assert(not mock:IsPreviousLocation(LOCATION_ONFIELD) and mock:GetPreviousLocation() == 0)
mock.flip = false
assert(mock:IsPreviousLocation(LOCATION_ONFIELD) and mock:GetPreviousLocation() == LOCATION_MZONE)
mock.flip = true; mock.reason = nil
assert(mock:IsPreviousLocation(LOCATION_ONFIELD), 'Normal send-to-grave stays unchanged')
local group = { GetCount = function() return 1 end, GetFirst = function() return mock end }
chain = reason
assert(Duel.NegateSummon(group) == 9 and not mock.status and negations == 1)
mock.status = true
chain = { GetCode = function() return EVENT_SUMMON end }
Duel.NegateSummon(group)
assert(mock.status and negations == 2, 'Normal summon does not lose procedure status')
local group2 = { GetCount = function() return 2 end, GetFirst = function() return mock end }
chain = reason
Duel.NegateSummon(group2)
assert(mock.status, 'Multi-card summon is not rewritten')
Card, Duel, Auxiliary.__flip_effect_list = nativeCard, nativeDuel, flipList
