IMAGE ?= pid
DOCKER ?= podman
USER_NAME ?= kazusa
USER_UID ?= $(shell id -u)
USER_GID ?= $(shell id -g)
NIX_VERSION ?= 2.34.8
NIXPKGS_CHANNEL ?= 26.05
NIXPKGS_UNSTABLE_CHANNEL ?= unstable
PID_NIX_VOLUME ?= pid-nix
CHANNEL ?=
GENERATION ?=

.PHONY: none
none:
	@echo "Usage: make install | update [CHANNEL=nixpkgs|unstable] | rollback [GENERATION=N] | uninstall"
	@echo "Maintenance uses IMAGE=$(IMAGE), DOCKER=$(DOCKER), PID_NIX_VOLUME=$(PID_NIX_VOLUME)"

.PHONY: install
install:
	$(DOCKER) build \
		--build-arg USER_NAME=$(USER_NAME) \
		--build-arg USER_UID=$(USER_UID) \
		--build-arg USER_GID=$(USER_GID) \
		--build-arg NIX_VERSION=$(NIX_VERSION) \
		--build-arg NIXPKGS_CHANNEL=$(NIXPKGS_CHANNEL) \
		--build-arg NIXPKGS_UNSTABLE_CHANNEL=$(NIXPKGS_UNSTABLE_CHANNEL) \
		-t $(IMAGE) -f pid.Dockerfile .

.PHONY: uninstall
uninstall:
	$(DOCKER) rmi $(IMAGE)

.PHONY: update rollback
update rollback:
	@case "$(CHANNEL)" in ''|nixpkgs|unstable) ;; *) echo "Invalid CHANNEL: use nixpkgs or unstable" >&2; exit 2;; esac
	@case "$(GENERATION)" in *[!0-9]*|0) echo "GENERATION must be a positive integer" >&2; exit 2;; esac
	@test "$@" != rollback || test -z "$(CHANNEL)" || { echo "Rollback restores a whole generation; do not set CHANNEL" >&2; exit 2; }
	@test "$@" != update || test -z "$(GENERATION)" || { echo "GENERATION is only supported by rollback" >&2; exit 2; }
	@test -n "$(PID_NIX_VOLUME)" || { echo "PID_NIX_VOLUME must not be empty for maintenance" >&2; exit 2; }
	@test "$(USER_UID)" != 0 || { echo "Maintenance requires the image's non-root runtime UID" >&2; exit 2; }
	@$(DOCKER) image inspect "$(IMAGE)" >/dev/null
	$(DOCKER) run --rm \
		$(if $(filter podman,$(notdir $(DOCKER))),--userns=keep-id) \
		--user "$(USER_UID):$(USER_GID)" \
		--volume "$(PID_NIX_VOLUME):/nix" \
		--workdir /workspace \
		--entrypoint /bin/sh \
		--env PID_ACTION="$@" \
		--env PID_CHANNEL="$(CHANNEL)" \
		--env PID_GENERATION="$(GENERATION)" \
		"$(IMAGE)" -eu -c ' \
			test -f /etc/pid/nix-state.sh || { echo "pid: rebuild the image before running maintenance" >&2; exit 1; }; \
			. /etc/pid/nix-state.sh; \
			pid_nix_lock; \
			pid_nix_init; \
			case "$$PID_ACTION" in \
				update) \
					set --; \
					if [ -n "$$PID_CHANNEL" ]; then set -- "$$PID_CHANNEL"; fi; \
					pid_channel --update "$$@" --option tarball-ttl 0 ;; \
				rollback) \
					set --; \
					if [ -n "$$PID_GENERATION" ]; then set -- "$$PID_GENERATION"; fi; \
					pid_channel --rollback "$$@" ;; \
			esac; \
			if ! nix-shell /etc/pid/pid-shell.nix --run "exit 0"; then \
				echo "pid: base shell validation failed; the channel profile has changed. Use make rollback to recover." >&2; \
				exit 1; \
			fi; \
			echo "pid: maintenance complete; restart existing sessions to use the selected packages"; \
		'
