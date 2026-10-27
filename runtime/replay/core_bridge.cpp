#include <algorithm>
#include <cstring>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>
#include "ocgapi.h"
#include "card_data.h"
#include "duel.h"
#include "interpreter.h"
#include "field.h"
#include <lzma.h>

namespace {
static_assert(sizeof(card_data)==80, "The frozen CardReader table must match the native ABI");
std::unordered_map<uint32_t, card_data> cards;
std::unordered_map<std::string, std::vector<byte>> scripts;
std::string error;

void fail(const std::string& message) {
    if (error.empty()) error = message.substr(0, 2048);
}

uint32_t card_reader_callback(uint32_t code, card_data* output) {
    const auto found = cards.find(code);
    if (found == cards.end()) {
        output->clear();
        fail("Missing card data: " + std::to_string(code));
    } else *output = found->second;
    return 0;
}

byte* script_reader_callback(const char* requested, int* length) {
    std::string name(requested);
    if (name.rfind("./", 0) == 0) name.erase(0, 2);
    if (name.rfind("script/", 0) == 0) name.erase(0, 7);
    if (name.find("..") != std::string::npos || name.find('\\') != std::string::npos) {
        fail("Invalid script path");
        return nullptr;
    }
    const auto found = scripts.find(name);
    if (found == scripts.end()) {
        // The engine legitimately probes normal-monster scripts that do not
        // exist. Required effect/common scripts must never be silently skipped.
        if (name.size() > 5 && name[0] == 'c' && name.substr(name.size() - 4) == ".lua") {
            const auto code = static_cast<uint32_t>(std::strtoul(name.c_str() + 1, nullptr, 10));
            const auto card = cards.find(code);
            if (card != cards.end() && (card->second.type & TYPE_MONSTER) && !(card->second.type & TYPE_EFFECT))
                return nullptr;
        }
        fail("Missing script: " + name);
        return nullptr;
    }
    *length = static_cast<int>(found->second.size());
    return const_cast<byte*>(found->second.data());
}

uint32_t log_callback(intptr_t handle, uint32_t type) {
    char text[4096]{};
    get_log_message(handle, text);
    if (type == 1) fail(std::string("Lua: ") + text);
    return 0;
}
}

extern "C" {
void replay_clear_resources() {
    cards.clear(); scripts.clear(); error.clear();
}
void replay_add_cards(const byte* data, uint32_t count) {
    if (count > 20000) { fail("Card data limit"); return; }
    for (uint32_t i = 0; i < count; ++i) {
        card_data card{};
        std::memcpy(&card, data + i * sizeof(card_data), sizeof(card_data));
        cards[card.code] = card;
    }
}
void replay_add_script(const char* name, const byte* data, uint32_t length) {
    if (length > 1024 * 1024) { fail("Script size limit"); return; }
    scripts[name] = std::vector<byte>(data, data + length);
}
const char* replay_error() { return error.c_str(); }
void replay_clear_error() { error.clear(); }
int32_t replay_state(intptr_t handle, int field) {
    const auto game = reinterpret_cast<duel*>(handle)->game_field;
    switch(field) {
    case 0: return game->player[0].lp;
    case 1: return game->player[1].lp;
    case 2: return game->infos.turn_id;
    case 3: return game->infos.phase;
    case 4: return game->infos.turn_player;
    default: return 0;
    }
}
intptr_t replay_create(const uint32_t* seeds, uint32_t legacy_seed, int legacy) {
    error.clear();
    set_card_reader(card_reader_callback);
    set_script_reader(script_reader_callback);
    set_message_handler(log_callback);
    if (legacy) {
        std::mt19937 random(legacy_seed);
        return create_duel(random());
    }
    return create_duel_v2(const_cast<uint32_t*>(seeds));
}
int replay_has_special(intptr_t handle) {
    const auto state = reinterpret_cast<duel*>(handle)->lua->lua_state;
    lua_getglobal(state, "Card");
    lua_getfield(state, -1, "GetFlipEffect");
    const int result = lua_isfunction(state, -1);
    lua_pop(state, 2);
    return result;
}
// Internal diagnostics/tests only. Replay input never supplies Lua source.
int replay_evaluate(intptr_t handle, const char* source) {
    const auto state = reinterpret_cast<duel*>(handle)->lua->lua_state;
    if (luaL_loadstring(state, source) != LUA_OK || lua_pcall(state, 0, 0, 0) != LUA_OK) {
        fail(lua_tostring(state, -1));
        lua_pop(state, 1);
        return 0;
    }
    return 1;
}
int replay_decode_lzma(const byte* input, uint32_t input_length, const byte* properties,
                       byte* output, uint32_t output_length) {
    if (!output_length || output_length > 0x80000) return 0;
    lzma_filter filter{LZMA_FILTER_LZMA1, nullptr};
    if (lzma_properties_decode(&filter, nullptr, properties, 5) != LZMA_OK) return 0;
    auto options = static_cast<lzma_options_lzma*>(filter.options);
    if (options->dict_size > (32U << 20) || options->lc + options->lp > 4) {
        lzma_filter filters[] = {filter, {LZMA_VLI_UNKNOWN, nullptr}};
        lzma_filters_free(filters, nullptr);
        return 0;
    }
    lzma_set_ext_size(*options, output_length);
    options->ext_flags = LZMA_LZMA1EXT_ALLOW_EOPM;
    filter.id = LZMA_FILTER_LZMA1EXT;
    lzma_filter filters[] = {filter, {LZMA_VLI_UNKNOWN, nullptr}};
    size_t input_position = 0, output_position = 0;
    const auto result = lzma_raw_buffer_decode(filters, nullptr, input, &input_position,
                                               input_length, output, &output_position, output_length);
    lzma_filters_free(filters, nullptr);
    return result == LZMA_OK && output_position == output_length && input_position == input_length ? 1 : 0;
}
}
