#!/usr/bin/env bash
# SerenEdge SessionStart probe (A-083). Prints context for the agent, or
# nothing at all. Never exits non-zero: a broken probe must not block a
# session. Uses --offline so session start makes no network request.
set -u

command -v serenedge >/dev/null 2>&1 || exit 0

STATUS="$(serenedge status --json --offline 2>/dev/null)" || exit 0
[ -n "$STATUS" ] || exit 0

state="$(printf '%s' "$STATUS" | sed -n 's/.*"state":"\([a-z_]*\)".*/\1/p')"
project="$(printf '%s' "$STATUS" | sed -n 's/.*"project":"\([^"]*\)".*/\1/p')"
url="$(printf '%s' "$STATUS" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')"

case "$state" in
  not_signed_in)
    echo "SerenEdge: this machine is not signed in. If the user wants to work on a"
    echo "SerenEdge task, run the /serenedge setup flow: it logs in via the browser,"
    echo "registers the MCP server, and maps this repo to a project. Do not run it"
    echo "unprompted if the user is doing unrelated work."
    ;;
  token_rejected)
    echo "SerenEdge: the stored token was rejected by ${url}. Tell the user to run"
    echo "\`serenedge login\` again. SerenEdge MCP tools will fail until then."
    ;;
  unreachable)
    echo "SerenEdge: ${url} is unreachable from this machine. SerenEdge MCP tools"
    echo "will fail until it is back. Do not retry in a loop."
    ;;
  no_project)
    echo "SerenEdge: signed in, but this repo is not mapped to a project. If the user"
    echo "wants to work a SerenEdge task here, call list_my_projects, show them the"
    echo "options, and call switch_project with the one they pick."
    ;;
  ready)
    echo "SerenEdge: signed in, current project \`${project}\`. /serenedge commands and"
    echo "MCP tools are scoped to it. Switch with /serenedge project."
    ;;
esac
exit 0
