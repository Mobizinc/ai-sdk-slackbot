#!/usr/bin/env python3
"""
Update Standards Document
Updates the living standards document based on validation patterns and findings.
"""

import sys
import os
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict

def load_standards(standards_path: Path) -> str:
    """Load current standards document"""
    if standards_path.exists():
        return standards_path.read_text()
    return ""

def save_standards(standards_path: Path, content: str):
    """Save updated standards document"""
    standards_path.write_text(content)

def add_standard(standards_path: Path, standard: Dict) -> bool:
    """
    Add a new standard to the document
    
    Args:
        standards_path: Path to standards.md file
        standard: Dict with 'category', 'title', 'description', 'rationale'
        
    Returns:
        True if added, False if already exists
    """
    content = load_standards(standards_path)
    
    # Check if standard already exists (basic check on title)
    if standard['title'] in content:
        return False
    
    # Find the appropriate category section
    category = standard['category']
    category_header = f"## {category}"
    
    if category_header not in content:
        # Add new category
        content += f"\n\n{category_header}\n\n"
    
    # Add the standard
    new_standard = f"""
### {standard['title']}

**Standard**: {standard['description']}

**Rationale**: {standard['rationale']}

**Added**: {datetime.now().strftime('%Y-%m-%d')}

---
"""
    
    # Insert after category header
    insertion_point = content.find(category_header) + len(category_header)
    content = content[:insertion_point] + new_standard + content[insertion_point:]
    
    save_standards(standards_path, content)
    return True

def update_common_mistake(mistakes_path: Path, mistake: Dict) -> bool:
    """
    Add or update a common mistake entry
    
    Args:
        mistakes_path: Path to common_mistakes.md
        mistake: Dict with 'title', 'description', 'how_to_catch', 'remediation'
        
    Returns:
        True if added/updated
    """
    content = load_standards(mistakes_path)
    
    mistake_entry = f"""
## {mistake['title']}

**Description**: {mistake['description']}

**How to Catch**: {mistake['how_to_catch']}

**Remediation**: {mistake['remediation']}

**Last Updated**: {datetime.now().strftime('%Y-%m-%d')}

---
"""
    
    # Check if mistake already exists
    if f"## {mistake['title']}" in content:
        # Update existing entry (simple replacement)
        # Find start and end of this section
        start = content.find(f"## {mistake['title']}")
        end = content.find("\n---\n", start) + 5
        if end < start:  # If --- not found, go to next ## or end
            next_section = content.find("\n## ", start + 1)
            end = next_section if next_section != -1 else len(content)
        
        content = content[:start] + mistake_entry + content[end:]
    else:
        # Add new mistake
        content += mistake_entry
    
    save_standards(mistakes_path, content)
    return True

def analyze_patterns_and_suggest_standards(validation_history: List[Dict]) -> List[Dict]:
    """
    Analyze validation history and suggest new standards
    
    Args:
        validation_history: List of validation results
        
    Returns:
        List of suggested standards
    """
    suggestions = []
    
    # Count issue types
    issue_counts = {}
    for validation in validation_history:
        for issue in validation.get('critical_issues', []) + validation.get('warnings', []):
            issue_desc = issue.get('issue', '')
            issue_counts[issue_desc] = issue_counts.get(issue_desc, 0) + 1
    
    # If an issue appears 3+ times, suggest making it a standard
    for issue, count in issue_counts.items():
        if count >= 3:
            suggestions.append({
                'category': 'Automated Detection',
                'title': f'Prevent: {issue}',
                'description': f'All changes must be validated to ensure they do not trigger: {issue}',
                'rationale': f'This issue has occurred {count} times in recent validations, indicating a pattern that should be prevented.',
                'occurrences': count
            })
    
    return suggestions

def main():
    """CLI interface"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Update ServiceNow standards documents')
    parser.add_argument('--action', choices=['add-standard', 'add-mistake', 'analyze'],
                       required=True, help='Action to perform')
    parser.add_argument('--standards-path', type=Path,
                       default=Path(__file__).parent.parent / 'references' / 'standards.md',
                       help='Path to standards.md')
    parser.add_argument('--mistakes-path', type=Path,
                       default=Path(__file__).parent.parent / 'references' / 'common_mistakes.md',
                       help='Path to common_mistakes.md')
    parser.add_argument('--data', type=Path, help='JSON file with standard/mistake data')
    parser.add_argument('--history', type=Path, help='JSON file with validation history (for analyze)')
    
    args = parser.parse_args()
    
    try:
        if args.action == 'add-standard':
            if not args.data:
                print("Error: --data required")
                sys.exit(1)
            
            with open(args.data) as f:
                standard = json.load(f)
            
            added = add_standard(args.standards_path, standard)
            if added:
                print(f"✓ Added standard: {standard['title']}")
            else:
                print(f"Standard already exists: {standard['title']}")
        
        elif args.action == 'add-mistake':
            if not args.data:
                print("Error: --data required")
                sys.exit(1)
            
            with open(args.data) as f:
                mistake = json.load(f)
            
            update_common_mistake(args.mistakes_path, mistake)
            print(f"✓ Updated common mistake: {mistake['title']}")
        
        elif args.action == 'analyze':
            if not args.history:
                print("Error: --history required")
                sys.exit(1)
            
            with open(args.history) as f:
                history = json.load(f)
            
            suggestions = analyze_patterns_and_suggest_standards(history)
            
            if suggestions:
                print(f"\n📊 Analysis complete. Found {len(suggestions)} suggested standards:\n")
                for i, suggestion in enumerate(suggestions, 1):
                    print(f"{i}. {suggestion['title']}")
                    print(f"   Occurrences: {suggestion['occurrences']}")
                    print(f"   Rationale: {suggestion['rationale']}\n")
                
                # Optionally auto-add high-confidence suggestions
                for suggestion in suggestions:
                    if suggestion['occurrences'] >= 5:
                        add_standard(args.standards_path, suggestion)
                        print(f"✓ Auto-added standard (5+ occurrences): {suggestion['title']}")
            else:
                print("No new standards suggested based on current data")
    
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
