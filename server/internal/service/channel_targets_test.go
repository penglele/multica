package service

import (
	"context"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// fakeChannelTargetQueries is a tiny in-memory stand-in for db.Queries used
// by ResolveChannelTargets. We don't pull in pgx — the function only needs
// four read methods.
type fakeChannelTargetQueries struct {
	channel       db.Channel
	channelErr    error
	turnsByThread map[[16]byte]int32
	memberIDs     []pgtype.UUID
	memberIDsErr  error
	agents        map[[16]byte]db.Agent
	agentErr      error
}

func (f *fakeChannelTargetQueries) GetChannel(ctx context.Context, id pgtype.UUID) (db.Channel, error) {
	if f.channelErr != nil {
		return db.Channel{}, f.channelErr
	}
	return f.channel, nil
}

func (f *fakeChannelTargetQueries) CountAgentTurnsInThread(ctx context.Context, id pgtype.UUID) (int32, error) {
	return f.turnsByThread[id.Bytes], nil
}

func (f *fakeChannelTargetQueries) ListChannelAgentMembers(ctx context.Context, channelID pgtype.UUID) ([]pgtype.UUID, error) {
	return f.memberIDs, f.memberIDsErr
}

func (f *fakeChannelTargetQueries) GetAgent(ctx context.Context, id pgtype.UUID) (db.Agent, error) {
	if f.agentErr != nil {
		return db.Agent{}, f.agentErr
	}
	return f.agents[id.Bytes], nil
}

// uuidFromHex builds a pgtype.UUID from a 32-char hex string. Lets each
// test name agents readably ("aaaa...") without sprinkling .Scan calls.
func uuidFromHex(hex string) pgtype.UUID {
	var u pgtype.UUID
	if err := u.Scan(hex[:8] + "-" + hex[8:12] + "-" + hex[12:16] + "-" + hex[16:20] + "-" + hex[20:]); err != nil {
		panic(err)
	}
	return u
}

// makeAgent builds a non-archived, runtime-bound db.Agent.
func makeAgent(id pgtype.UUID, name string) db.Agent {
	return db.Agent{
		ID:        id,
		Name:      name,
		RuntimeID: pgtype.UUID{Bytes: [16]byte{1}, Valid: true}, // any non-zero
	}
}

// makeRoster builds a fakeChannelTargetQueries with two agents (boncml, qianwen).
func makeRoster(ch db.Channel) *fakeChannelTargetQueries {
	idA := uuidFromHex("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	idB := uuidFromHex("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
	return &fakeChannelTargetQueries{
		channel:   ch,
		memberIDs: []pgtype.UUID{idA, idB},
		agents: map[[16]byte]db.Agent{
			idA.Bytes: makeAgent(idA, "BONCML"),
			idB.Bytes: makeAgent(idB, "千问"),
		},
	}
}

func makeChannel(autoReply bool, strategy string, defaultTarget pgtype.UUID) db.Channel {
	ch := db.Channel{
		ID:                  uuidFromHex("11111111111111111111111111111111"),
		AutoReply:           autoReply,
		AutoReplyStrategy:   strategy,
		MaxAgentTurns:       20,
	}
	if defaultTarget.Valid {
		ch.DefaultTargetID = defaultTarget
	}
	return ch
}

func makeMessage(content string, threadParent pgtype.UUID) db.ChannelMessage {
	return db.ChannelMessage{
		ID:             uuidFromHex("22222222222222222222222222222222"),
		ChannelID:      uuidFromHex("11111111111111111111111111111111"),
		SenderType:     "human",
		Content:        content,
		ThreadParentID: threadParent,
	}
}

func mustStr(s *string) *string { return s }
func strPtr(s string) *string   { return &s }

// --------------------------------------------------------------------
// Tests cover the 7 documented paths in B2.
// --------------------------------------------------------------------

func TestResolveChannelTargets_NoneMode(t *testing.T) {
	q := makeRoster(makeChannel(true, "all_agents", pgtype.UUID{}))
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID:   q.channel.ID,
		Message:     makeMessage("hi", pgtype.UUID{}),
		TriggerMode: strPtr("none"),
	})
	if len(got) != 0 {
		t.Fatalf("trigger_mode=none must produce no targets, got %v", got)
	}
}

