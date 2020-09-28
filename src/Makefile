# Makefile

EXT_VER=`./getver.pl`
DIST_FILE=clippings-tb-$(EXT_VER).xpi
CHROME = ./chrome
MODULES = ./modules
MODULE_FILES = $(MODULES)/*.js
DEFAULTS_PREFS = ./defaults/preferences
EXCLUDE = \*~ \*.psp \*.bak


$(DIST_FILE):
	cp -v ../LICENSE.txt $(CHROME)/content/
	zip -r $(DIST_FILE) * -x $(EXCLUDE)

clean:
	rm -fv $(DIST_FILE)
	rm -fv $(CHROME)/content/LICENSE.txt

# End of Makefile
