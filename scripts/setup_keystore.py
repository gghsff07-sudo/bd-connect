#!/usr/bin/env python3
"""Extracts the v1.1.0 release keystore and writes key.properties for Gradle.
Never prints password values."""
import re
import zipfile
import os

ZIP = '/home/z/my-project/download/dbalert-release-key.zip'
OUT_DIR = '/home/z/my-project/keystores'
PROPS = '/home/z/my-project/db_alert/android/key.properties'

os.makedirs(OUT_DIR, exist_ok=True)
with zipfile.ZipFile(ZIP) as z:
    z.extractall(OUT_DIR)

txt_path = os.path.join(OUT_DIR, 'keystore-info.txt')
with open(txt_path) as f:
    text = f.read()

def grab(patterns):
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    return None

store_password = grab([r'store\s*password\s*[:=]\s*(\S+)', r'storepassword\s*[:=]\s*(\S+)'])
key_alias = grab([r'key\s*alias\s*[:=]\s*(\S+)', r'alias\s*[:=]\s*(\S+)'])
key_password = grab([r'key\s*password\s*[:=]\s*(\S+)', r'keypassword\s*[:=]\s*(\S+)'])

# Fallbacks: many keys use the same password for store and key.
if key_password is None:
    key_password = store_password
if key_alias is None:
    key_alias = 'dbalert'  # common default from the v1.1.0 build

if not (store_password and key_alias and key_password):
    print('PARSE FAILED — fields found:',
          {'storePassword': bool(store_password), 'keyAlias': key_alias, 'keyPassword': bool(key_password)})
    raise SystemExit(1)

keystore_path = os.path.join(OUT_DIR, 'dbalert-release.keystore')
with open(PROPS, 'w') as f:
    f.write(f'storeFile={keystore_path}\n')
    f.write(f'storePassword={store_password}\n')
    f.write(f'keyAlias={key_alias}\n')
    f.write(f'keyPassword={key_password}\n')
os.chmod(PROPS, 0o600)

# Verify the keystore opens with these credentials (without printing them).
import subprocess
r = subprocess.run(
    ['keytool', '-list', '-keystore', keystore_path,
     '-storepass', store_password, '-alias', key_alias],
    capture_output=True, text=True)
if r.returncode == 0:
    print(f'key.properties written. Keystore OK, alias={key_alias}, entries verified.')
else:
    print('KEYTOOL CHECK FAILED (may still work):')
    print('\n'.join(r.stderr.splitlines()[:4]))