func TestResolveChannelTargets_ManualMode_OnlyMembers(t *testing.T) {
	q := makeRoster(makeChannel(false, "all_agents", pgtype.UUID{}))
	idA := uuidFromHex("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	idStranger := uuidFromHex("ccccccccccccccccccccccccccccc111")
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID: q.channel.ID,
		Message:   makeMessage("hi", pgtype.UUID{}),
		TriggerMode: strPtr("manual"),
		Targets: []ChannelTargetSpec{
			{Kind: "agent", ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}, // member
			{Kind: "agent", ID: "cccccccc-cccc-cccc-cccc-ccccccccc111"}, // not a member — must be filtered out
			{Kind: "squad", ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}, // wrong kind — must be filtered out
		},
	})
	if len(got) != 1 || got[0].ID != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" {
		t.Fatalf("manual mode must keep only the member agent target, got %+v", got)
	}
	_ = idA
	_ = idStranger
}

func TestResolveChannelTargets_AutoMode_AllAgents(t *testing.T) {
	q := makeRoster(makeChannel(true, "all_agents", pgtype.UUID{}))
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID:   q.channel.ID,
		Message:     makeMessage("hi", pgtype.UUID{}),
		TriggerMode: strPtr("auto"),
	})
	if len(got) != 2 {
		t.Fatalf("auto/all_agents must return both members, got %v", got)
	}
}

func TestResolveChannelTargets_AutoMode_DefaultAgent(t *testing.T) {
	defaultID := uuidFromHex("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	q := makeRoster(makeChannel(true, "default_agent", defaultID))
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID:   q.channel.ID,
		Message:     makeMessage("hi", pgtype.UUID{}),
		TriggerMode: strPtr("auto"),
	})
	if len(got) != 1 || got[0].ID != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" {
		t.Fatalf("auto/default_agent must return only the default agent, got %+v", got)
	}
}

func TestResolveChannelTargets_AutoMode_DefaultAgent_NotMember(t *testing.T) {
	stranger := uuidFromHex("ccccccccccccccccccccccccccccc111")
	q := makeRoster(makeChannel(true, "default_agent", stranger))
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID:   q.channel.ID,
		Message:     makeMessage("hi", pgtype.UUID{}),
		TriggerMode: strPtr("auto"),
	})
	if len(got) != 0 {
		t.Fatalf("default_agent must be empty when the configured agent is not a current channel member, got %+v", got)
	}
}

// Legacy fallback paths (TriggerMode == nil) — kept for old clients.

func TestResolveChannelTargets_Legacy_AtMention(t *testing.T) {
	q := makeRoster(makeChannel(false, "all_agents", pgtype.UUID{}))
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID: q.channel.ID,
		Message:   makeMessage("hey @千问 take a look", pgtype.UUID{}),
	})
	if len(got) != 1 || got[0].Name != "千问" {
		t.Fatalf("legacy @mention must trigger only the mentioned agent, got %+v", got)
	}
}

func TestResolveChannelTargets_Legacy_AutoReplyOn(t *testing.T) {
	q := makeRoster(makeChannel(true, "all_agents", pgtype.UUID{}))
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID: q.channel.ID,
		Message:   makeMessage("no mention", pgtype.UUID{}),
	})
	if len(got) != 2 {
		t.Fatalf("legacy auto_reply must trigger all agents, got %+v", got)
	}
}

func TestResolveChannelTargets_Legacy_AutoReplyOff_NoMention(t *testing.T) {
	q := makeRoster(makeChannel(false, "all_agents", pgtype.UUID{}))
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID: q.channel.ID,
		Message:   makeMessage("no mention", pgtype.UUID{}),
	})
	if len(got) != 0 {
		t.Fatalf("legacy off + no mention must trigger nobody, got %+v", got)
	}
}

