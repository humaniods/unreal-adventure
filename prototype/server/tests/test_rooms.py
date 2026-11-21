import pytest

from triund_server.rooms import CODE_ALPHABET, CODE_LEN, Lobby, LobbyError


def lobby_with(*pids, cap=100):
    L = Lobby(world_cap=cap)
    for p in pids:
        L.connect(p, p.title())
    return L


def test_create_gives_readable_code():
    L = lobby_with("aaaaaaaa")
    party = L.create_party("aaaaaaaa", "couple", 2)
    assert len(party.code) == CODE_LEN and set(party.code) <= set(CODE_ALPHABET)
    assert party.host == "aaaaaaaa" and party.members == ["aaaaaaaa"]


@pytest.mark.parametrize("mode,size", [("couple", 4), ("bakchods", 2), ("bakchods", 5), ("solo", 1)])
def test_bad_sizes_rejected(mode, size):
    L = lobby_with("aaaaaaaa")
    with pytest.raises(LobbyError):
        L.create_party("aaaaaaaa", mode, size)


def test_join_full_and_unknown():
    L = lobby_with("aaaaaaaa", "bbbbbbbb", "cccccccc")
    code = L.create_party("aaaaaaaa", "couple", 2).code
    L.join_party("bbbbbbbb", code.lower())          # codes are case-insensitive
    with pytest.raises(LobbyError, match="full"):
        L.join_party("cccccccc", code)
    with pytest.raises(LobbyError, match="No room"):
        L.join_party("cccccccc", "ZZZZZZ")


def test_start_needs_friend_and_ready():
    L = lobby_with("aaaaaaaa", "bbbbbbbb")
    code = L.create_party("aaaaaaaa", "bakchods", 4).code
    with pytest.raises(LobbyError, match="friend"):
        L.start("aaaaaaaa")
    L.join_party("bbbbbbbb", code)
    with pytest.raises(LobbyError, match="Not ready"):
        L.start("aaaaaaaa")
    with pytest.raises(LobbyError, match="host"):
        L.start("bbbbbbbb")
    L.set_ready("bbbbbbbb", True)
    party, world = L.start("aaaaaaaa")
    assert party.started and world.players == {"aaaaaaaa", "bbbbbbbb"}


def test_late_joiner_drops_into_world():
    L = lobby_with("aaaaaaaa", "bbbbbbbb", "cccccccc")
    code = L.create_party("aaaaaaaa", "bakchods", 4).code
    L.join_party("bbbbbbbb", code); L.set_ready("bbbbbbbb", True)
    _, world = L.start("aaaaaaaa")
    L.join_party("cccccccc", code)
    assert "cccccccc" in world.players and L.players["cccccccc"].world == world.wid


def test_parties_share_worlds_up_to_cap():
    pids = [f"p{i:07d}" for i in range(6)]
    L = lobby_with(*pids, cap=4)
    worlds = []
    for a, b in zip(pids[::2], pids[1::2]):
        code = L.create_party(a, "couple", 2).code
        L.join_party(b, code); L.set_ready(b, True)
        worlds.append(L.start(a)[1].wid)
    assert worlds[0] == worlds[1] != worlds[2]      # two couples fill a world of 4, the third gets a new one


def test_different_start_times_get_different_worlds():
    L = lobby_with("aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd")
    c1 = L.create_party("aaaaaaaa", "couple", 2).code; L.join_party("bbbbbbbb", c1); L.set_ready("bbbbbbbb", True)
    c2 = L.create_party("cccccccc", "couple", 2).code; L.join_party("dddddddd", c2); L.set_ready("dddddddd", True)
    L.set_plan("cccccccc", "shiva", 9.0)
    assert L.start("aaaaaaaa")[1].wid != L.start("cccccccc")[1].wid


def test_visible_radius_and_team():
    L = lobby_with("aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd")
    c1 = L.create_party("aaaaaaaa", "couple", 2).code; L.join_party("bbbbbbbb", c1); L.set_ready("bbbbbbbb", True)
    c2 = L.create_party("cccccccc", "couple", 2).code; L.join_party("dddddddd", c2); L.set_ready("dddddddd", True)
    L.start("aaaaaaaa"); L.start("cccccccc")
    L.set_pose("aaaaaaaa", 0, 2000, 0, 0, "Walk", 1, 0)
    L.set_pose("bbbbbbbb", 900, 2000, 0, 0, "Walk", 1, 0)   # teammate far away: still seen
    L.set_pose("cccccccc", 50, 2000, 0, 0, "Walk", 1, 0)    # stranger near: seen
    L.set_pose("dddddddd", 600, 2000, 0, 0, "Walk", 1, 0)   # stranger far: not seen
    assert {p.pid for p in L.visible("aaaaaaaa", 220)} == {"bbbbbbbb", "cccccccc"}


