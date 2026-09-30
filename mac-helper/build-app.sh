#!/bin/bash
# Builds Orbit Helper as a real .app (menu bar apps need a bundle for permissions and Open at login).
# Usage: ./build-app.sh            ad hoc signed, fine for your own Mac
#        SIGN_IDENTITY="Developer ID Application: ..." ./build-app.sh   if you have a certificate
set -euo pipefail
cd "$(dirname "$0")"

swift build -c release --arch arm64
BIN_DIR="$(swift build -c release --arch arm64 --show-bin-path)"
APP="build/OrbitHelper.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/OrbitHelper" "$APP/Contents/MacOS/OrbitHelper"
cp Resources/Info.plist "$APP/Contents/Info.plist"
# Resource bundles of dependencies (tokenizer files and the like) go where Bundle.main can find them.
for bundle in "$BIN_DIR"/*.bundle; do
  [ -e "$bundle" ] && cp -R "$bundle" "$APP/Contents/Resources/"
done

codesign --force --options runtime --entitlements Resources/OrbitHelper.entitlements --sign "${SIGN_IDENTITY:--}" "$APP"
codesign --verify --verbose "$APP"
echo "Built $APP"
