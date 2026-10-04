#!/usr/bin/env python3
"""
Webicro Distribution - Turkish String & i18n Scanner
Finds hardcoded Turkish UI strings across the TypeScript/TSX codebase and exports translation keys.
"""

import os
import sys
import re
import json
import argparse
from typing import List, Dict, Tuple, Set

TURKISH_CHARS = set('çğıöşüİĞŞÇÖÜ')

# Common Turkish words to detect even without Turkish characters
COMMON_TURKISH_WORDS = {
    've', 'ile', 'veya', 'icin', 'kadar', 'sonra', 'once', 'hata', 'basarili',
    'guncelle', 'kaydet', 'iptal', 'sil', 'yeni', 'proje', 'surum', 'yukle',
    'dagitim', 'calistir', 'bekliyor', 'tamamlandi', 'devam', 'durum', 'ayarlar'
}

def is_likely_turkish(text: str) -> bool:
    """Checks if a string is likely user-facing Turkish text."""
    text_clean = text.strip()
    if len(text_clean) < 2:
        return False
    
    # Has Turkish characters
    if any(c in TURKISH_CHARS for c in text_clean):
        return True
        
    # Contains common Turkish words
    words = re.findall(r'\b[a-zA-Z]+\b', text_clean.lower())
    match_count = sum(1 for w in words if w in COMMON_TURKISH_WORDS)
    if match_count >= 2:
        return True
        
    return False

def extract_strings_from_file(file_path: str) -> List[Tuple[int, str]]:
    """Extracts candidate string literals and JSX text from a file."""
    results = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"⚠️ Dosya okunamadı {file_path}: {e}")
        return []

    # Patterns for strings: '...', "...", `...`
    # Also ignore import statements, require, comments
    for line_idx, line in enumerate(lines, 1):
        line_stripped = line.strip()
        if line_stripped.startswith(('import ', 'export *', '//', '/*', '*')):
            continue
            
        # Match string literals
        matches = re.findall(r'([\'"`])([^\'\`"]{2,})\1', line)
        for _, match_str in matches:
            if is_likely_turkish(match_str):
                results.append((line_idx, match_str.strip()))
                
        # Match JSX text between tags: >Some text<
        jsx_matches = re.findall(r'>([^<>{}\n]+)<', line)
        for jsx_text in jsx_matches:
            if is_likely_turkish(jsx_text):
                results.append((line_idx, jsx_text.strip()))

    return results

def scan_codebase(directories: List[str]) -> Dict[str, List[Tuple[int, str]]]:
    """Scans target directories for files with Turkish strings."""
    found: Dict[str, List[Tuple[int, str]]] = {}
    extensions = {'.ts', '.tsx'}
    excluded_dirs = {'node_modules', 'dist', '.git', '.release'}
    
    for d in directories:
        if not os.path.exists(d):
            continue
        for root, dirs, files in os.walk(d):
            dirs[:] = [name for name in dirs if name not in excluded_dirs]
            for f in sorted(files):
                if any(f.endswith(ext) for ext in extensions):
                    file_path = os.path.join(root, f)
                    items = extract_strings_from_file(file_path)
                    if items:
                        found[file_path] = items
    return found

def main():
    parser = argparse.ArgumentParser(description="Find hardcoded Turkish strings for i18n.")
    parser.add_argument('--scan', action='store_true', help="Scan and list all detected Turkish strings.")
    parser.add_argument('--export-json', type=str, help="Export unique strings to JSON file.")
    parser.add_argument('--paths', nargs='+', default=['apps/web/src'], help="Directories to scan.")
    
    args = parser.parse_args()
    
    print(f"🔍 Taranan dizinler: {args.paths}")
    results = scan_codebase(args.paths)
    
    total_strings = sum(len(items) for items in results.values())
    unique_strings: Set[str] = set()
    for items in results.values():
        for _, text in items:
            unique_strings.add(text)
            
    print(f"📁 Bulunan dosya sayısı: {len(results)}")
    print(f"📝 Toplam Türkçe metin satırı: {total_strings}")
    print(f"🔤 Benzersiz metin adedi: {len(unique_strings)}")
    
    if args.scan:
        for file_path, items in results.items():
            print(f"\n📄 {file_path} ({len(items)} metin):")
            for line_no, text in items[:15]:
                print(f"   [Satır {line_no}]: {text}")
            if len(items) > 15:
                print(f"   ... ve {len(items) - 15} metin daha")
                
    if args.export_json:
        export_data = {
            "tr": {f"key_{i}": s for i, s in enumerate(sorted(unique_strings))},
            "en": {f"key_{i}": "" for i, s in enumerate(sorted(unique_strings))}
        }
        with open(args.export_json, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)
        print(f"\n💾 Benzersiz metinler {args.export_json} dosyasına aktarıldı!")

if __name__ == '__main__':
    main()
