#!/usr/bin/env python3
"""
Webicro Distribution - Comment Finder & Stripper
Scans and safely strips single-line and multi-line comments from TypeScript/TSX/JavaScript files
without corrupting string literals, template strings, regexes, or shebang lines.
"""

import os
import sys
import argparse
from typing import List, Tuple

def tokenize_and_strip(content: str) -> Tuple[str, List[Tuple[int, str, str]]]:
    """
    Parses JavaScript/TypeScript code and returns:
    1. cleaned_content (without comments)
    2. list of found comments: (line_number, comment_type, comment_text)
    """
    length = len(content)
    i = 0
    line_number = 1
    
    output = []
    found_comments = []
    
    # States
    NORMAL = 0
    IN_SINGLE_QUOTE = 1
    IN_DOUBLE_QUOTE = 2
    IN_TEMPLATE = 3
    IN_REGEX = 4
    
    state = NORMAL
    template_stack = [] # Tracks nested template brace depths
    
    # Track recent tokens to distinguish regex vs division
    last_token = ''
    current_token = []
    
    # Handle shebang at the very beginning
    if content.startswith('#!'):
        shebang_end = content.find('\n')
        if shebang_end == -1:
            return content, []
        output.append(content[:shebang_end + 1])
        i = shebang_end + 1
        line_number += 1
        last_token = '\n'

    while i < length:
        ch = content[i]
        next_ch = content[i + 1] if i + 1 < length else ''
        
        if ch == '\n':
            line_number += 1

        if state == NORMAL:
            # Check for comments
            if ch == '/' and next_ch == '/':
                # Single line comment
                comment_start = i
                comment_line = line_number
                i += 2
                while i < length and content[i] != '\n':
                    i += 1
                comment_text = content[comment_start:i]
                found_comments.append((comment_line, 'line', comment_text.strip()))
                # Preserve newline
                if i < length and content[i] == '\n':
                    output.append('\n')
                    line_number += 1
                    i += 1
                current_token = []
                continue
                
            elif ch == '/' and next_ch == '*':
                # Multi line comment
                comment_start = i
                comment_line = line_number
                i += 2
                while i < length and not (content[i] == '*' and i + 1 < length and content[i + 1] == '/'):
                    if content[i] == '\n':
                        line_number += 1
                    i += 1
                if i < length:
                    i += 2 # Skip */
                comment_text = content[comment_start:i]
                found_comments.append((comment_line, 'block', comment_text.strip()))
                output.append(' ')
                current_token = []
                continue
                
            elif ch == "'":
                state = IN_SINGLE_QUOTE
                output.append(ch)
                i += 1
                last_token = "'"
                current_token = []
                continue
                
            elif ch == '"':
                state = IN_DOUBLE_QUOTE
                output.append(ch)
                i += 1
                last_token = '"'
                current_token = []
                continue
                
            elif ch == '`':
                state = IN_TEMPLATE
                output.append(ch)
                i += 1
                last_token = '`'
                current_token = []
                continue
                
            elif ch == '{':
                if template_stack:
                    template_stack[-1] += 1
                output.append(ch)
                last_token = '{'
                current_token = []
                i += 1
                continue
                
            elif ch == '}':
                if template_stack:
                    template_stack[-1] -= 1
                    if template_stack[-1] == 0:
                        template_stack.pop()
                        state = IN_TEMPLATE
                        output.append(ch)
                        last_token = '}'
                        current_token = []
                        i += 1
                        continue
                output.append(ch)
                last_token = '}'
                current_token = []
                i += 1
                continue
                
            elif ch == '/':
                # 1. JSX self-closing tag: '/>' -> Never regex
                if next_ch == '>':
                    output.append(ch)
                    last_token = '/'
                    current_token = []
                    i += 1
                    continue
                
                # 2. JSX closing tag: '</' -> Never regex
                word = "".join(current_token).strip()
                prev = word if word else last_token
                if prev == '<':
                    output.append(ch)
                    last_token = '/'
                    current_token = []
                    i += 1
                    continue

                # 3. Determine if '/' starts a regex or is division
                regex_keywords = {
                    'return', 'case', 'typeof', 'delete', 'void', 'throw', 
                    'yield', 'await', 'in', 'instanceof', 'new', 'else'
                }
                regex_prev_chars = set('([{:;,!?&|^~+-*%=>') # Note: '<' excluded due to JSX
                
                is_regex = False
                if not prev or prev in regex_prev_chars or prev in regex_keywords:
                    is_regex = True
                
                if is_regex:
                    state = IN_REGEX
                    output.append(ch)
                    last_token = '/'
                    current_token = []
                    i += 1
                    continue
                else:
                    output.append(ch)
                    last_token = '/'
                    current_token = []
                    i += 1
                    continue
            else:
                output.append(ch)
                if ch.isalnum() or ch in '$_':
                    current_token.append(ch)
                else:
                    if current_token:
                        last_token = "".join(current_token)
                        current_token = []
                    if not ch.isspace():
                        last_token = ch
                i += 1
                continue

        elif state == IN_SINGLE_QUOTE:
            output.append(ch)
            if ch == '\\' and i + 1 < length:
                output.append(content[i + 1])
                i += 2
                continue
            elif ch == "'":
                state = NORMAL
                last_token = "'"
            i += 1
            continue

        elif state == IN_DOUBLE_QUOTE:
            output.append(ch)
            if ch == '\\' and i + 1 < length:
                output.append(content[i + 1])
                i += 2
                continue
            elif ch == '"':
                state = NORMAL
                last_token = '"'
            i += 1
            continue

        elif state == IN_TEMPLATE:
            output.append(ch)
            if ch == '\\' and i + 1 < length:
                output.append(content[i + 1])
                i += 2
                continue
            elif ch == '$' and next_ch == '{':
                output.append(next_ch)
                i += 2
                template_stack.append(1)
                state = NORMAL # Switch to code inside ${}
                last_token = '{'
                current_token = []
                continue
            elif ch == '`':
                state = NORMAL
                last_token = '`'
                current_token = []
            i += 1
            continue

        elif state == IN_REGEX:
            output.append(ch)
            if ch == '\\' and i + 1 < length:
                output.append(content[i + 1])
                i += 2
                continue
            elif ch == '[': # Character class inside regex like [/*]
                i += 1
                while i < length and content[i] != ']':
                    output.append(content[i])
                    if content[i] == '\\' and i + 1 < length:
                        output.append(content[i + 1])
                        i += 1
                    i += 1
                if i < length:
                    output.append(content[i])
                    i += 1
                continue
            elif ch == '/':
                state = NORMAL
                last_token = '/'
                current_token = []
            i += 1
            continue

    cleaned_result = "".join(output)
    
    # Post-process whitespace: remove trailing whitespace and consecutive empty lines
    lines = cleaned_result.split('\n')
    cleaned_lines = []
    consecutive_empty = 0
    for line in lines:
        stripped = line.rstrip()
        if not stripped:
            consecutive_empty += 1
            if consecutive_empty <= 1:
                cleaned_lines.append('')
        else:
            consecutive_empty = 0
            cleaned_lines.append(stripped)
            
    final_cleaned = '\n'.join(cleaned_lines)
    if not final_cleaned.endswith('\n'):
        final_cleaned += '\n'
        
    return final_cleaned, found_comments

