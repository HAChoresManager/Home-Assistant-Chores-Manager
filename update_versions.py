#!/usr/bin/env python3
import os
import re
import datetime
import subprocess
from pathlib import Path

# Get current date in YYYYMMDD format
today = datetime.datetime.now().strftime('%Y%m%d')

# Get short commit hash 
short_hash = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD']).decode('utf-8').strip()

# Version string to use (date + commit hash)
version_string = f"{today}-{short_hash}"
print(f"Using version string: {version_string}")

# Files to update and their patterns
FILES_TO_UPDATE = [
    {
        'path': 'custom_components/chores_manager/www/chores-dashboard/index.html',
        'patterns': [
            # Fixed regex patterns that properly capture and replace
            (r'href="([^"]+)\?v=[^"]+"', f'href="\\1?v={version_string}"'),
            (r'src="([^"]+)\?v=[^"]+"', f'src="\\1?v={version_string}"'),
            # Fixed CHORES_APP_VERSION pattern to keep the variable name
            (r'(CHORES_APP_VERSION = )"([^"]+)"', f'\\1"1.3.0-{version_string}"')
        ]
    },
    {
        'path': 'custom_components/chores_manager/panel.py',
        'patterns': [
            # Fixed regex pattern for panel.py
            (r'js_url="([^"]+)\?v=[^"]+"', f'js_url="\\1?v={version_string}"')
        ]
    }
]

def update_file(file_path, patterns):
    path = Path(file_path)
    if not path.exists():
        print(f"File not found: {file_path}")
        return False
        
    content = path.read_text()
    original_content = content
    
    for pattern, replacement in patterns:
        print(f"Applying pattern: {pattern}")
        # Print matched substrings for debugging
        matches = re.findall(pattern, content)
        print(f"  Found {len(matches)} matches: {matches[:3]}")
        
        content = re.sub(pattern, replacement, content)
    
    if content != original_content:
        # Show the differences
        for i, (orig_line, new_line) in enumerate(zip(original_content.splitlines(), content.splitlines())):
            if orig_line != new_line:
                print(f"Line {i+1} changed from: {orig_line}")
                print(f"Line {i+1} changed to:   {new_line}")
        
        path.write_text(content)
        print(f"Updated: {file_path}")
        return True
    
    print(f"No changes needed: {file_path}")
    return False

def main():
    updated = False
    
    for file_info in FILES_TO_UPDATE:
        file_updated = update_file(file_info['path'], file_info['patterns'])
        updated = updated or file_updated
    
    if updated:
        print(f"Version numbers updated to {version_string}")
        # Create a file to signal success
        with open("version_updated.txt", "w") as f:
            f.write(f"Version updated to {version_string}")
        return 0
    else:
        print("No version numbers needed updating")
        return 1

if __name__ == "__main__":
    exit(main())
