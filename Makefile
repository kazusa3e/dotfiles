os := $(shell uname -s)

is_wsl := no
ifeq ($(os),Linux)
	is_wsl = $(shell uname -a | grep -q 'WSL' && echo yes || echo no)
endif

# TODO: git global ignore files
app := zsh vim tmux starship git clang lazygit alacritty

# TODO: scoop app lists

ifeq ($(os),Darwin)
	app += karabiner idea hammerspoon brew
endif

windows_user := 
ifeq ($(is_wsl),yes)
	windows_user := $(shell powershell.exe -NoProfile -NonInteractive -Command "\$$Env:UserName" | sed 's/\r//g')
endif

.PHONY: install
install:
	stow -t ~ $(app)

	if [ "$(is_wsl)" = "yes" ]; then \
		mkdir -p "/mnt/c/Users/$(windows_user)/Documents/AutoHotkey"; \
		cp autohotkey/keybindings.ahk "/mnt/c/Users/$(windows_user)/Documents/AutoHotkey/"; \
	fi

	if [ "$(os)" = "Darwin" ]; then \
		goku; \
	fi

.PHONY: uninstall
uninstall:
	stow -t ~ --delete $(app)

	if [ "$(is_wsl)" = "yes" ]; then \
		rm "/mnt/c/Users/$(windows_user)/Documents/AutoHotkey/keybindings.ahk"; \
	fi