def get_target_files(directories: List[str]) -> List[str]:
    extensions = {'.ts', '.tsx', '.js', '.mjs'}
    excluded_dirs = {'node_modules', 'dist', '.git', '.release'}
    
    target_files = []
    for d in directories:
        if not os.path.exists(d):
            continue
        for root, dirs, files in os.walk(d):
            dirs[:] = [dir_name for dir_name in dirs if dir_name not in excluded_dirs]
            for file in sorted(files):
                ext = os.path.splitext(file)[1]
                if ext in extensions:
                    target_files.append(os.path.join(root, file))
    return sorted(target_files)

def main():
    parser = argparse.ArgumentParser(description="Find and strip comments from TS/TSX files.")
    parser.add_argument('--scan', action='store_true', help="Scan and list all found comments without modifying files.")
    parser.add_argument('--clean', action='store_true', help="Strip all comments from files.")
    parser.add_argument('--path', nargs='+', default=['apps', 'packages', 'tests'], help="Target directories to scan.")
    
    args = parser.parse_args()
    
    if not args.scan and not args.clean:
        print("Please specify either --scan or --clean (or both). Run with --help for options.")
        sys.exit(1)
        
    files = get_target_files(args.path)
    print(f"📁 Taranacak toplam kaynak dosya sayısı: {len(files)}")
    
    total_comments = 0
    files_with_comments = 0
    
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"⚠️ Dosya okunamadı: {file_path}: {e}")
            continue
            
        cleaned, comments = tokenize_and_strip(content)
        
        if comments:
            files_with_comments += 1
            total_comments += len(comments)
            if args.scan:
                print(f"\n📄 {file_path} ({len(comments)} yorum)")
                for line_no, c_type, c_text in comments[:5]:
                    preview = c_text.replace('\n', ' ')
                    if len(preview) > 60:
                        preview = preview[:57] + '...'
                    print(f"   [Satır {line_no}] ({c_type}): {preview}")
                if len(comments) > 5:
                    print(f"   ... ve {len(comments) - 5} yorum daha")
                    
        if args.clean and comments:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(cleaned)
                
    print("\n" + "="*50)
    print(f"📊 Özet Rapor:")
    print(f"   Taranan dosya: {len(files)}")
    print(f"   Yorum içeren dosya: {files_with_comments}")
    print(f"   Toplam yorum adedi: {total_comments}")
    if args.clean:
        print(f"✅ {files_with_comments} dosyadaki {total_comments} yorum başarıyla temizlendi!")
    print("="*50)

if __name__ == '__main__':
    main()
