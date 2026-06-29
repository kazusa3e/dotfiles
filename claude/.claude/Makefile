.PHONY: none
none:
	@echo "Usage: make <target>"

.PHONY: install
install:
	claude mcp add-json --scope user tavily "$$(jq -c .tavily $(CURDIR)/mcp.json)"
	claude mcp add-json --scope user duckduckgo "$$(jq -c .duckduckgo $(CURDIR)/mcp.json)"

.PHONY: clean
clean:
	$(RM) -rf cache/ \
		file-history/ \
		paste-cache/ \
		session-env/ \
		sessions/ \
		shell-snapshots/ \
		tasks/

.PHONY: prune
prune: clean
	$(RM) -rf plans/ \
		projects/ \
		backups/ \
		telemetry/ \
		history.jsonl \
		$(HOME)/.claude.json

