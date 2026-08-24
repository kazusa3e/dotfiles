IMAGE ?= pid
DOCKER ?= podman
USER_NAME ?= kazusa
USER_UID ?= $(shell id -u)
USER_GID ?= $(shell id -g)
NIX_VERSION ?= 2.34.8
NIXPKGS_CHANNEL ?= 26.05
NIXPKGS_UNSTABLE_CHANNEL ?= unstable

.PHONY: none
none:
	@echo "Usage: make <target>"

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
