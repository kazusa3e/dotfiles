os := $(shell uname -s)
tmux_plugin_dir := ~/.tmux/plugins

# app := zsh vim tmux starship git clangd lazygit alacritty yazi npm claude ccstatusline opencode
app := zsh vim tmux starship git npm

ifeq ($(os),Darwin)
	app += karabiner hammerspoon wezterm
endif

.PHONY: none
none:
	@echo "Usage: make <target>"

.PHONY: install
install:
	stow -t ~ $(app)

	mkdir -p $(tmux_plugin_dir)
	[ -d $(tmux_plugin_dir)/catppuccin ] || git clone --depth 1 https://github.com/catppuccin/tmux.git $(tmux_plugin_dir)/catppuccin
	[ -d $(tmux_plugin_dir)/tmux-resurrect ] || git clone --depth 1 https://github.com/tmux-plugins/tmux-resurrect.git $(tmux_plugin_dir)/tmux-resurrect
	[ -d $(tmux_plugin_dir)/tmux-continuum ] || git clone --depth 1 https://github.com/tmux-plugins/tmux-continuum.git $(tmux_plugin_dir)/tmux-continuum

	-fd . bin/ -0 | xargs -I{} --null sh -c 'ln -s "$$(pwd)/{}" "$$HOME/.local/bin/$$(basename {})"'

	if [ "$(os)" = "Darwin" ]; then \
		goku; \
	fi


.PHONY: uninstall
uninstall:
	stow -t ~ --delete $(app)

	-rm -rf $(tmux_plugin_dir)
	-fd . bin/ -0 | xargs -I{} --null sh -c 'rm "$$HOME/.local/bin/$$(basename {})"'
