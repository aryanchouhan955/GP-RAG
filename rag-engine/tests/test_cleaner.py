import pytest
from app.ingestion.cleaner import clean_text

def test_clean_text_empty():
    assert clean_text("") == ""
    assert clean_text(None) == ""

def test_clean_text_whitespace():
    assert clean_text("   hello   ") == "hello"

def test_clean_text_multiple_spaces():
    assert clean_text("hello     world") == "hello world"
    assert clean_text("hello \t world") == "hello world"

def test_clean_text_newlines():
    assert clean_text("hello\n\n\nworld") == "hello\n\nworld"
    assert clean_text("hello\n\n\n\n\nworld") == "hello\n\nworld"
    assert clean_text("hello\nworld") == "hello\nworld"

def test_clean_text_combination():
    assert clean_text("  hello \t   world \n\n\n \n foo  ") == "hello world\n\nfoo"
