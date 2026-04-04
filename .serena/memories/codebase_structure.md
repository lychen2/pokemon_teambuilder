# Codebase Structure

## Directory Layout
```
/
├── app.py                    # Main Flask application (single file backend)
├── pokedex.json             # Complete Pokémon database (~482KB)
├── forms_index.json         # Sprite index mappings
├── ban_presets.json         # Predefined ban lists
├── CLAUDE.md               # Development documentation
├── templates/
│   └── index.html          # Single-page application UI
├── static/
│   ├── css/
│   │   └── style.css       # Modern responsive styling
│   ├── js/
│   │   └── script.js       # Client-side logic (~800 lines)
│   ├── pokemonicons-sheet.png  # Pokémon sprite sheet
│   └── itemicons-sheet.png     # Item sprite sheet
└── __pycache__/            # Python bytecode cache
```

## Key Backend Components (app.py)

### Core Functions
- `calculate_resistance()`: Type effectiveness calculations
- `calculate_coverage()`: Offensive type analysis  
- `recommend_pokemon()`: AI recommendation algorithm
- `get_pokemon_list()`: Filtered Pokémon data retrieval

### API Routes
- `GET /`: Main application page
- `GET /pokemon`: Pokémon list with sprite data
- `POST /calculate`: Type effectiveness analysis
- `POST /team/analyze`: Team composition analysis
- `POST /team/recommend`: AI recommendations
- `POST /ban`: Ban list management
- `POST /ban/preset/<name>`: Apply ban presets

### Data Structures
- `TYPE_EFFECTIVENESS`: 18x18 type matchup matrix
- `TYPES`: List of all Pokémon types
- `TYPE_MAPPING`: Chinese to English type translations
- `banned_pokemon`: Global set of banned Pokémon names
- `ban_presets`: Dictionary of preset ban configurations

## Frontend Architecture (script.js)

### State Management
- `selectedTypes[]`: Currently selected types for calculator
- `currentTeam[]`: 6-slot team composition
- `pokemonList[]`: Cached Pokémon data
- `bannedPokemon`: Set of banned Pokémon names

### Key Functions
- `displayPokemonList()`: Renders Pokémon grid with sprites
- `updateTeamDisplay()`: Updates 6-slot team interface
- `displayRecommendations()`: Shows AI-generated suggestions
- `getSpritePosition()`: Calculates sprite coordinates