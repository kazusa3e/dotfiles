os := $(shell uname -s)

ifeq ($(os),Darwin)
	app := zsh tmux git starship vim gh hammerspoon karabiner idea lunarvim clang lazygit
endif

ifeq ($(os),Linux)
	app := zsh tmux git starship vim gh idea lunarvim clang lazygit
endif

.PHONY: install
install:
	stow -t ~ $(app)
	if [ "$(os)" = "Darwin" ]; then \
		ln -s "$(PWD)/lazygit/.config/lazygit/config.yml" "$(HOME)/Library/Application Support/lazygit/config.yml"; \
	fi
	if [ "$(os)" = "Darwin" ]; then \
		goku \
	fi

.PHONY: uninstall
uninstall:
	stow -t ~ --delete $(app)
	if [ "$(os)" = "Darwin" ]; then \
		rm "$(HOME)/Library/Application Support/lazygit/config.yml"; \
	fi
