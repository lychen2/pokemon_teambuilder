# Suggested Commands

## Development Commands

### Running the Application
```bash
python app.py
```
Starts the Flask development server on port 5000 with debug mode enabled.

### Basic File Operations
```bash
# List files and directories
ls -la

# View file contents
cat filename

# Search for patterns in files
grep -r "pattern" .

# Find files by name
find . -name "*.py"
```

### Git Operations
```bash
# Check status
git status

# Add changes
git add .

# Commit changes
git commit -m "message"

# View commit history
git log --oneline
```

## Important Notes
- **No package manager**: Application uses only Python standard library
- **No testing framework**: No unit tests or test runners configured
- **No linting tools**: No pylint, flake8, or mypy configuration
- **No requirements.txt**: All dependencies are built-in Python modules
- **No build process**: Direct execution of Python file