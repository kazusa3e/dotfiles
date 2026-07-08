IMAGE ?= pid
DOCKER ?= podman

.PHONY: none
none:
	@echo "Usage: make <target>"

.PHONY: install
install:
# 	$(DOCKER) build --network=host -t $(IMAGE) - < pid.Dockerfile
	$(DOCKER) build -t $(IMAGE) - < pid.Dockerfile

.PHONY: uninstall
uninstall:
	$(DOCKER) rmi $(IMAGE)
