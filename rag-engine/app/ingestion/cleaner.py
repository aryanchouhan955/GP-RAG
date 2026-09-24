import re

def clean_text(text: str) -> str:
    """
    Basic text cleaning utility.
    Handles:
    - Leading/trailing whitespace
    - Multiple consecutive spaces
    - Excessive blank lines
    """
    if not text:
        return ""
        
    # Remove leading/trailing spaces on each line
    text = re.sub(r'^[ \t]+|[ \t]+$', '', text, flags=re.MULTILINE)
    
    # Replace multiple spaces with a single space
    text = re.sub(r'[ \t]+', ' ', text)
    
    # Replace 3 or more consecutive newlines with exactly 2 newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Strip leading/trailing whitespace
    return text.strip()
