# Task Completion Guidelines

## When a Task is Completed

### 1. Manual Testing Required
Since there are no automated tests, manually verify functionality by:
- Running `python app.py` and accessing http://localhost:5000
- Testing all three modes: Type Calculator, Team Builder, Ban Management
- Verifying API endpoints return correct JSON responses
- Checking UI interactions work properly

### 2. No Automated Linting or Formatting
- **No linting tools configured** (no flake8, pylint, mypy)
- **No formatting tools** (no black, autopep8)
- **Manual code review required** for style consistency
- Follow existing code patterns and Chinese docstring conventions

### 3. No Build Process
- **No compilation step needed** - direct Python execution
- **No dependency installation** - uses standard library only
- **No distribution packaging** - single-file deployment

### 4. Deployment Checklist
- Ensure all JSON data files are present (`pokedex.json`, `forms_index.json`, `ban_presets.json`)
- Verify sprite files exist in `static/` directory
- Check that Flask debug mode is appropriate for environment
- Test all API endpoints manually with curl or browser dev tools

### 5. Code Quality Checks
- Verify Chinese UI text displays correctly
- Check sprite coordinate calculations for new Pokémon
- Ensure type effectiveness calculations are accurate
- Test ban list functionality with preset loading