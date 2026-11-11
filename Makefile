PYTHON ?= python3

.PHONY: validate test integration build zip clean
validate:
	$(PYTHON) tools.py validate

test: validate
	gjs -m tests/lifecycle.js
	$(PYTHON) tools.py test-settings

build: test
	$(PYTHON) tools.py build

zip: build
	$(PYTHON) tools.py zip

integration: build
	/usr/bin/python3 tests/headless.py

clean:
	$(PYTHON) tools.py clean
