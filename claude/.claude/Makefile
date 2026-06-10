.PHONY: none
none:
	@echo "Usage: make <target>"

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
	claude mcp add-json --scope user tavily "$$(cat $(CURDIR)/mcp.json)"