func TestResolveChannelTargets_LoopGuard(t *testing.T) {
	q := makeRoster(makeChannel(true, "all_agents", pgtype.UUID{}))
	q.channel.MaxAgentTurns = 3
	threadID := uuidFromHex("33333333333333333333333333333333")
	q.turnsByThread = map[[16]byte]int32{threadID.Bytes: 5}
	msg := makeMessage("hi", threadID) // ThreadParentID is the thread root
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID:   q.channel.ID,
		Message:     msg,
		TriggerMode: strPtr("auto"),
	})
	if len(got) != 0 {
		t.Fatalf("loop guard must return empty when turn count exceeds max, got %+v", got)
	}
}

// Extra guard: archived agents are excluded.
func TestResolveChannelTargets_ArchivedAgentExcluded(t *testing.T) {
	q := makeRoster(makeChannel(true, "all_agents", pgtype.UUID{}))
	idA := uuidFromHex("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	archived := q.agents[idA.Bytes]
	archived.ArchivedAt = pgtype.Timestamptz{Valid: true}
	q.agents[idA.Bytes] = archived
	got := ResolveChannelTargets(context.Background(), q, ResolveChannelTargetsInput{
		ChannelID:   q.channel.ID,
		Message:     makeMessage("hi", pgtype.UUID{}),
		TriggerMode: strPtr("auto"),
	})
	if len(got) != 1 || got[0].Name != "千问" {
		t.Fatalf("archived agent must be filtered out, got %+v", got)
	}
}

// ---------------------------------------------------------------------------
// parseMentionsFromContent — ported from the old handler-side tests.
// We exercise the function directly (rather than via the public Resolve path)
// so each unicode/markdown/longest-match case stays tightly scoped.
// ---------------------------------------------------------------------------

// makeRosterFromNames builds a channelAgentRoster with one agent per name.
// Agent ids are derived from the index so byID lookups are stable across runs.
func makeRosterFromNames(names []string) channelAgentRoster {
	r := channelAgentRoster{
		byID:    make(map[string]channelAgentRow, len(names)),
		byName:  make(map[string]channelAgentRow, len(names)),
		ordered: make([]channelAgentRow, 0, len(names)),
	}
	for i, name := range names {
		// 32-char hex string seeded with i so each agent has a distinct id.
		hex := ""
		for len(hex) < 32 {
			hex += string(rune('a' + (i % 26)))
		}
		id := uuidFromHex(hex[:32])
		row := channelAgentRow{id: id, name: name}
		r.ordered = append(r.ordered, row)
		r.byName[lower(name)] = row
	}
	return r
}

// lower is a tiny helper to avoid importing strings in test code where we
// only need it once per fixture.
func lower(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r >= 'A' && r <= 'Z' {
			r = r + 32
		}
		out = append(out, r)
	}
	return string(out)
}

func mentionedNames(targets []ChannelMessageTarget) []string {
	out := make([]string, 0, len(targets))
	for _, t := range targets {
		out = append(out, t.Name)
	}
	return out
}

func TestParseMentionsFromContent_SupportsUnicodeAndSpaces(t *testing.T) {
	roster := makeRosterFromNames([]string{"开发代理", "Agent Alpha"})
	got := mentionedNames(parseMentionsFromContent(
		"请 @开发代理 看下这个问题，再让 @Agent Alpha 跟进。",
		roster,
	))
	want := []string{"开发代理", "Agent Alpha"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestParseMentionsFromContent_SupportsMarkdownMentionSyntax(t *testing.T) {
	roster := makeRosterFromNames([]string{"Reviewer Bot"})
	got := mentionedNames(parseMentionsFromContent(
		"交给 [@Reviewer Bot](mention://agent/123) 继续处理。",
		roster,
	))
	want := []string{"Reviewer Bot"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestParseMentionsFromContent_PrefersLongestAgentName(t *testing.T) {
	// Order in roster shouldn't matter — the parser must prefer the longest
	// match regardless of insertion order. We test both orderings.
	for _, order := range [][]string{
		{"Agent", "Agent Alpha"},
		{"Agent Alpha", "Agent"},
	} {
		roster := makeRosterFromNames(order)
		got := mentionedNames(parseMentionsFromContent(
			"@Agent Alpha please take it from here.",
			roster,
		))
		want := []string{"Agent Alpha"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("order=%v: expected %v, got %v", order, want, got)
		}
	}
}