def test_bad_pose_ignored():
    L = lobby_with("aaaaaaaa")
    L.set_pose("aaaaaaaa", float("nan"), 0, 0, 0, "Walk", 1, 0)
    L.set_pose("aaaaaaaa", 1e9, 0, 0, 0, "Walk", 1, 0)
    assert L.players["aaaaaaaa"].pose is None


def test_host_leaves_next_becomes_host_and_empty_party_goes():
    L = lobby_with("aaaaaaaa", "bbbbbbbb")
    code = L.create_party("aaaaaaaa", "couple", 2).code
    L.join_party("bbbbbbbb", code)
    L.disconnect("aaaaaaaa")
    assert L.parties[code].host == "bbbbbbbb"
    L.leave_party("bbbbbbbb")
    assert code not in L.parties


def test_world_removed_when_empty():
    L = lobby_with("aaaaaaaa", "bbbbbbbb")
    code = L.create_party("aaaaaaaa", "couple", 2).code
    L.join_party("bbbbbbbb", code); L.set_ready("bbbbbbbb", True)
    _, w = L.start("aaaaaaaa")
    L.disconnect("aaaaaaaa"); L.disconnect("bbbbbbbb")
    assert w.wid not in L.worlds


def couple_in_world(extra=()):
    L = lobby_with("aaaaaaaa", "bbbbbbbb", *extra)
    code = L.create_party("aaaaaaaa", "couple", 2).code
    L.join_party("bbbbbbbb", code); L.set_ready("bbbbbbbb", True); L.start("aaaaaaaa")
    L.set_pose("aaaaaaaa", 0, 2000, 0, 0, "Idle", 1, 0); L.set_pose("bbbbbbbb", 1.2, 2000, 0, 0, "Idle", 1, 0)
    return L


def test_carry_needs_yes_then_links_both():
    L = couple_in_world()
    L.ask_link("aaaaaaaa", "bbbbbbbb", "carry")
    assert "aaaaaaaa" not in L.links                      # nothing until they say yes
    link = L.accept_link("bbbbbbbb", "aaaaaaaa")
    assert link.kind == "carry" and link.lead == "aaaaaaaa"
    assert L.link_view("aaaaaaaa") == {"kind": "carry", "with": "bbbbbbbb", "lead": True}
    assert L.link_view("bbbbbbbb") == {"kind": "carry", "with": "aaaaaaaa", "lead": False}
    with pytest.raises(LobbyError, match="Let go"):
        L.ask_link("bbbbbbbb", "aaaaaaaa", "hand")
    L.end_link("bbbbbbbb")
    assert L.links == {}


def test_link_only_with_team_and_close():
    L = couple_in_world(extra=("cccccccc",))
    with pytest.raises(LobbyError, match="group"):
        L.ask_link("aaaaaaaa", "cccccccc", "hand")
    L.set_pose("bbbbbbbb", 30, 2000, 0, 0, "Idle", 1, 0)
    with pytest.raises(LobbyError, match="next to"):
        L.ask_link("aaaaaaaa", "bbbbbbbb", "hand")
    with pytest.raises(LobbyError):
        L.ask_link("aaaaaaaa", "bbbbbbbb", "kiss")


def test_accept_only_what_was_asked():
    L = couple_in_world()
    with pytest.raises(LobbyError, match="Nobody"):
        L.accept_link("bbbbbbbb", "aaaaaaaa")
    L.ask_link("aaaaaaaa", "bbbbbbbb", "hand")
    with pytest.raises(LobbyError, match="Nobody"):
        L.accept_link("aaaaaaaa", "bbbbbbbb")                 # the asker cannot accept for the other


def test_leaving_ends_the_link():
    L = couple_in_world()
    L.ask_link("aaaaaaaa", "bbbbbbbb", "hand"); L.accept_link("bbbbbbbb", "aaaaaaaa")
    L.disconnect("aaaaaaaa")
    assert L.links == {} and L.link_view("bbbbbbbb") is None


def test_hello_again_updates_sex():
    L = Lobby()
    L.connect("aaaaaaaa", "Asha", "m")
    L.connect("aaaaaaaa", "Asha", "f")          # chose Female after connecting
    assert L.players["aaaaaaaa"].sex == "f"
