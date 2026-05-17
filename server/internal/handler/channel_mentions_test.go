package handler

import (
	"reflect"
	"testing"
)

func TestParseMentionedNamesSupportsUnicodeAndSpaces(t *testing.T) {
	got := parseMentionedNames(
		"请 @开发代理 看下这个问题，再让 @Agent Alpha 跟进。",
		[]string{"开发代理", "Agent Alpha"},
	)

	want := []string{"开发代理", "Agent Alpha"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestParseMentionedNamesSupportsMarkdownMentionSyntax(t *testing.T) {
	got := parseMentionedNames(
		"交给 [@Reviewer Bot](mention://agent/123) 继续处理。",
		[]string{"Reviewer Bot"},
	)

	want := []string{"Reviewer Bot"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestParseMentionedNamesPrefersLongestAgentName(t *testing.T) {
	got := parseMentionedNames(
		"@Agent Alpha please take it from here.",
		[]string{"Agent", "Agent Alpha"},
	)

	want := []string{"Agent Alpha"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}
