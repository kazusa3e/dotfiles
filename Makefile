os := $(shell uname -s)
tmux_plugin_dir := ~/.tmux/plugins
# app := zsh vim tmux starship git clangd lazygit alacritty yazi npm claude ccstatusline opencode
app := zsh vim tmux starship git npm pi opencode lazygit yazi direnv
binaries := pid repostatus todo

ifeq ($(os),Darwin)
	app += karabiner hammerspoon wezterm
endif

.PHONY: none
none:
	@echo "Usage: make <target>"

.PHONY: agent-config
agent-config:
	@python3 scripts/json-merge.py pi/settings.base.json "$(HOME)/.pi/agent/settings.json"
	@python3 scripts/json-merge.py opencode/opencode.base.json "$(HOME)/.config/opencode/opencode.jsonc"
	@python3 scripts/json-merge.py opencode/cli.base.json "$(HOME)/.config/opencode/cli.json"

.PHONY: install
install:
	mkdir -p $(tmux_plugin_dir)
	stow -t ~ $(app)

	$(MAKE) agent-config

	[ -d $(tmux_plugin_dir)/tmux-resurrect ] || git clone --depth 1 https://github.com/tmux-plugins/tmux-resurrect.git $(tmux_plugin_dir)/tmux-resurrect
	[ -d $(tmux_plugin_dir)/tmux-continuum ] || git clone --depth 1 https://github.com/tmux-plugins/tmux-continuum.git $(tmux_plugin_dir)/tmux-continuum

	mkdir -p ~/.local/bin
	for binary in $(binaries); do \
		test -f "bin/$$binary" || { echo "Unknown binary: $$binary" >&2; exit 1; }; \
		ln -sfn "$(CURDIR)/bin/$$binary" "$$HOME/.local/bin/$$binary"; \
	done

	if [ "$(os)" = "Darwin" ]; then \
		goku; \
	fi


.PHONY: uninstall
uninstall:
	stow -t ~ --delete $(app)

	-$(RM) -r $(tmux_plugin_dir)
	for binary in $(binaries); do \
		$(RM) "$$HOME/.local/bin/$$binary"; \
	done
