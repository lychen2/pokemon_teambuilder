# Code Style and Conventions

## Python Code Style
- **Docstrings**: Chinese language docstrings using triple quotes
- **Variable naming**: snake_case for variables and functions
- **Constants**: UPPER_CASE for global constants
- **Function naming**: Descriptive English names (e.g., `calculate_resistance`, `get_pokemon_list`)

## Code Patterns
- Heavy use of **list comprehensions** and **dictionary operations**
- **Flask route decorators** with clear HTTP method specifications
- **JSON request/response format** for all API endpoints
- **Error handling** with try/catch and JSON error responses
- **Global state management** using module-level variables

## Frontend Conventions
- **Chinese UI text** with English data mappings via TYPE_MAPPING
- **Modal-based interactions** with event delegation
- **CSS classes** follow kebab-case naming (e.g., `pokemon-item`, `team-slot`)
- **JavaScript functions** use camelCase naming
- **Sprite positioning** calculated dynamically using background-position CSS

## File Organization
- **Single-file backend**: All Flask logic in `app.py`
- **Static assets**: Organized in `static/` with `css/`, `js/` subdirectories
- **Templates**: Single HTML file in `templates/index.html`
- **Data files**: JSON format in project root

## API Design
- **RESTful endpoints** with clear resource naming
- **Consistent JSON structure** for requests and responses
- **Error responses** include `error` field with descriptive messages
- **Success responses** include `success: true` field